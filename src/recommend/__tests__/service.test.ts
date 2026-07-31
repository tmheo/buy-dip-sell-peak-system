/**
 * RecommendationService 테스트 (이슈 #56)
 * DB 모듈을 대역으로 바꿔, 서비스가 소유하는 캐시 정책과 기본 전략 폴백을 검증한다.
 *
 * - 커스텀 similarityConfig면 메모리·DB 캐시를 전부 우회한다
 * - DB 지표(daily_metrics)가 단일 소스이고, 부족하면 InsufficientData다
 * - recommendOrDefault는 부족 시 기본 전략 Pro2 + 사유를 반환한다 (추천 백테스트의 재현 의미)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { DailyPrice } from "@/types";
import { DEFAULT_SIMILARITY_CONFIG } from "@/recommend/similarity";
import { MIN_PAST_GAP_DAYS } from "@/recommend/similarity";

import { recommend, recommendOrDefault, clearRecommendationCache } from "../service";
import type { HistoricalMetrics } from "../types";
import { createPrices, buildHistoricalMetrics } from "./fixtures";

vi.mock("@/database/prices", () => ({
  getPriceRange: vi.fn(),
  getLatestDate: vi.fn(),
}));

vi.mock("@/database/metrics", () => ({
  getMetricsRange: vi.fn(),
}));

vi.mock("@/database/recommend-cache", () => ({
  getCachedRecommendation: vi.fn(),
  cacheRecommendation: vi.fn(),
  toRecommendationCacheMetrics: vi.fn((metrics: Record<string, unknown>) => ({
    rsi14: metrics.rsi14 ?? null,
    isGoldenCross: metrics.isGoldenCross ?? false,
    maSlope: metrics.maSlope ?? null,
    disparity: metrics.disparity ?? null,
    roc12: metrics.roc12 ?? null,
    volatility20: metrics.volatility20 ?? null,
    goldenCross: metrics.goldenCross ?? null,
  })),
}));

import { getPriceRange, getLatestDate } from "@/database/prices";
import { getMetricsRange } from "@/database/metrics";
import { getCachedRecommendation, cacheRecommendation } from "@/database/recommend-cache";

const mockedGetPriceRange = vi.mocked(getPriceRange);
const mockedGetLatestDate = vi.mocked(getLatestDate);
const mockedGetMetricsRange = vi.mocked(getMetricsRange);
const mockedGetCachedRecommendation = vi.mocked(getCachedRecommendation);
const mockedCacheRecommendation = vi.mocked(cacheRecommendation);

/** HistoricalMetrics를 daily_metrics 행 형태로 변환 */
function toMetricsRows(historicalMetrics: HistoricalMetrics[]) {
  return historicalMetrics.map((h) => ({
    ticker: "SOXL",
    date: h.date,
    ...h.metrics,
  }));
}

/** 추천이 성공할 수 있는 픽스처 한 벌 */
function successFixture() {
  const prices = createPrices(250);
  const referenceDate = prices[prices.length - 1].date;
  const historicalMetrics = buildHistoricalMetrics(prices, prices.length - 1 - MIN_PAST_GAP_DAYS);
  return { prices, referenceDate, historicalMetrics };
}

type MetricsRows = Awaited<ReturnType<typeof getMetricsRange>>;

beforeEach(() => {
  vi.clearAllMocks();
  clearRecommendationCache();
  mockedGetCachedRecommendation.mockResolvedValue(null);
  mockedCacheRecommendation.mockResolvedValue(undefined);
});

