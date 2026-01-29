/**
 * RPM 유사도 계산 모듈
 * SPEC-RPM-EXPERIMENT-001 TASK-007
 *
 * 가중합 방식 유사도 계산:
 * - 각 지표별 점수 = 배점 × (1 - |기준값 - 비교값| / 허용오차)
 * - 유사도 점수 = Σ(각 지표별 점수)
 * - 범위: -500 ~ +500점 (이론적 범위: -470 ~ +470)
 */
import Decimal from "decimal.js";

import type { RpmIndicators, RpmSimilarityConfig, RpmSimilarityResult } from "./types";

/** 최소 과거 간격 (기준일로부터 최소 40일 이전) */
export const MIN_PAST_GAP_DAYS = 40;

/** 유사 구간 간 최소 간격 (연속 선택 방지) */
export const MIN_PERIOD_GAP_DAYS = 20;

/**
 * 기본 RPM 유사도 설정
 * 총 배점: 470점 (120 + 80 + 80 + 50 + 50 + 50 + 20 + 20)
 */
export const DEFAULT_RPM_CONFIG: RpmSimilarityConfig = {
  weights: {
    rsi14: { maxScore: 120, tolerance: 30 },
    disparity20: { maxScore: 80, tolerance: 10 },
    roc10: { maxScore: 80, tolerance: 15 },
    macdHistogram: { maxScore: 50, tolerance: 2.0 },
    bollingerWidth: { maxScore: 50, tolerance: 0.3 },
    atrPercent: { maxScore: 50, tolerance: 5 },
    disparity60: { maxScore: 20, tolerance: 20 },
    stochasticK: { maxScore: 20, tolerance: 30 },
  },
};

/**
 * 단일 지표 유사도 점수 계산
 * 점수 = 배점 × (1 - |기준값 - 비교값| / 허용오차)
 *
 * 범위:
 * - 차이가 0이면: maxScore (최대 점수)
 * - 차이가 tolerance이면: 0
 * - 차이가 tolerance보다 크면: 음수
 *
 * @param referenceValue - 기준값
 * @param compareValue - 비교값
 * @param maxScore - 배점 (최대 점수)
 * @param tolerance - 허용 오차
 * @returns 지표 점수 (음수 가능)
 */
