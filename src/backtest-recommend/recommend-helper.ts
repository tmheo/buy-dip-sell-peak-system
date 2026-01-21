/**
 * 전략 추천 헬퍼 함수
 * 백테스트 중 사이클 경계에서 빠르게 추천 전략을 조회
 */
import type { DailyPrice } from "@/types";
import type { StrategyName, TechnicalMetrics } from "@/backtest/types";
import { calculateTechnicalMetrics } from "@/backtest/metrics";
import { getMetricsByDateRange } from "@/database";
import {
  ANALYSIS_PERIOD_DAYS,
  PERFORMANCE_PERIOD_DAYS,
  MIN_PAST_GAP_DAYS,
  findSimilarPeriodsWithDates,
} from "@/recommend/similarity";
import { calculateAllStrategyScores, getRecommendedStrategy } from "@/recommend/score";
import type { HistoricalMetrics, SimilarPeriod, PeriodBacktestResult } from "@/recommend/types";
import { BacktestEngine } from "@/backtest";

import type { QuickRecommendResult } from "./types";

/** 백테스트용 lookback 일수 */
const LOOKBACK_DAYS = 90;

/**
 * 기본 기술적 지표 생성 (데이터 부족 시 사용)
 */
function createDefaultMetrics(): TechnicalMetrics {
  return {
    goldenCross: 0,
    isGoldenCross: false,
    maSlope: 0,
    disparity: 0,
    rsi14: 50,
    roc12: 0,
    volatility20: 0,
  };
}

/**
 * 특정 날짜에 대한 추천 전략을 반환
 *
 * @param ticker - 종목 티커
 * @param referenceDate - 기준일
 * @param allPrices - 전체 가격 데이터 (성능 최적화를 위해 캐시된 데이터 사용)
 * @param dateToIndexMap - 날짜-인덱스 맵 (O(1) 조회용)
 * @returns 추천 전략 정보 또는 null (데이터 부족 시)
 */