describe("recommend - 계산과 캐시 소유", () => {
  it("가격 데이터를 넘기면 DB 지표만 로드해 추천을 계산해야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);

    const outcome = await recommend("SOXL", referenceDate, { prices });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.similarPeriods).toHaveLength(3);
    expect(mockedGetPriceRange).not.toHaveBeenCalled();
    expect(mockedGetMetricsRange).toHaveBeenCalledOnce();
    // 계산 결과는 DB 추천 캐시에 저장된다
    expect(mockedCacheRecommendation).toHaveBeenCalledOnce();
    expect(mockedCacheRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: "SOXL",
        date: referenceDate,
        strategy: outcome.value.strategy,
      })
    );
  });

  it("가격 데이터를 넘기지 않으면 서비스가 DB에서 로드해야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetLatestDate.mockResolvedValue(referenceDate);
    mockedGetPriceRange.mockResolvedValue(
      prices.map((p, i) => ({ ...p, id: i + 1, ticker: "SOXL", createdAt: null }))
    );
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);

    const outcome = await recommend("SOXL", referenceDate);

    expect(outcome.ok).toBe(true);
    expect(mockedGetPriceRange).toHaveBeenCalledOnce();
  });

  it("같은 (ticker, 기준일) 재호출 시 메모리 캐시로 재계산하지 않아야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);

    const first = await recommend("SOXL", referenceDate, { prices });
    const second = await recommend("SOXL", referenceDate, { prices });

    expect(first).toEqual(second);
    expect(mockedGetMetricsRange).toHaveBeenCalledOnce();
  });

  it("DB 캐시 적중 시 계산 없이 캐시된 추천을 반환해야 한다", async () => {
    const { prices, referenceDate } = successFixture();
    mockedGetCachedRecommendation.mockResolvedValue({
      id: 1,
      ticker: "SOXL",
      date: referenceDate,
      strategy: "Pro3",
      reason: "평균 점수 12.34점으로 가장 높음",
      rsi14: 61.5,
      isGoldenCross: true,
      maSlope: 1.2,
      disparity: 3.4,
      roc12: 5.6,
      volatility20: 0.07,
      goldenCross: 1,
      createdAt: new Date(),
    } as Awaited<ReturnType<typeof getCachedRecommendation>>);

    const outcome = await recommend("SOXL", referenceDate, { prices });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.strategy).toBe("Pro3");
    expect(outcome.value.reason).toBe("평균 점수 12.34점으로 가장 높음");
    expect(outcome.value.metrics.rsi14).toBe(61.5);
    expect(mockedGetMetricsRange).not.toHaveBeenCalled();
  });

  it("커스텀 similarityConfig면 메모리·DB 캐시를 전부 우회해야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);
    const similarityConfig = { ...DEFAULT_SIMILARITY_CONFIG };

    await recommend("SOXL", referenceDate, { prices, similarityConfig });
    await recommend("SOXL", referenceDate, { prices, similarityConfig });

    // 캐시 조회도 저장도 없다 (오염 구조적 불가)
    expect(mockedGetCachedRecommendation).not.toHaveBeenCalled();
    expect(mockedCacheRecommendation).not.toHaveBeenCalled();
    // 메모리 캐시도 우회하므로 두 번 모두 재계산한다
    expect(mockedGetMetricsRange).toHaveBeenCalledTimes(2);
  });

  it("persistCache가 false면 DB 캐시에 저장하지 않아야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);

    const outcome = await recommend("SOXL", referenceDate, { prices, persistCache: false });

    expect(outcome.ok).toBe(true);
    expect(mockedCacheRecommendation).not.toHaveBeenCalled();
  });

  it("정배열 지표가 비어 있는 행은 제외해야 한다 (단일 소스 정책)", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    // 5개 핵심 지표는 채워져 있지만 정배열 지표가 null인 행은 검색에 참여하면 안 된다
    const rows = toMetricsRows(historicalMetrics).map((row) => ({
      ...row,
      goldenCross: null,
      isGoldenCross: null,
    }));
    mockedGetMetricsRange.mockResolvedValue(rows as MetricsRows);

    const outcome = await recommend("SOXL", referenceDate, { prices });

    expect(outcome).toEqual({
      ok: false,
      reason: expect.objectContaining({ code: "INSUFFICIENT_HISTORICAL_METRICS" }),
    });
  });

  it("DB 지표가 부족하면 재계산 폴백 없이 InsufficientData를 반환해야 한다", async () => {
    const { prices, referenceDate } = successFixture();
    mockedGetMetricsRange.mockResolvedValue([] as MetricsRows);

    const outcome = await recommend("SOXL", referenceDate, { prices });

    expect(outcome).toEqual({
      ok: false,
      reason: expect.objectContaining({ code: "INSUFFICIENT_HISTORICAL_METRICS" }),
    });
    // 실패 결과는 캐시하지 않는다
    expect(mockedCacheRecommendation).not.toHaveBeenCalled();
  });
});

