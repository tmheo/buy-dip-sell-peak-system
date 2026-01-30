/**
 * 결과 분석 모듈
 * SPEC-PERF-001: REQ-F05
 *
 * 최적화 결과를 분석하고 순위를 매깁니다.
 * - 베이스라인 대비 개선율 계산
 * - 전략 점수 기준 내림차순 순위 결정
 * - 최적화 요약 통계 생성
 */
import Decimal from "decimal.js";

import type {
  BacktestMetrics,
  RankedCandidate,
  OptimizationResult,
  OptimizationSummary,
  SimilarityParams,
} from "./types";

// ============================================================
// 개선율 계산
// ============================================================

/**
 * 순위별 후보 객체 생성
 * REQ-F05: 베이스라인 대비 개선 정보를 포함한 후보 객체 생성
 *
 * @param rank - 순위 (1부터 시작)
 * @param params - 유사도 파라미터
 * @param metrics - 백테스트 결과 메트릭
 * @param baseline - 베이스라인 메트릭 (비교 기준)
 * @returns 순위별 후보 객체
 *
 * 개선율 계산:
 * - returnRate: candidate.returnRate - baseline.returnRate
 * - mdd: candidate.mdd - baseline.mdd (음수가 덜하면 개선)
 * - strategyScore: candidate.strategyScore - baseline.strategyScore
 *
 * @example
 * const candidate = createRankedCandidate(
 *   1,
 *   { weights: [0.3, 0.45, 0.08, 0.05, 0.12], tolerances: [42, 85, 5.2, 35, 32] },
 *   { returnRate: 0.52, mdd: -0.16, strategyScore: 42.15, totalCycles: 5, winRate: 0.8 },
 *   { returnRate: 0.45, mdd: -0.18, strategyScore: 38.72, totalCycles: 4, winRate: 0.75 }
 * );
 * // candidate.improvement.returnRate = 0.07 (7%p 개선)
 * // candidate.improvement.mdd = 0.02 (MDD가 2%p 개선, 덜 손실)
 * // candidate.improvement.strategyScore = 3.43 (점수 3.43 개선)
 */
export function createRankedCandidate(
  rank: number,
  params: SimilarityParams,
  metrics: BacktestMetrics,
  baseline: BacktestMetrics
): RankedCandidate {
  // Decimal.js를 사용하여 정밀한 차이 계산
  const returnRateImprovement = new Decimal(metrics.returnRate)
    .sub(baseline.returnRate)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
    .toNumber();

  // MDD 개선: candidate.mdd - baseline.mdd
  // 음수가 덜하면 개선 (예: -0.16 - (-0.18) = 0.02, 양수면 개선)
  const mddImprovement = new Decimal(metrics.mdd)
    .sub(baseline.mdd)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
    .toNumber();

  const strategyScoreImprovement = new Decimal(metrics.strategyScore)
    .sub(baseline.strategyScore)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
    .toNumber();

  return {
    rank,
    params,
    metrics,
    improvement: {
      returnRate: returnRateImprovement,
      mdd: mddImprovement,
      strategyScore: strategyScoreImprovement,
    },
  };
}

// ============================================================
// 요약 통계 생성
// ============================================================

/**
 * 최적화 요약 통계 생성
 * REQ-F05: 전체 최적화 실행의 요약 정보 생성
 *
 * @param totalCombinations - 탐색한 총 파라미터 조합 수
 * @param executionTimeMs - 실행 시간 (밀리초)
 * @param baseline - 베이스라인 메트릭
 * @param bestCandidate - 최고 성능 후보
 * @returns 최적화 요약 객체
 *
 * 개선율 계산:
 * improvementPercent = (best.strategyScore - baseline.strategyScore) / baseline.strategyScore * 100
 *
 * @example
 * const summary = createOptimizationSummary(
 *   80,
 *   245000,
 *   { returnRate: 0.45, mdd: -0.18, strategyScore: 38.72, totalCycles: 4, winRate: 0.75 },
 *   bestCandidate  // strategyScore: 42.15
 * );
 * // summary.improvementPercent = (42.15 - 38.72) / 38.72 * 100 ≈ 8.86%
 */
