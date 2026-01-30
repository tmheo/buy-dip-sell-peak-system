/**
 * 파라미터 생성 모듈
 * SPEC-PERF-001: REQ-F02, REQ-F03, CON-02
 *
 * 유사도 계산을 위한 파라미터 조합을 생성합니다.
 * - 랜덤 파라미터 조합 생성
 * - 기존 파라미터 기반 변형 생성
 * - 가중치 정규화 및 검증
 */
import Decimal from "decimal.js";

import type { SimilarityParams, MetricWeights, MetricTolerances } from "./types";
import { TOLERANCE_RANGES, WEIGHT_RANGE, VARIATION_RANGE } from "./types";

// ============================================================
// 상수 정의
// ============================================================

/** 가중치 합 검증 허용 오차 (1e-10) */
const WEIGHT_SUM_TOLERANCE = 1e-10;

/** 메트릭 개수 (5개 지표) */
const METRIC_COUNT = 5;

// ============================================================
// 가중치 정규화
// ============================================================

/**
 * 가중치 배열을 합이 1.0이 되도록 정규화
 * Decimal.js를 사용하여 정밀한 계산 수행
 *
 * @param weights - 정규화할 가중치 배열 (5개 요소)
 * @returns 정규화된 가중치 튜플 (합 = 1.0)
 * @throws Error 가중치 배열이 5개가 아닌 경우
 *
 * @example
 * const normalized = normalizeWeights([0.3, 0.4, 0.1, 0.1, 0.1]);
 * // 합이 정확히 1.0이 됨
 */