export function calculateIndicatorScore(
  referenceValue: number,
  compareValue: number,
  maxScore: number,
  tolerance: number
): number {
  const diff = new Decimal(referenceValue).minus(compareValue).abs();
  const ratio = diff.div(tolerance);
  // 점수 = 배점 × (1 - diff / tolerance)
  const score = new Decimal(maxScore).mul(new Decimal(1).minus(ratio));
  return score.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * RPM 유사도 점수 계산 (8개 지표 가중합)
 *
 * @param reference - 기준 지표
 * @param compare - 비교 지표
 * @param config - RPM 설정 (기본값: DEFAULT_RPM_CONFIG)
 * @returns 유사도 점수 (-500 ~ +500)
 */
export function calculateRpmSimilarity(
  reference: RpmIndicators,
  compare: RpmIndicators,
  config: RpmSimilarityConfig = DEFAULT_RPM_CONFIG
): number {
  let totalScore = new Decimal(0);

  // 1. RSI 14
  const rsi14Score = calculateIndicatorScore(
    reference.rsi14,
    compare.rsi14,
    config.weights.rsi14.maxScore,
    config.weights.rsi14.tolerance
  );
  totalScore = totalScore.plus(rsi14Score);

  // 2. 이격도 20
  const disparity20Score = calculateIndicatorScore(
    reference.disparity20,
    compare.disparity20,
    config.weights.disparity20.maxScore,
    config.weights.disparity20.tolerance
  );
  totalScore = totalScore.plus(disparity20Score);

  // 3. ROC 10
  const roc10Score = calculateIndicatorScore(
    reference.roc10,
    compare.roc10,
    config.weights.roc10.maxScore,
    config.weights.roc10.tolerance
  );
  totalScore = totalScore.plus(roc10Score);

  // 4. MACD Histogram
  const macdScore = calculateIndicatorScore(
    reference.macdHistogram,
    compare.macdHistogram,
    config.weights.macdHistogram.maxScore,
    config.weights.macdHistogram.tolerance
  );
  totalScore = totalScore.plus(macdScore);

  // 5. 볼린저밴드 폭
  const bollingerScore = calculateIndicatorScore(
    reference.bollingerWidth,
    compare.bollingerWidth,
    config.weights.bollingerWidth.maxScore,
    config.weights.bollingerWidth.tolerance
  );
  totalScore = totalScore.plus(bollingerScore);

  // 6. ATR %
  const atrScore = calculateIndicatorScore(
    reference.atrPercent,
    compare.atrPercent,
    config.weights.atrPercent.maxScore,
    config.weights.atrPercent.tolerance
  );
  totalScore = totalScore.plus(atrScore);

  // 7. 이격도 60
  const disparity60Score = calculateIndicatorScore(
    reference.disparity60,
    compare.disparity60,
    config.weights.disparity60.maxScore,
    config.weights.disparity60.tolerance
  );
  totalScore = totalScore.plus(disparity60Score);

  // 8. 스토캐스틱 K
  const stochasticScore = calculateIndicatorScore(
    reference.stochasticK,
    compare.stochasticK,
    config.weights.stochasticK.maxScore,
    config.weights.stochasticK.tolerance
  );
  totalScore = totalScore.plus(stochasticScore);

  return totalScore.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 기준일 인덱스 계산 (날짜 문자열 기준)
 * @param referenceDate - 기준 날짜 (YYYY-MM-DD)
 * @param historicalData - 과거 데이터 배열
 * @returns 기준일 인덱스 또는 -1 (찾지 못함)
 */
function findReferenceDateIndex(
  referenceDate: string,
  historicalData: Array<{ date: string; indicators: RpmIndicators }>
): number {
  return historicalData.findIndex((d) => d.date === referenceDate);
}

/**
 * 유사 구간 검색 (Top N, 최소 간격 보장)
 *
 * @param referenceDate - 기준 날짜 (YYYY-MM-DD)
 * @param referenceIndicators - 기준 지표
 * @param historicalData - 과거 데이터 배열 (날짜 오름차순 정렬)
 * @param topN - 반환할 유사 구간 수 (기본값: 10)
 * @param minGap - 유사 구간 간 최소 간격 (기본값: 20)
 * @param minDaysBack - 기준일로부터 최소 과거 간격 (기본값: 40)
 * @param config - RPM 설정 (기본값: DEFAULT_RPM_CONFIG)
 * @returns 유사도 높은 순으로 정렬된 결과 배열
 */
export function findRpmSimilarPeriods(
  referenceDate: string,
  referenceIndicators: RpmIndicators,
  historicalData: Array<{ date: string; indicators: RpmIndicators }>,
  topN: number = 10,
  minGap: number = MIN_PERIOD_GAP_DAYS,
  minDaysBack: number = MIN_PAST_GAP_DAYS,
  config: RpmSimilarityConfig = DEFAULT_RPM_CONFIG
): RpmSimilarityResult[] {
  // 기준일 인덱스 찾기
  const refIndex = findReferenceDateIndex(referenceDate, historicalData);
  if (refIndex === -1) {
    // 기준일이 데이터에 없으면 가장 최근 데이터 인덱스 사용
    // (기준일이 미래이거나 데이터 범위 밖일 수 있음)
    return [];
  }

  // 최대 검색 인덱스 (기준일 - minDaysBack)
  const maxSearchIndex = refIndex - minDaysBack;
  if (maxSearchIndex < 0) {
    // 검색할 과거 데이터가 충분하지 않음
    return [];
  }

  // 1. 모든 과거 날짜에 대해 유사도 계산
  const similarities: Array<{
    index: number;
    date: string;
    indicators: RpmIndicators;
    score: number;
  }> = [];

  for (let i = 0; i <= maxSearchIndex; i++) {
    const historical = historicalData[i];
    const score = calculateRpmSimilarity(referenceIndicators, historical.indicators, config);

    similarities.push({
      index: i,
      date: historical.date,
      indicators: historical.indicators,
      score,
    });
  }

  // 2. 유사도 점수 내림차순 정렬 (높은 점수 = 더 유사)
  similarities.sort((a, b) => b.score - a.score);

  // 3. 최소 간격을 유지하면서 상위 N개 선택
  const selectedPeriods: RpmSimilarityResult[] = [];

  for (const result of similarities) {
    // 이미 선택된 구간들과의 간격 확인
    const isTooClose = selectedPeriods.some((selected) => {
      const gap = Math.abs(selected.dateIndex - result.index);
      return gap < minGap;
    });

    if (!isTooClose) {
      selectedPeriods.push({
        date: result.date,
        dateIndex: result.index,
        indicators: result.indicators,
        similarityScore: result.score,
        scoreDifference: 0, // 자기 자신과의 차이는 0
      });

      if (selectedPeriods.length >= topN) {
        break;
      }
    }
  }

  return selectedPeriods;
}

/**
 * 두 날짜의 유사도 점수 차이 계산
 *
 * @param indicators1 - 첫 번째 지표
 * @param indicators2 - 두 번째 지표
 * @param config - RPM 설정
 * @returns 점수 차이 (절대값)
 */
export function calculateScoreDifference(
  indicators1: RpmIndicators,
  indicators2: RpmIndicators,
  config: RpmSimilarityConfig = DEFAULT_RPM_CONFIG
): number {
  const score1 = calculateRpmSimilarity(indicators1, indicators1, config); // 자기 자신 = 최대 점수
  const score2 = calculateRpmSimilarity(indicators1, indicators2, config);
  return new Decimal(score1).minus(score2).abs().toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 총 배점 계산
 *
 * @param config - RPM 설정
 * @returns 총 배점
 */
export function getTotalMaxScore(config: RpmSimilarityConfig = DEFAULT_RPM_CONFIG): number {
  return Object.values(config.weights).reduce((sum, w) => sum + w.maxScore, 0);
}