export function createOptimizationSummary(
  totalCombinations: number,
  executionTimeMs: number,
  baseline: BacktestMetrics,
  bestCandidate: RankedCandidate
): OptimizationSummary {
  // 베이스라인 전략 점수가 0인 경우 방어적 처리
  const baselineScore = baseline.strategyScore;
  const bestScore = bestCandidate.metrics.strategyScore;

  let improvementPercent: number;
  if (baselineScore === 0) {
    // 베이스라인 점수가 0이면 개선율 계산 불가, 0으로 처리
    improvementPercent = 0;
  } else {
    // Decimal.js를 사용하여 정밀한 개선율 계산
    // (best - baseline) / baseline * 100
    improvementPercent = new Decimal(bestScore)
      .sub(baselineScore)
      .div(baselineScore)
      .mul(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  return {
    totalCombinations,
    executionTimeMs,
    baselineScore,
    bestScore,
    improvementPercent,
  };
}

// ============================================================
// 결과 분석
// ============================================================

/**
 * 최적화 결과 분석
 * REQ-F05: 베이스라인 대비 결과를 분석하고 순위 결정
 *
 * @param baseline - 베이스라인 (현재 하드코딩된 파라미터) 백테스트 결과
 * @param candidates - 테스트한 파라미터 조합과 결과 배열
 * @param executionTimeMs - 전체 실행 시간 (밀리초, 기본값: 0)
 * @returns 전체 최적화 결과
 *
 * 처리 과정:
 * 1. 전략 점수 기준 내림차순 정렬
 * 2. 각 후보에 대해 베이스라인 대비 개선율 계산
 * 3. 순위 부여 (1부터 시작)
 * 4. 최고 성능 후보 식별 (rank 1)
 * 5. 요약 통계 생성
 *
 * @example
 * const result = analyzeResults(
 *   baselineMetrics,
 *   [
 *     { params: params1, metrics: metrics1 },
 *     { params: params2, metrics: metrics2 },
 *     // ...
 *   ],
 *   245000  // 실행 시간 245초
 * );
 * // result.bestCandidate는 가장 높은 전략 점수를 가진 후보
 * // result.candidates는 전략 점수 내림차순으로 정렬됨
 */
export function analyzeResults(
  baseline: BacktestMetrics,
  candidates: Array<{ params: SimilarityParams; metrics: BacktestMetrics }>,
  executionTimeMs: number = 0
): OptimizationResult {
  // 빈 배열 처리
  if (candidates.length === 0) {
    // 후보가 없으면 더미 결과 반환
    const dummyCandidate: RankedCandidate = {
      rank: 1,
      params: {
        weights: [0.2, 0.2, 0.2, 0.2, 0.2],
        tolerances: [50, 100, 10, 50, 40],
      },
      metrics: baseline,
      improvement: {
        returnRate: 0,
        mdd: 0,
        strategyScore: 0,
      },
    };

    return {
      baseline,
      candidates: [dummyCandidate],
      bestCandidate: dummyCandidate,
      summary: createOptimizationSummary(0, executionTimeMs, baseline, dummyCandidate),
    };
  }

  // 전략 점수 기준 내림차순 정렬 (높은 점수가 1위)
  // Decimal.js를 사용하여 정밀한 비교 수행
  const sortedCandidates = [...candidates].sort((a, b) => {
    const scoreA = new Decimal(a.metrics.strategyScore);
    const scoreB = new Decimal(b.metrics.strategyScore);
    // 내림차순: B - A
    return scoreB.sub(scoreA).toNumber();
  });

  // 순위별 후보 객체 생성
  const rankedCandidates: RankedCandidate[] = sortedCandidates.map((candidate, index) =>
    createRankedCandidate(
      index + 1, // 순위는 1부터 시작
      candidate.params,
      candidate.metrics,
      baseline
    )
  );

  // 최고 성능 후보 (rank 1)
  const bestCandidate = rankedCandidates[0];

  // 요약 통계 생성
  const summary = createOptimizationSummary(
    candidates.length,
    executionTimeMs,
    baseline,
    bestCandidate
  );

  return {
    baseline,
    candidates: rankedCandidates,
    bestCandidate,
    summary,
  };
}
