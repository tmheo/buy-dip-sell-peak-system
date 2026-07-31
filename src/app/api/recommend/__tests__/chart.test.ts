/**
 * /api/recommend 표시 계층 헬퍼 테스트 (이슈 #57)
 * 차트 데이터(종가·MA20·MA60)와 값을 비워 둔 미래 거래일, 화면 응답 변환을 검증한다.
 * 서비스 밖 순수 함수이므로 DB 없이 테스트한다.
 */
import { describe, it, expect } from "vitest";

import { calculateSMA } from "@/backtest/metrics";
import { computeRecommendation } from "@/recommend/core";
import {
  ANALYSIS_PERIOD_DAYS,
  PERFORMANCE_PERIOD_DAYS,
  MIN_PAST_GAP_DAYS,
} from "@/recommend/similarity";
import type { Recommendation } from "@/recommend/types";
import { createPrices, buildHistoricalMetrics } from "@/recommend/__tests__/fixtures";

import { generateFutureTradingDates, generateChartData, buildRecommendResult } from "../chart";

/** 추천 상세가 채워진 Recommendation 픽스처 (실제 코어로 계산) */
function detailedRecommendationFixture() {
  const prices = createPrices(250);
  const referenceDate = prices[prices.length - 1].date;
  const historicalMetrics = buildHistoricalMetrics(prices, prices.length - 1 - MIN_PAST_GAP_DAYS);
  const outcome = computeRecommendation({
    ticker: "SOXL",
    referenceDate,
    prices,
    historicalMetrics,
  });
  if (!outcome.ok) throw new Error("픽스처 추천 계산이 실패했습니다");
  return { prices, referenceDate, recommendation: outcome.value };
}

describe("generateFutureTradingDates", () => {
  it("주말을 건너뛰고 다음 거래일부터 생성해야 한다", () => {
    // 2026-07-30은 목요일: 금(31) → 토·일 건너뜀 → 월(8/3), 화(8/4)
    expect(generateFutureTradingDates("2026-07-30", 3)).toEqual([
      "2026-07-31",
      "2026-08-03",
      "2026-08-04",
    ]);
  });

  it("요청한 개수만큼 생성해야 한다", () => {
    expect(generateFutureTradingDates("2026-07-30", 20)).toHaveLength(20);
  });
});

describe("generateChartData", () => {
  it("종가와 MA20·MA60을 기존 지표 모듈(calculateSMA)로 계산해야 한다", () => {
    const prices = createPrices(100);
    const adjClosePrices = prices.map((p) => p.adjClose);

    const chartData = generateChartData(prices, 70, 99);

    expect(chartData).toHaveLength(30);
    expect(chartData[0]).toEqual({
      date: prices[70].date,
      close: prices[70].adjClose,
      ma20: calculateSMA(adjClosePrices, 20, 70),
      ma60: calculateSMA(adjClosePrices, 60, 70),
    });
    expect(chartData[0].ma20).not.toBeNull();
    expect(chartData[0].ma60).not.toBeNull();
  });

  it("데이터가 부족한 초기 구간의 MA는 null이어야 한다", () => {
    const prices = createPrices(30);

    const chartData = generateChartData(prices, 0, 29);

    expect(chartData[0].ma20).toBeNull();
    expect(chartData[18].ma20).toBeNull();
    expect(chartData[19].ma20).not.toBeNull();
    expect(chartData[29].ma60).toBeNull();
  });
});

describe("buildRecommendResult", () => {
  it("기준일 차트는 분석 구간 뒤에 값을 비워 둔 미래 거래일을 붙여야 한다", () => {
    const { prices, referenceDate, recommendation } = detailedRecommendationFixture();

    const result = buildRecommendResult(recommendation, prices);

    expect(result.referenceChartData).toHaveLength(ANALYSIS_PERIOD_DAYS + PERFORMANCE_PERIOD_DAYS);
    const analysisPart = result.referenceChartData!.slice(0, ANALYSIS_PERIOD_DAYS);
    const futurePart = result.referenceChartData!.slice(ANALYSIS_PERIOD_DAYS);
    expect(analysisPart[0].date).toBe(recommendation.analysisPeriod!.startDate);
    expect(analysisPart[analysisPart.length - 1].date).toBe(referenceDate);
    expect(analysisPart.every((p) => p.close !== null)).toBe(true);
    // 기준일 이후는 실제 데이터 유무와 관계없이 항상 값을 비워 둔다
    expect(futurePart.every((p) => p.close === null && p.ma20 === null && p.ma60 === null)).toBe(
      true
    );
  });

  it("유사 구간마다 분석+성과 구간 차트를 붙여야 한다", () => {
    const { prices, recommendation } = detailedRecommendationFixture();

    const result = buildRecommendResult(recommendation, prices);

    expect(result.similarPeriods).toHaveLength(3);
    for (const period of result.similarPeriods) {
      expect(period.chartData).toBeDefined();
      expect(period.chartData![0].date).toBe(period.startDate);
      expect(period.chartData![period.chartData!.length - 1].date).toBe(period.performanceEndDate);
    }
  });

  it("추천 전략·점수·지표를 화면 응답 형태로 매핑해야 한다", () => {
    const { prices, referenceDate, recommendation } = detailedRecommendationFixture();

    const result = buildRecommendResult(recommendation, prices);

    expect(result.referenceDate).toBe(referenceDate);
    expect(result.metrics).toEqual(recommendation.metrics);
    expect(result.strategyScores).toEqual(recommendation.strategyScores);
    expect(result.recommendedStrategy).toEqual({
      strategy: recommendation.strategy,
      tierRatios: recommendation.tierRatios,
      reason: recommendation.reason,
    });
  });

  it("하향이 적용되지 않은 downgradeInfo는 응답에서 생략해야 한다", () => {
    const { prices, recommendation } = detailedRecommendationFixture();

    const notApplied = buildRecommendResult(
      { ...recommendation, downgradeInfo: { applied: false, reasons: [] } },
      prices
    );
    expect(notApplied.downgradeInfo).toBeUndefined();

    const applied = buildRecommendResult(
      {
        ...recommendation,
        downgradeInfo: {
          applied: true,
          originalStrategy: "Pro1",
          downgradedStrategy: "Pro2",
          reasons: ["RSI 과열"],
        },
      },
      prices
    );
    expect(applied.downgradeInfo?.applied).toBe(true);
  });

  it("상세 필드가 없는 요약 추천은 변환할 수 없어야 한다", () => {
    const { prices, recommendation } = detailedRecommendationFixture();
    const summary: Recommendation = {
      referenceDate: recommendation.referenceDate,
      strategy: recommendation.strategy,
      reason: recommendation.reason,
      metrics: recommendation.metrics,
      tierRatios: recommendation.tierRatios,
    };

    expect(() => buildRecommendResult(summary, prices)).toThrow(/상세/);
  });
});
