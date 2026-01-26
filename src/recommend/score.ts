/**
 * 전략 점수 계산 모듈
 */
import Decimal from "decimal.js";

import type { StrategyName } from "@/backtest/types";
import { getStrategy } from "@/backtest/strategy";

import type { SimilarPeriod, StrategyScore, PeriodStrategyScore } from "./types";

/** MDD 가중치 (고정값 0.01) */
export const MDD_WEIGHT = 0.01;

/**
 * 개별 전략 점수 계산
 * 공식: 점수 = 수익률(%) * e^(MDD(%) * weight)
 */
export function calculateStrategyScore(
  returnRate: number,
  mdd: number,
  weight: number = MDD_WEIGHT
): number {
  // MDD는 음수이므로 e^(mdd × weight)는 1보다 작은 값
  // 이를 통해 MDD가 클수록(더 큰 손실) 점수가 낮아짐
  const mddDecimal = new Decimal(mdd);
  const weightDecimal = new Decimal(weight);
  const returnDecimal = new Decimal(returnRate);

  // e^(mdd × weight) 계산
  const exponent = mddDecimal.mul(weightDecimal);
  const mddFactor = exponent.exp();

  // 점수 = 수익률 × e^(mdd × weight)
  const score = returnDecimal.mul(mddFactor);

  return score.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/** 특정 전략의 유사도 가중 평균 점수 계산 */
export function calculateAverageScore(
  periods: SimilarPeriod[],
  strategy: StrategyName
): Omit<StrategyScore, "excluded" | "excludeReason"> {
  const periodScores: PeriodStrategyScore[] = [];

  for (const period of periods) {
    const backtestResult = period.backtestResults[strategy];

    // 수익률과 MDD를 % 단위로 변환 (소수점 → %)
    // 예: 0.15 → 15%, -0.25 → -25%
    const returnRatePercent = new Decimal(backtestResult.returnRate)
      .mul(100)
      .toDecimalPlaces(4, Decimal.ROUND_DOWN)
      .toNumber();
    const mddPercent = new Decimal(backtestResult.mdd)
      .mul(100)
      .toDecimalPlaces(4, Decimal.ROUND_DOWN)
      .toNumber();

    const score = calculateStrategyScore(returnRatePercent, mddPercent);

    periodScores.push({
      score,
      returnRate: returnRatePercent,
      mdd: mddPercent,
    });
  }

  // 유사도 가중 평균 점수 계산
  // 공식: sum(score_i * similarity_i) / sum(similarity_i)
  let weightedScoreSum = new Decimal(0);
  let similaritySum = new Decimal(0);

  for (let i = 0; i < periodScores.length; i++) {
    const similarity = new Decimal(periods[i].similarity);
    weightedScoreSum = weightedScoreSum.add(new Decimal(periodScores[i].score).mul(similarity));
    similaritySum = similaritySum.add(similarity);
  }

  const averageScore = similaritySum.gt(0)
    ? weightedScoreSum.div(similaritySum).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()
    : 0;

  return {
    strategy,
    periodScores,
    averageScore,
  };
}

/** 모든 전략의 점수 계산 (정배열 시 Pro1 제외) */
export function calculateAllStrategyScores(
  periods: SimilarPeriod[],
  isGoldenCross: boolean,
  options?: { skipPro1Exclusion?: boolean }
): StrategyScore[] {
  const strategies: StrategyName[] = ["Pro1", "Pro2", "Pro3"];
  const strategyScores: StrategyScore[] = [];
  const skipExclusion = options?.skipPro1Exclusion ?? false;

  for (const strategy of strategies) {
    const scoreData = calculateAverageScore(periods, strategy);

    // REQ-SCORE-003: 정배열 시 Pro1 제외 (다이버전스 조건 발동 시 무시)
    const excluded = strategy === "Pro1" && isGoldenCross && !skipExclusion;
    const excludeReason = excluded ? "정배열 시 제외" : undefined;

    strategyScores.push({
      ...scoreData,
      excluded,
      excludeReason,
    });
  }

  return strategyScores;
}

/** 추천 전략 결정 (제외되지 않은 전략 중 최고 점수) */
export function getRecommendedStrategy(scores: StrategyScore[]): StrategyName {
  const validScores = scores.filter((s) => !s.excluded);

  if (validScores.length === 0) {
    return "Pro2";
  }

  return validScores.reduce((best, current) =>
    current.averageScore > best.averageScore ? current : best
  ).strategy;
}

/** 추천 전략의 티어 비율 조회 */
export function getStrategyTierRatios(
  strategy: StrategyName
): [number, number, number, number, number, number] {
  return getStrategy(strategy).tierRatios;
}

/** 추천 사유 생성 */
export function generateRecommendReason(strategy: StrategyName, scores: StrategyScore[]): string {
  const strategyScore = scores.find((s) => s.strategy === strategy);
  if (!strategyScore) {
    return `${strategy} 전략 추천`;
  }
  return `평균 점수 ${strategyScore.averageScore.toFixed(2)}점으로 가장 높음`;
}