export function getQuickRecommendation(
  ticker: "SOXL" | "TQQQ",
  referenceDate: string,
  allPrices: DailyPrice[],
  dateToIndexMap: Map<string, number>
): QuickRecommendResult | null {
  // 1. 기준일 인덱스 찾기
  const referenceDateIndex = dateToIndexMap.get(referenceDate);
  if (referenceDateIndex === undefined || referenceDateIndex < 59) {
    // 데이터 부족 - 기본 전략 반환
    return {
      strategy: "Pro2",
      reason: "데이터 부족으로 기본 전략 사용",
      metrics: createDefaultMetrics(),
    };
  }

  // 2. adjClose 배열 생성
  const adjClosePrices = allPrices.map((p) => p.adjClose);

  // 3. 기준일 기술적 지표 계산
  const referenceMetrics = calculateTechnicalMetrics(adjClosePrices, referenceDateIndex);
  if (!referenceMetrics) {
    return {
      strategy: "Pro2",
      reason: "지표 계산 실패로 기본 전략 사용",
      metrics: createDefaultMetrics(),
    };
  }

  // 4. 과거 기술적 지표 조회 범위 결정
  const maxHistoricalIndex = referenceDateIndex - MIN_PAST_GAP_DAYS;
  if (maxHistoricalIndex < 59) {
    return {
      strategy: "Pro2",
      reason: "과거 데이터 부족으로 기본 전략 사용",
      metrics: referenceMetrics,
    };
  }

  // 5. DB에서 지표 조회 (최적화 경로)
  const lookbackDateStr = "2010-01-01";
  const maxHistoricalDate = allPrices[maxHistoricalIndex].date;
  const metricsFromDb = getMetricsByDateRange(
    { startDate: lookbackDateStr, endDate: maxHistoricalDate },
    ticker
  );

  // HistoricalMetrics 배열로 변환
  const historicalMetrics: HistoricalMetrics[] = [];
  for (const metricRow of metricsFromDb) {
    const dateIndex = dateToIndexMap.get(metricRow.date);
    if (dateIndex === undefined || dateIndex > maxHistoricalIndex) continue;
    if (
      metricRow.maSlope === null ||
      metricRow.disparity === null ||
      metricRow.rsi14 === null ||
      metricRow.roc12 === null ||
      metricRow.volatility20 === null
    ) {
      continue;
    }

    historicalMetrics.push({
      date: metricRow.date,
      dateIndex,
      metrics: {
        goldenCross: metricRow.goldenCross ?? 0,
        isGoldenCross: metricRow.isGoldenCross,
        maSlope: metricRow.maSlope,
        disparity: metricRow.disparity,
        rsi14: metricRow.rsi14,
        roc12: metricRow.roc12,
        volatility20: metricRow.volatility20,
      },
    });
  }

  if (historicalMetrics.length < 3) {
    return {
      strategy: "Pro2",
      reason: "유사 구간 부족으로 기본 전략 사용",
      metrics: referenceMetrics,
    };
  }

  // 6. 유사 구간 검색
  const similarPeriodsRaw = findSimilarPeriodsWithDates(referenceMetrics, historicalMetrics, 3, {
    filterGoldenCross: referenceMetrics.isGoldenCross,
  });

  // 7. 유사 구간별 백테스트 (성능 최적화)
  const strategies: StrategyName[] = ["Pro1", "Pro2", "Pro3"];
  const initialCapital = 10000000;

  const similarPeriods: SimilarPeriod[] = [];

  for (const period of similarPeriodsRaw) {
    const performanceStartIndex = period.endDateIndex + 1;
    const performanceEndIndex = performanceStartIndex + PERFORMANCE_PERIOD_DAYS - 1;

    if (performanceEndIndex >= allPrices.length) continue;

    const performanceStartDate = allPrices[performanceStartIndex].date;
    const performanceEndDate = allPrices[performanceEndIndex].date;
    const analysisStartIdx = Math.max(0, period.endDateIndex - ANALYSIS_PERIOD_DAYS + 1);
    const startDate = allPrices[analysisStartIdx].date;

    // 백테스트용 가격 데이터 슬라이스
    const backtestLookbackIndex = Math.max(0, performanceStartIndex - LOOKBACK_DAYS);
    const backtestPrices = allPrices.slice(backtestLookbackIndex, performanceEndIndex + 1);
    const backtestStartIdx = performanceStartIndex - backtestLookbackIndex;

    const backtestResults: Record<StrategyName, PeriodBacktestResult> = {
      Pro1: { returnRate: 0, mdd: 0 },
      Pro2: { returnRate: 0, mdd: 0 },
      Pro3: { returnRate: 0, mdd: 0 },
    };

    for (const strategy of strategies) {
      try {
        const engine = new BacktestEngine(strategy);
        const result = engine.run(
          {
            ticker,
            strategy,
            startDate: performanceStartDate,
            endDate: performanceEndDate,
            initialCapital,
          },
          backtestPrices,
          backtestStartIdx
        );
        backtestResults[strategy] = { returnRate: result.returnRate, mdd: result.mdd };
      } catch {
        // 백테스트 실패 시 기본값 유지
      }
    }

    similarPeriods.push({
      startDate,
      endDate: period.endDate,
      similarity: period.similarity,
      performanceStartDate,
      performanceEndDate,
      metrics: period.metrics,
      backtestResults,
    });
  }

  if (similarPeriods.length < 3) {
    return {
      strategy: "Pro2",
      reason: "성과 구간 부족으로 기본 전략 사용",
      metrics: referenceMetrics,
    };
  }

  // 8. 전략 점수 계산 및 추천
  const strategyScores = calculateAllStrategyScores(similarPeriods, referenceMetrics.isGoldenCross);
  let recommendedStrategy = getRecommendedStrategy(strategyScores);
  const strategyScore = strategyScores.find((s) => s.strategy === recommendedStrategy);
  let reason = strategyScore ? `평균 점수 ${strategyScore.averageScore.toFixed(2)}점` : "추천 전략";

  // 9. SOXL 전용: RSI >= 60 AND 역배열이면 전략 한 단계 하향
  if (ticker === "SOXL" && referenceMetrics.rsi14 >= 60 && !referenceMetrics.isGoldenCross) {
    const originalStrategy = recommendedStrategy;
    if (recommendedStrategy === "Pro3") {
      recommendedStrategy = "Pro2";
    } else if (recommendedStrategy === "Pro2") {
      recommendedStrategy = "Pro1";
    }
    // Pro1은 그대로 유지
    if (originalStrategy !== recommendedStrategy) {
      reason = `${reason} (RSI≥60 & 역배열로 ${originalStrategy}→${recommendedStrategy} 하향)`;
    }
  }

  return {
    strategy: recommendedStrategy,
    reason,
    metrics: referenceMetrics,
  };
}
