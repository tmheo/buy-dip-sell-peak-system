/**
 * Cron 가격/지표 동기화 엔드포인트 단위 테스트
 *
 * GET /api/cron/update-prices 핸들러에 대한 테스트로
 * 인증 검증, 티커별 동기화 요약 응답, 분할 가드 발동 시 비 2xx 응답,
 * 티커 간 실패 격리를 검증합니다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

// --- Mock 설정 ---

// route가 api-utils를 거쳐 세션 인증 모듈을 끌어오므로 next-auth ESM 호환성을 위해 대역으로 바꾼다
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/services/priceSyncService", () => ({
  syncTickerPrices: vi.fn(),
}));

import { syncTickerPrices } from "@/services/priceSyncService";
import type { TickerSyncSummary } from "@/services/priceSyncService";
import type { SupportedTicker } from "@/services/dataFetcher";

// --- 헬퍼 함수 ---

/**
 * Cron 요청용 NextRequest 생성 헬퍼
 * @param token - Authorization 헤더 값 (예: "Bearer test-secret-token")
 */
function createCronRequest(token?: string): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set("authorization", token);
  }
  return new NextRequest("http://localhost:3000/api/cron/update-prices", {
    method: "GET",
    headers,
  });
}

/** 정상 동기화 요약 mock 생성 */
function createSyncedSummary(
  ticker: SupportedTicker,
  overrides: Partial<TickerSyncSummary> = {}
): TickerSyncSummary {
  return {
    ticker,
    status: "synced",
    guardViolations: [],
    fetchedRows: 4000,
    newPriceRows: 1,
    changedPriceRows: 2,
    changedColumns: { open: 0, high: 0, low: 0, close: 0, adjClose: 2, volume: 0 },
    dbOnlyDates: [],
    upsertedMetrics: 3941,
    ...overrides,
  };
}

/** 분할 가드 발동 요약 mock 생성 */
function createGuardSummary(ticker: SupportedTicker): TickerSyncSummary {
  return createSyncedSummary(ticker, {
    status: "guard-triggered",
    guardViolations: [{ date: "2026-07-01", dbClose: 50, fetchedClose: 25, changeRatio: 0.5 }],
    newPriceRows: 0,
    changedPriceRows: 100,
    upsertedMetrics: 0,
  });
}

// --- 테스트 ---

describe("GET /api/cron/update-prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-secret-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // =====================
  // 1. 인증 검증
  // =====================
  describe("인증 검증", () => {
    it("Authorization 헤더가 없으면 401을 반환해야 한다", async () => {
      const request = createCronRequest(); // 토큰 없이 요청

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("잘못된 Bearer 토큰이면 401을 반환해야 한다", async () => {
      const request = createCronRequest("Bearer wrong-token");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("Bearer 형식이 아닌 인증 헤더면 401을 반환해야 한다", async () => {
      const request = createCronRequest("Token test-secret-token");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });

  // =====================
  // 2. 정상 동작
  // =====================
  describe("정상 동작", () => {
    it("두 티커 모두 동기화되면 200과 티커별 요약을 반환해야 한다", async () => {
      vi.mocked(syncTickerPrices).mockImplementation(async (ticker) => createSyncedSummary(ticker));

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.updatedAt).toBeDefined();

      // 티커별 요약(신규/변경/가드)이 응답에 포함되어야 함
      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toMatchObject({
        ticker: "SOXL",
        status: "synced",
        newPriceRows: 1,
        changedPriceRows: 2,
        changedColumns: { adjClose: 2 },
        upsertedMetrics: 3941,
      });
      expect(data.results[1]).toMatchObject({ ticker: "TQQQ", status: "synced" });

      // SOXL, TQQQ 순서로 호출
      const calls = vi.mocked(syncTickerPrices).mock.calls;
      expect(calls[0][0]).toBe("SOXL");
      expect(calls[1][0]).toBe("TQQQ");
    });
  });

  // =====================
  // 3. 분할 가드
  // =====================
  describe("분할 가드", () => {
    it("가드 발동 티커가 있으면 비 2xx로 응답하고 다른 티커는 정상 동기화해야 한다", async () => {
      vi.mocked(syncTickerPrices).mockImplementation(async (ticker) =>
        ticker === "SOXL" ? createGuardSummary(ticker) : createSyncedSummary(ticker)
      );

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.results[0]).toMatchObject({
        ticker: "SOXL",
        status: "guard-triggered",
        guardViolations: [{ date: "2026-07-01", dbClose: 50, fetchedClose: 25, changeRatio: 0.5 }],
      });
      // 가드가 발동해도 다음 티커는 계속 동기화한다
      expect(data.results[1]).toMatchObject({ ticker: "TQQQ", status: "synced" });
      expect(syncTickerPrices).toHaveBeenCalledTimes(2);
    });
  });

  // =====================
  // 4. 에러 처리 (티커 간 격리)
  // =====================
  describe("에러 처리", () => {
    it("한 티커가 실패하면 해당 티커만 error로 기록하고 비 2xx를 반환해야 한다", async () => {
      vi.mocked(syncTickerPrices).mockImplementation(async (ticker) => {
        if (ticker === "SOXL") throw new Error("Yahoo Finance API 오류");
        return createSyncedSummary(ticker);
      });

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.results[0]).toMatchObject({
        ticker: "SOXL",
        status: "error",
        message: "Yahoo Finance API 오류",
      });
      // 실패한 티커 외 나머지는 계속 동기화한다
      expect(data.results[1]).toMatchObject({ ticker: "TQQQ", status: "synced" });
      expect(syncTickerPrices).toHaveBeenCalledTimes(2);
    });

    it("Error 인스턴스가 아닌 에러도 문자열 메시지로 기록해야 한다", async () => {
      vi.mocked(syncTickerPrices).mockImplementation(async (ticker) => {
        if (ticker === "SOXL") throw "문자열 에러"; // Error가 아닌 값
        return createSyncedSummary(ticker);
      });

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.results[0]).toMatchObject({
        ticker: "SOXL",
        status: "error",
        message: "문자열 에러",
      });
    });
  });
});