export function normalizeWeights(weights: number[]): MetricWeights {
  if (weights.length !== METRIC_COUNT) {
    throw new Error(`가중치 배열은 ${METRIC_COUNT}개 요소가 필요합니다. 현재: ${weights.length}개`);
  }

  // 모든 값을 Decimal로 변환
  const decimalWeights = weights.map((w) => new Decimal(w));

  // 합계 계산
  let sum = new Decimal(0);
  for (const w of decimalWeights) {
    sum = sum.add(w);
  }

  // 합이 0이면 균등 분배
  if (sum.isZero()) {
    const equalWeight = new Decimal(1).div(METRIC_COUNT);
    return Array(METRIC_COUNT).fill(equalWeight.toNumber()) as MetricWeights;
  }

  // 정규화 (각 가중치 / 합계)
  const normalized = decimalWeights.map((w) => w.div(sum));

  // 최소값 보장 (0.01 이상)
  const minWeight = new Decimal(WEIGHT_RANGE.min);
  const adjustedWeights: Decimal[] = [];
  let totalDeficit = new Decimal(0);
  let countAboveMin = 0;

  // 1차 조정: 최소값 미만인 경우 최소값으로 설정
  for (const w of normalized) {
    if (w.lessThan(minWeight)) {
      adjustedWeights.push(minWeight);
      totalDeficit = totalDeficit.add(minWeight.sub(w));
    } else {
      adjustedWeights.push(w);
      countAboveMin++;
    }
  }

  // 2차 조정: 부족분을 최소값 이상인 가중치에서 균등 차감
  if (totalDeficit.greaterThan(0) && countAboveMin > 0) {
    const deficitPerWeight = totalDeficit.div(countAboveMin);
    for (let i = 0; i < adjustedWeights.length; i++) {
      if (adjustedWeights[i].greaterThan(minWeight)) {
        adjustedWeights[i] = adjustedWeights[i].sub(deficitPerWeight);
        // 차감 후에도 최소값 보장
        if (adjustedWeights[i].lessThan(minWeight)) {
          adjustedWeights[i] = minWeight;
        }
      }
    }
  }

  // 최종 정규화 (합이 정확히 1.0이 되도록)
  let finalSum = new Decimal(0);
  for (const w of adjustedWeights) {
    finalSum = finalSum.add(w);
  }

  const result = adjustedWeights.map((w) =>
    w.div(finalSum).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toNumber()
  );

  // 마지막 요소에서 반올림 오차 보정
  const resultSum = result.reduce((acc, v) => acc + v, 0);
  const diff = new Decimal(1).sub(resultSum);
  if (!diff.isZero()) {
    result[METRIC_COUNT - 1] = new Decimal(result[METRIC_COUNT - 1])
      .add(diff)
      .toDecimalPlaces(10, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  return result as MetricWeights;
}

// ============================================================
// 파라미터 검증
// ============================================================

/**
 * 유사도 파라미터의 유효성 검증
 *
 * @param params - 검증할 파라미터
 * @returns 유효한 경우 true, 그렇지 않으면 false
 *
 * 검증 항목:
 * - 가중치 합이 1.0 (허용 오차: 1e-10)
 * - 각 가중치가 [0.01, 0.5] 범위 내
 * - 각 허용오차가 지정된 범위 내
 *
 * @example
 * const isValid = validateParams({
 *   weights: [0.35, 0.4, 0.05, 0.07, 0.13],
 *   tolerances: [36, 90, 4.5, 40, 28]
 * });
 */
export function validateParams(params: SimilarityParams): boolean {
  const { weights, tolerances } = params;

  // 가중치 개수 검증
  if (weights.length !== METRIC_COUNT) {
    return false;
  }

  // 허용오차 개수 검증
  if (tolerances.length !== METRIC_COUNT) {
    return false;
  }

  // 가중치 합 검증 (1.0 ± 1e-10)
  const weightSum = weights.reduce((acc, w) => new Decimal(acc).add(w).toNumber(), 0);
  const sumDiff = Math.abs(weightSum - 1.0);
  if (sumDiff > WEIGHT_SUM_TOLERANCE) {
    return false;
  }

  // 각 가중치 범위 검증 [0.01, 0.5]
  for (const weight of weights) {
    if (weight < WEIGHT_RANGE.min || weight > WEIGHT_RANGE.max) {
      return false;
    }
  }

  // 각 허용오차 범위 검증
  for (let i = 0; i < METRIC_COUNT; i++) {
    const tolerance = tolerances[i];
    const range = TOLERANCE_RANGES[i];
    if (tolerance < range.min || tolerance > range.max) {
      return false;
    }
  }

  return true;
}

// ============================================================
// 랜덤 파라미터 생성
// ============================================================

/**
 * 지정된 범위 내의 랜덤 값 생성 (Decimal.js 사용)
 *
 * @param min - 최소값
 * @param max - 최대값
 * @returns min과 max 사이의 랜덤 값
 */
function randomInRange(min: number, max: number): number {
  const minDec = new Decimal(min);
  const maxDec = new Decimal(max);
  const range = maxDec.sub(minDec);
  return minDec.add(range.mul(Math.random())).toNumber();
}

/**
 * 랜덤 가중치 배열 생성 (합 = 1.0 보장)
 *
 * @returns 정규화된 랜덤 가중치 튜플
 */
function generateRandomWeights(): MetricWeights {
  // 각 가중치를 [0.01, 0.5] 범위에서 랜덤 생성
  const rawWeights: number[] = [];
  for (let i = 0; i < METRIC_COUNT; i++) {
    rawWeights.push(randomInRange(WEIGHT_RANGE.min, WEIGHT_RANGE.max));
  }

  // 정규화하여 합 = 1.0 보장
  return normalizeWeights(rawWeights);
}

/**
 * 랜덤 허용오차 배열 생성
 *
 * @returns 각 지표별 범위 내의 랜덤 허용오차 튜플
 */
function generateRandomTolerances(): MetricTolerances {
  const tolerances: number[] = [];
  for (let i = 0; i < METRIC_COUNT; i++) {
    const range = TOLERANCE_RANGES[i];
    const value = randomInRange(range.min, range.max);
    // 소수점 2자리로 반올림
    tolerances.push(new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber());
  }
  return tolerances as MetricTolerances;
}

/**
 * 지정된 개수의 랜덤 파라미터 조합 생성
 * REQ-F02: 최적화 실행 시 50개의 랜덤 파라미터 조합 생성
 *
 * @param count - 생성할 파라미터 조합 수 (기본: 50)
 * @returns 랜덤 생성된 파라미터 조합 배열
 *
 * 가중치 생성 규칙:
 * - 5개 값의 합이 1.0이 되도록 정규화
 * - 각 가중치 범위: 0.01 ~ 0.5
 *
 * 허용오차 생성 규칙:
 * - maSlope: 10 ~ 100
 * - disparity: 30 ~ 200
 * - RSI: 1 ~ 20
 * - ROC: 10 ~ 100
 * - volatility: 10 ~ 80
 *
 * @example
 * const randomParams = generateRandomParams(50);
 * console.log(randomParams.length); // 50
 * console.log(randomParams[0].weights.reduce((a, b) => a + b, 0)); // 1.0
 */
export function generateRandomParams(count: number): SimilarityParams[] {
  const params: SimilarityParams[] = [];

  for (let i = 0; i < count; i++) {
    const weights = generateRandomWeights();
    const tolerances = generateRandomTolerances();

    const candidate: SimilarityParams = { weights, tolerances };

    // 유효성 검증 (안전장치)
    if (validateParams(candidate)) {
      params.push(candidate);
    } else {
      // 유효하지 않은 경우 재시도 (드문 경우)
      i--;
    }
  }

  return params;
}

// ============================================================
// 변형 파라미터 생성
// ============================================================

/**
 * 값을 범위 내로 클램프
 *
 * @param value - 클램프할 값
 * @param min - 최소값
 * @param max - 최대값
 * @returns 범위 내로 제한된 값
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 기존 파라미터를 기반으로 변형 파라미터 생성
 * REQ-F03: 상위 3개 조합에 대해 각각 10개의 변형 생성
 *
 * @param base - 기준 파라미터
 * @param count - 생성할 변형 수 (기본: 10)
 * @returns 변형된 파라미터 조합 배열
 *
 * 변형 방식:
 * - 기존 값의 +/-10% 범위 내 무작위 조정
 * - 가중치는 변형 후 합이 1.0이 되도록 재정규화
 * - 허용오차는 지정된 범위 내로 클램프
 *
 * @example
 * const baseParams = {
 *   weights: [0.35, 0.4, 0.05, 0.07, 0.13],
 *   tolerances: [36, 90, 4.5, 40, 28]
 * };
 * const variations = generateVariations(baseParams, 10);
 * // 각 변형은 기존 값의 +/-10% 범위 내
 */
export function generateVariations(base: SimilarityParams, count: number): SimilarityParams[] {
  const variations: SimilarityParams[] = [];

  for (let i = 0; i < count; i++) {
    // 가중치 변형: +/-10% 범위 내 조정
    const variedWeights: number[] = [];
    for (let j = 0; j < METRIC_COUNT; j++) {
      const baseWeight = new Decimal(base.weights[j]);
      const variation = baseWeight.mul(VARIATION_RANGE);
      const minVar = baseWeight.sub(variation).toNumber();
      const maxVar = baseWeight.add(variation).toNumber();
      // 범위 내 랜덤 값 생성
      let newWeight = randomInRange(minVar, maxVar);
      // 가중치 범위 [0.01, 0.5] 내로 클램프
      newWeight = clamp(newWeight, WEIGHT_RANGE.min, WEIGHT_RANGE.max);
      variedWeights.push(newWeight);
    }

    // 가중치 재정규화 (합 = 1.0 보장)
    const normalizedWeights = normalizeWeights(variedWeights);

    // 허용오차 변형: +/-10% 범위 내 조정
    const variedTolerances: number[] = [];
    for (let j = 0; j < METRIC_COUNT; j++) {
      const baseTolerance = new Decimal(base.tolerances[j]);
      const variation = baseTolerance.mul(VARIATION_RANGE);
      const minVar = baseTolerance.sub(variation).toNumber();
      const maxVar = baseTolerance.add(variation).toNumber();
      // 범위 내 랜덤 값 생성
      let newTolerance = randomInRange(minVar, maxVar);
      // 허용오차 범위 내로 클램프
      const range = TOLERANCE_RANGES[j];
      newTolerance = clamp(newTolerance, range.min, range.max);
      // 소수점 2자리로 반올림
      newTolerance = new Decimal(newTolerance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      variedTolerances.push(newTolerance);
    }

    const candidate: SimilarityParams = {
      weights: normalizedWeights,
      tolerances: variedTolerances as MetricTolerances,
    };

    // 유효성 검증 (안전장치)
    if (validateParams(candidate)) {
      variations.push(candidate);
    } else {
      // 유효하지 않은 경우 재시도 (드문 경우)
      i--;
    }
  }

  return variations;
}
