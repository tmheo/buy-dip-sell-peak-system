/**
 * 결과 분석 모듈
 * SPEC-PERF-001: REQ-F05
 */
import Decimal from "decimal.js";

import type {
  BacktestMetrics,
  RankedCandidate,
  OptimizationResult,
  OptimizationSummary,
  SimilarityParams,
} from "./types";

/** 정밀한 차이 계산 (소수점 6자리 반올림) */
function calculateImprovement(current: number, baseline: number): number {
  return new Decimal(current).sub(baseline).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * 순위별 후보 객체 생성
 * 베이스라인 대비 개선 정보를 포함
 */
export function createRankedCandidate(
  rank: number,
  params: SimilarityParams,
  metrics: BacktestMetrics,
  baseline: BacktestMetrics
): RankedCandidate {
  return {
    rank,
    params,
    metrics,
    improvement: {
      returnRate: calculateImprovement(metrics.returnRate, baseline.returnRate),
      mdd: calculateImprovement(metrics.mdd, baseline.mdd),
      strategyScore: calculateImprovement(metrics.strategyScore, baseline.strategyScore),
    },
  };
}

/**
 * 최적화 요약 통계 생성
 * 개선율: (best - baseline) / baseline * 100
 */
export function createOptimizationSummary(
  totalCombinations: number,
  executionTimeMs: number,
  baseline: BacktestMetrics,
  bestCandidate: RankedCandidate
): OptimizationSummary {
  const baselineScore = baseline.strategyScore;
  const bestScore = bestCandidate.metrics.strategyScore;

  const improvementPercent =
    baselineScore === 0
      ? 0
      : new Decimal(bestScore)
          .sub(baselineScore)
          .div(baselineScore)
          .mul(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();

  return {
    totalCombinations,
    executionTimeMs,
    baselineScore,
    bestScore,
    improvementPercent,
  };
}

/** 빈 후보 배열 시 사용할 더미 후보 생성 */
function createDummyCandidate(baseline: BacktestMetrics): RankedCandidate {
  return {
    rank: 1,
    params: {
      weights: [0.2, 0.2, 0.2, 0.2, 0.2],
      tolerances: [50, 100, 10, 50, 40],
    },
    metrics: baseline,
    improvement: { returnRate: 0, mdd: 0, strategyScore: 0 },
  };
}

/**
 * 최적화 결과 분석
 * 전략 점수 기준 내림차순 정렬 후 순위 부여
 */
export function analyzeResults(
  baseline: BacktestMetrics,
  candidates: Array<{ params: SimilarityParams; metrics: BacktestMetrics }>,
  executionTimeMs: number = 0
): OptimizationResult {
  if (candidates.length === 0) {
    const dummyCandidate = createDummyCandidate(baseline);
    return {
      baseline,
      candidates: [dummyCandidate],
      bestCandidate: dummyCandidate,
      summary: createOptimizationSummary(0, executionTimeMs, baseline, dummyCandidate),
    };
  }

  // 전략 점수 기준 내림차순 정렬
  const sortedCandidates = [...candidates].sort(
    (a, b) => b.metrics.strategyScore - a.metrics.strategyScore
  );

  const rankedCandidates = sortedCandidates.map((candidate, index) =>
    createRankedCandidate(index + 1, candidate.params, candidate.metrics, baseline)
  );

  const bestCandidate = rankedCandidates[0];
  const summary = createOptimizationSummary(
    candidates.length,
    executionTimeMs,
    baseline,
    bestCandidate
  );

  return { baseline, candidates: rankedCandidates, bestCandidate, summary };
}
