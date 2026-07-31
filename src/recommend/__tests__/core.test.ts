/**
 * computeRecommendation (순수 계산 코어) 테스트
 * 이슈 #56: 가격·지표 배열 → 추천. DB 없이 실패 정책·구간 폐기·추천 성공을 검증한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

import { BacktestEngine } from "@/backtest/engine";

import { MIN_PAST_GAP_DAYS } from "@/recommend/similarity";

import { computeRecommendation } from "../core";
import { createPrices, buildHistoricalMetrics } from "./fixtures";

describe("computeRecommendation - 추천 성공", () => {
  it("충분한 가격·지표가 있으면 유사 구간 3개와 점수 기반 추천을 반환해야 한다", async () => {
    const prices = createPrices(250);
    const referenceDate = prices[prices.length - 1].date;
    const historicalMetrics = buildHistoricalMetrics(prices, prices.length - 1 - MIN_PAST_GAP_DAYS);

    const outcome = await computeRecommendation({
      ticker: "SOXL",
      referenceDate,
      prices,
      historicalMetrics,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const value = outcome.value;
    expect(["Pro1", "Pro2", "Pro3"]).toContain(value.strategy);
    expect(value.referenceDate).toBe(referenceDate);
    expect(value.similarPeriods).toHaveLength(3);
    for (const period of value.similarPeriods ?? []) {
      expect(period.backtestResults.Pro1).toBeDefined();
      expect(period.backtestResults.Pro2).toBeDefined();
      expect(period.backtestResults.Pro3).toBeDefined();
    }
    expect(value.strategyScores).toHaveLength(3);
    // 사유 문자열은 generateRecommendReason 문구로 통일된다
    expect(value.reason).toMatch(/^평균 점수 -?\d+(\.\d+)?점으로 가장 높음/);
    expect(value.tierRatios).toHaveLength(6);
    expect(value.metrics.rsi14).toBeGreaterThan(0);
  });
});

describe("computeRecommendation - 실패 정책 (InsufficientData)", () => {
  it("기준일이 가격 데이터에 없으면 PRICE_DATA_NOT_FOUND를 반환해야 한다", async () => {
    const prices = createPrices(250);

    const outcome = await computeRecommendation({
      ticker: "SOXL",
      referenceDate: "2031-01-01",
      prices,
      historicalMetrics: buildHistoricalMetrics(prices, 200),
    });

    expect(outcome).toEqual({
      ok: false,
      reason: expect.objectContaining({ code: "PRICE_DATA_NOT_FOUND" }),
    });
  });

  it("기준일 이전 데이터가 60일 미만이면 INSUFFICIENT_PRICE_HISTORY를 반환해야 한다", async () => {
    const prices = createPrices(250);
    const referenceDate = prices[30].date;

    const outcome = await computeRecommendation({
      ticker: "SOXL",
      referenceDate,
      prices,
      historicalMetrics: [],
    });

    expect(outcome).toEqual({
      ok: false,
      reason: expect.objectContaining({ code: "INSUFFICIENT_PRICE_HISTORY" }),
    });
  });

  it("유사 구간 검색 범위가 60일 미만이면 INSUFFICIENT_PRICE_HISTORY를 반환해야 한다", async () => {
    // 지표는 계산되지만 기준일 - MIN_PAST_GAP_DAYS < 59라 검색 범위가 부족하다
    const prices = createPrices(250);
    const referenceDate = prices[59 + MIN_PAST_GAP_DAYS - 1].date;

    const outcome = await computeRecommendation({
      ticker: "SOXL",
      referenceDate,
      prices,
      historicalMetrics: [],
    });

    expect(outcome).toEqual({
      ok: false,
      reason: expect.objectContaining({
        code: "INSUFFICIENT_PRICE_HISTORY",
        referenceMetrics: expect.objectContaining({ rsi14: expect.any(Number) }),
      }),
    });
  });

  it("DB 지표가 3개 미만이면 재계산 폴백 없이 INSUFFICIENT_HISTORICAL_METRICS를 반환해야 한다", async () => {
    const prices = createPrices(250);
    const referenceDate = prices[prices.length - 1].date;
    const historicalMetrics = buildHistoricalMetrics(
      prices,
      prices.length - 1 - MIN_PAST_GAP_DAYS
    ).slice(0, 2);

    const outcome = await computeRecommendation({
      ticker: "SOXL",
      referenceDate,
      prices,
      historicalMetrics,
    });

    expect(outcome).toEqual({
      ok: false,
      reason: expect.objectContaining({ code: "INSUFFICIENT_HISTORICAL_METRICS" }),
    });
  });
});

describe("computeRecommendation - 전략 백테스트 실패 시 구간 폐기", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("구간 안에서 전략 하나라도 실패하면 구간 전체를 폐기하고, 3개 미만이면 InsufficientData여야 한다", async () => {
    const prices = createPrices(250);
    const referenceDate = prices[prices.length - 1].date;
    const historicalMetrics = buildHistoricalMetrics(prices, prices.length - 1 - MIN_PAST_GAP_DAYS);

    // Pro3 백테스트만 실패시킨다. 0점 유지 방식이라면 ok: true로 추천이 나오지만,
    // 구간 폐기 정책에서는 모든 구간이 폐기되어 InsufficientData다.
    const originalRun = BacktestEngine.prototype.run;
    vi.spyOn(BacktestEngine.prototype, "run").mockImplementation(function (
      this: BacktestEngine,
      request,
      allPrices,
      startIndex
    ) {
      if (request.strategy === "Pro3") {
        throw new Error("전략 백테스트 실패 (테스트)");
      }
      return originalRun.call(this, request, allPrices, startIndex);
    });

    const outcome = await computeRecommendation({
      ticker: "SOXL",
      referenceDate,
      prices,
      historicalMetrics,
    });

    expect(outcome).toEqual({
      ok: false,
      reason: expect.objectContaining({ code: "INSUFFICIENT_SIMILAR_PERIODS" }),
    });
  });
});