describe("recommend - requireDetail (상세 필드가 필요한 호출자)", () => {
  const dbCachedRow = (referenceDate: string) =>
    ({
      id: 1,
      ticker: "SOXL",
      date: referenceDate,
      strategy: "Pro3",
      reason: "평균 점수 12.34점으로 가장 높음",
      rsi14: 61.5,
      isGoldenCross: true,
      maSlope: 1.2,
      disparity: 3.4,
      roc12: 5.6,
      volatility20: 0.07,
      goldenCross: 1,
      createdAt: new Date(),
    }) as Awaited<ReturnType<typeof getCachedRecommendation>>;

  it("requireDetail이면 요약만 저장하는 DB 캐시를 조회하지 않고 전체를 계산해야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);
    mockedGetCachedRecommendation.mockResolvedValue(dbCachedRow(referenceDate));

    const outcome = await recommend("SOXL", referenceDate, { prices, requireDetail: true });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.similarPeriods).toHaveLength(3);
    expect(mockedGetCachedRecommendation).not.toHaveBeenCalled();
    // 전체 계산 결과는 평소처럼 DB 캐시에 저장된다
    expect(mockedCacheRecommendation).toHaveBeenCalledOnce();
  });

  it("메모리 캐시에 요약만 있으면 requireDetail 호출은 재계산해 전체 값으로 교체해야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetCachedRecommendation.mockResolvedValue(dbCachedRow(referenceDate));
    // 1) 요약 경로: DB 캐시 적중이 메모리 캐시에 요약을 남긴다
    const summary = await recommend("SOXL", referenceDate, { prices });
    expect(summary.ok && summary.value.similarPeriods).toBeUndefined();

    // 2) 상세 경로: 요약은 적중으로 치지 않고 재계산한다
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);
    const detailed = await recommend("SOXL", referenceDate, { prices, requireDetail: true });
    expect(detailed.ok).toBe(true);
    if (!detailed.ok) return;
    expect(detailed.value.similarPeriods).toHaveLength(3);

    // 3) 이후 요약 호출도 교체된 전체 값을 그대로 받는다
    const after = await recommend("SOXL", referenceDate, { prices });
    expect(after).toEqual(detailed);
    expect(mockedGetMetricsRange).toHaveBeenCalledOnce();
  });

  it("메모리 캐시에 전체 값이 있으면 requireDetail이라도 재계산하지 않아야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);

    const first = await recommend("SOXL", referenceDate, { prices });
    const second = await recommend("SOXL", referenceDate, { prices, requireDetail: true });

    expect(first).toEqual(second);
    expect(mockedGetMetricsRange).toHaveBeenCalledOnce();
  });
});

describe("recommendOrDefault - 기본 전략 폴백", () => {
  it("추천 가능하면 추천을 그대로 반환해야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);

    const recommendation = await recommendOrDefault("SOXL", referenceDate, { prices });

    expect(["Pro1", "Pro2", "Pro3"]).toContain(recommendation.strategy);
    expect(recommendation.reason).toMatch(/평균 점수/);
  });

  it("추천 불가면 기본 전략 Pro2와 사유를 반환해야 한다", async () => {
    const prices = createPrices(80); // 유사 구간 검색 범위 부족
    const referenceDate = prices[prices.length - 1].date;
    mockedGetMetricsRange.mockResolvedValue([] as MetricsRows);

    const recommendation = await recommendOrDefault("SOXL", referenceDate, { prices });

    expect(recommendation.strategy).toBe("Pro2");
    expect(recommendation.reason).toContain("기본 전략");
    // 실패 전에 계산된 기준일 지표를 그대로 넘겨받는다
    expect(recommendation.metrics.rsi14).toBeGreaterThan(0);
  });

  it("기준일 지표조차 없으면 중립 지표로 기본 전략을 반환해야 한다", async () => {
    const prices: DailyPrice[] = [];
    mockedGetLatestDate.mockResolvedValue(null);

    const recommendation = await recommendOrDefault("SOXL", "2020-06-01", { prices });

    expect(recommendation.strategy).toBe("Pro2");
    expect(recommendation.metrics.rsi14).toBe(50);
  });
});

describe("clearRecommendationCache", () => {
  it("메모리 캐시를 비우면 다음 호출은 재계산해야 한다", async () => {
    const { prices, referenceDate, historicalMetrics } = successFixture();
    mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);

    await recommend("SOXL", referenceDate, { prices });
    clearRecommendationCache();
    await recommend("SOXL", referenceDate, { prices });

    expect(mockedGetMetricsRange).toHaveBeenCalledTimes(2);
  });
});
