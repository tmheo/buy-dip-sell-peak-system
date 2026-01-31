/**
 * 파라미터 생성 모듈
 * SPEC-PERF-001: REQ-F02, REQ-F03, CON-02
 */
import Decimal from "decimal.js";

import type { SimilarityParams, MetricWeights, MetricTolerances } from "./types";
import { TOLERANCE_RANGES, WEIGHT_RANGE, VARIATION_RANGE } from "./types";

/** 가중치 합 검증 허용 오차 */
const WEIGHT_SUM_TOLERANCE = 1e-10;

/** 메트릭 개수 (5개 지표) */
const METRIC_COUNT = 5;

/** 파라미터 생성 최대 재시도 횟수 */
const MAX_RETRY_COUNT = 100;

/** 가중치 배열을 합이 1.0이 되도록 정규화 */
export function normalizeWeights(weights: number[]): MetricWeights {
  if (weights.length !== METRIC_COUNT) {
    throw new Error(`가중치 배열은 ${METRIC_COUNT}개 요소가 필요합니다. 현재: ${weights.length}개`);
  }

  const decimalWeights = weights.map((w) => new Decimal(w));
  const sum = decimalWeights.reduce((acc, w) => acc.add(w), new Decimal(0));

  // 합이 0이면 균등 분배
  if (sum.isZero()) {
    const equalWeight = new Decimal(1).div(METRIC_COUNT).toNumber();
    return Array(METRIC_COUNT).fill(equalWeight) as MetricWeights;
  }

  // 정규화 및 최소값 보장
  const minWeight = new Decimal(WEIGHT_RANGE.min);
  const normalized = decimalWeights.map((w) => w.div(sum));

  const adjustedWeights: Decimal[] = [];
  let totalDeficit = new Decimal(0);
  let countAboveMin = 0;

  for (const w of normalized) {
    if (w.lessThan(minWeight)) {
      adjustedWeights.push(minWeight);
      totalDeficit = totalDeficit.add(minWeight.sub(w));
    } else {
      adjustedWeights.push(w);
      countAboveMin++;
    }
  }

  // 부족분을 최소값 이상인 가중치에서 균등 차감
  if (totalDeficit.greaterThan(0) && countAboveMin > 0) {
    const deficitPerWeight = totalDeficit.div(countAboveMin);
    for (let i = 0; i < adjustedWeights.length; i++) {
      if (adjustedWeights[i].greaterThan(minWeight)) {
        adjustedWeights[i] = Decimal.max(adjustedWeights[i].sub(deficitPerWeight), minWeight);
      }
    }
  }

  // 최종 정규화
  const finalSum = adjustedWeights.reduce((acc, w) => acc.add(w), new Decimal(0));
  const result = adjustedWeights.map((w) =>
    w.div(finalSum).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toNumber()
  );

  // 반올림 오차 보정
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

/** 유사도 파라미터의 유효성 검증 */
export function validateParams(params: SimilarityParams): boolean {
  const { weights, tolerances } = params;

  if (weights.length !== METRIC_COUNT || tolerances.length !== METRIC_COUNT) {
    return false;
  }

  // 가중치 합 검증 (1.0 ± 1e-10)
  const weightSum = weights.reduce((acc, w) => new Decimal(acc).add(w).toNumber(), 0);
  if (Math.abs(weightSum - 1.0) > WEIGHT_SUM_TOLERANCE) {
    return false;
  }

  // 가중치 범위 검증
  const isWeightValid = weights.every((w) => w >= WEIGHT_RANGE.min && w <= WEIGHT_RANGE.max);
  if (!isWeightValid) {
    return false;
  }

  // 허용오차 범위 검증
  const isToleranceValid = tolerances.every((t, i) => {
    const range = TOLERANCE_RANGES[i];
    return t >= range.min && t <= range.max;
  });

  return isToleranceValid;
}

/** 지정된 범위 내의 랜덤 값 생성 */
function randomInRange(min: number, max: number): number {
  return new Decimal(min).add(new Decimal(max).sub(min).mul(Math.random())).toNumber();
}

/** 랜덤 가중치 배열 생성 (합 = 1.0 보장) */
function generateRandomWeights(): MetricWeights {
  const rawWeights = Array.from({ length: METRIC_COUNT }, () =>
    randomInRange(WEIGHT_RANGE.min, WEIGHT_RANGE.max)
  );
  return normalizeWeights(rawWeights);
}

/** 랜덤 허용오차 배열 생성 */
function generateRandomTolerances(): MetricTolerances {
  const tolerances = TOLERANCE_RANGES.map((range) =>
    new Decimal(randomInRange(range.min, range.max))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber()
  );
  return tolerances as MetricTolerances;
}

/** 지정된 개수의 랜덤 파라미터 조합 생성 */
export function generateRandomParams(count: number): SimilarityParams[] {
  const params: SimilarityParams[] = [];
  let retryCount = 0;

  while (params.length < count && retryCount < MAX_RETRY_COUNT) {
    const candidate: SimilarityParams = {
      weights: generateRandomWeights(),
      tolerances: generateRandomTolerances(),
    };

    if (validateParams(candidate)) {
      params.push(candidate);
      retryCount = 0;
    } else {
      retryCount++;
    }
  }

  if (params.length < count) {
    throw new Error(`유효한 파라미터 생성 실패: ${params.length}/${count}개만 생성됨`);
  }

  return params;
}

/** 값을 범위 내로 클램프 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 값에 +/-10% 변동 적용 후 범위 내로 클램프 */
function varyValue(baseValue: number, min: number, max: number): number {
  const base = new Decimal(baseValue);
  const variation = base.mul(VARIATION_RANGE);
  const varied = randomInRange(base.sub(variation).toNumber(), base.add(variation).toNumber());
  return clamp(varied, min, max);
}

/** 기존 파라미터를 기반으로 변형 파라미터 생성 (+/-10% 범위) */
export function generateVariations(base: SimilarityParams, count: number): SimilarityParams[] {
  const variations: SimilarityParams[] = [];
  let retryCount = 0;

  while (variations.length < count && retryCount < MAX_RETRY_COUNT) {
    // 가중치 변형
    const variedWeights = base.weights.map((w) => varyValue(w, WEIGHT_RANGE.min, WEIGHT_RANGE.max));
    const normalizedWeights = normalizeWeights(variedWeights);

    // 허용오차 변형
    const variedTolerances = base.tolerances.map((t, i) => {
      const range = TOLERANCE_RANGES[i];
      const varied = varyValue(t, range.min, range.max);
      return new Decimal(varied).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    }) as MetricTolerances;

    const candidate: SimilarityParams = {
      weights: normalizedWeights,
      tolerances: variedTolerances,
    };

    if (validateParams(candidate)) {
      variations.push(candidate);
      retryCount = 0;
    } else {
      retryCount++;
    }
  }

  if (variations.length < count) {
    throw new Error(`유효한 변형 생성 실패: ${variations.length}/${count}개만 생성됨`);
  }

  return variations;
}
