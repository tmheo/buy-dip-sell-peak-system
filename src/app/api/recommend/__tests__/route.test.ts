/**
 * POST /api/recommend 엔드포인트 테스트 (이슈 #57)
 * route는 recommend() 호출 + InsufficientData → HTTP 400 매핑 + 차트 표시 헬퍼 호출로
 * 축소됐다. DB·인증만 대역으로 바꾸고 실제 서비스·코어 파이프라인을 통과시킨다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

import { clearRecommendationCache } from "@/recommend";
import { MIN_PAST_GAP_DAYS } from "@/recommend/similarity";
import type { HistoricalMetrics } from "@/recommend/types";
import { createPrices, buildHistoricalMetrics } from "@/recommend/__tests__/fixtures";

vi.mock("@/lib/auth/api-auth", () => ({
  requireAuth: vi.fn(),
  isUnauthorized: (result: unknown) => result instanceof Response,
}));

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
  toRecommendationCacheMetrics: vi.fn(() => ({})),
}));

import { requireAuth } from "@/lib/auth/api-auth";
import { getPriceRange, getLatestDate } from "@/database/prices";
import { getMetricsRange } from "@/database/metrics";
import { getCachedRecommendation, cacheRecommendation } from "@/database/recommend-cache";

import { POST } from "../route";

const mockedRequireAuth = vi.mocked(requireAuth);
const mockedGetPriceRange = vi.mocked(getPriceRange);
const mockedGetLatestDate = vi.mocked(getLatestDate);
const mockedGetMetricsRange = vi.mocked(getMetricsRange);
const mockedGetCachedRecommendation = vi.mocked(getCachedRecommendation);
const mockedCacheRecommendation = vi.mocked(cacheRecommendation);

type MetricsRows = Awaited<ReturnType<typeof getMetricsRange>>;

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** HistoricalMetrics를 daily_metrics 행 형태로 변환 */
function toMetricsRows(historicalMetrics: HistoricalMetrics[]) {
  return historicalMetrics.map((h) => ({
    ticker: "SOXL",
    date: h.date,
    ...h.metrics,
  }));
}

/** 추천이 성공할 수 있는 DB 대역 한 벌 구성 */
function arrangeSuccessDb() {
  const prices = createPrices(250);
  const referenceDate = prices[prices.length - 1].date;
  const historicalMetrics = buildHistoricalMetrics(prices, prices.length - 1 - MIN_PAST_GAP_DAYS);
  mockedGetLatestDate.mockResolvedValue(referenceDate);
  mockedGetPriceRange.mockResolvedValue(
    prices.map((p, i) => ({ ...p, id: i + 1, ticker: "SOXL", createdAt: null }))
  );
  mockedGetMetricsRange.mockResolvedValue(toMetricsRows(historicalMetrics) as MetricsRows);
  return { prices, referenceDate };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRecommendationCache();
  mockedRequireAuth.mockResolvedValue({ user: { id: "user-1" } } as Session);
  mockedGetCachedRecommendation.mockResolvedValue(null);
  mockedCacheRecommendation.mockResolvedValue(undefined);
});

describe("POST /api/recommend - 인증과 요청 검증", () => {
  it("인증 실패 시 401을 그대로 반환해야 한다", async () => {
    mockedRequireAuth.mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(
      createRequest({ ticker: "SOXL", referenceDate: "2020-09-01", baseType: "specific" })
    );

    expect(response.status).toBe(401);
  });

  it("JSON이 아닌 본문은 400이어야 한다", async () => {
    const response = await POST(createRequest("not-json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: "Invalid JSON body" });
  });

  it("스키마 위반은 400과 상세 사유를 반환해야 한다", async () => {
    const response = await POST(
      createRequest({ ticker: "AAPL", referenceDate: "2020-09-01", baseType: "specific" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: "Validation failed" });
  });
});

describe("POST /api/recommend - 추천 성공", () => {
  it("특정일 기준 추천을 화면 응답 형태로 반환해야 한다", async () => {
    const { referenceDate } = arrangeSuccessDb();

    const response = await POST(
      createRequest({ ticker: "SOXL", referenceDate, baseType: "specific" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.referenceDate).toBe(referenceDate);
    expect(["Pro1", "Pro2", "Pro3"]).toContain(body.data.recommendedStrategy.strategy);
    expect(body.data.recommendedStrategy.tierRatios).toHaveLength(6);
    expect(body.data.strategyScores).toHaveLength(3);
    // 기준일 차트: 분석 구간 20일 + 미래 placeholder 20일
    expect(body.data.referenceChartData).toHaveLength(40);
    expect(
      body.data.referenceChartData
        .slice(20)
        .every((p: { close: number | null }) => p.close === null)
    ).toBe(true);
    // 유사 구간 3개, 각각 차트 포함
    expect(body.data.similarPeriods).toHaveLength(3);
    for (const period of body.data.similarPeriods) {
      expect(period.chartData.length).toBeGreaterThan(0);
      expect(period.backtestResults.Pro2).toBeDefined();
    }
  });

  it("today 기준이면 DB 최신 날짜를 기준일로 사용해야 한다", async () => {
    const { referenceDate } = arrangeSuccessDb();

    const response = await POST(
      createRequest({ ticker: "SOXL", referenceDate: "1900-01-01", baseType: "today" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.referenceDate).toBe(referenceDate);
  });

  it("화면 요청도 서비스 캐시 혜택을 받아야 한다 (같은 요청 재호출 시 재계산 없음)", async () => {
    const { referenceDate } = arrangeSuccessDb();
    const request = { ticker: "SOXL", referenceDate, baseType: "specific" };

    await POST(createRequest(request));
    const second = await POST(createRequest(request));

    expect(second.status).toBe(200);
    expect(mockedGetMetricsRange).toHaveBeenCalledOnce();
    // 계산 결과는 DB 추천 캐시에도 저장된다
    expect(mockedCacheRecommendation).toHaveBeenCalledOnce();
  });
});

describe("POST /api/recommend - InsufficientData → 400 매핑", () => {
  it("가격 데이터가 전혀 없으면 400이어야 한다", async () => {
    mockedGetLatestDate.mockResolvedValue(null);

    const response = await POST(
      createRequest({ ticker: "SOXL", referenceDate: "2020-09-01", baseType: "today" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("DB 지표가 부족하면 재계산 폴백 없이 400과 사유를 반환해야 한다", async () => {
    const { referenceDate } = arrangeSuccessDb();
    mockedGetMetricsRange.mockResolvedValue([] as MetricsRows);

    const response = await POST(
      createRequest({ ticker: "SOXL", referenceDate, baseType: "specific" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      success: false,
      error: "INSUFFICIENT_HISTORICAL_METRICS",
    });
    expect(body.message).toContain("daily_metrics");
  });

  it("기준일이 가격 데이터에 없으면 400이어야 한다", async () => {
    arrangeSuccessDb();

    const response = await POST(
      createRequest({ ticker: "SOXL", referenceDate: "2035-01-01", baseType: "specific" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("PRICE_DATA_NOT_FOUND");
  });
});
