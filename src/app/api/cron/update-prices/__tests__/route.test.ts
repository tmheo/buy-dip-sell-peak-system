/**
 * Cron 가격/지표 업데이트 엔드포인트 단위 테스트
 *
 * GET /api/cron/update-prices 핸들러에 대한 테스트로
 * 인증 검증, 정상 동작, 에러 처리, 엣지 케이스를 검증합니다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

// --- Mock 설정 ---

// dataFetcher mock
vi.mock("@/services/dataFetcher", () => ({
  fetchSince: vi.fn(),
}));

// database/prices mock
vi.mock("@/database/prices", () => ({
  getLatestDate: vi.fn(),
  insertDailyPrices: vi.fn(),
  getAllPricesByTicker: vi.fn(),
}));

// database/metrics mock
vi.mock("@/database/metrics", () => ({
  getLatestMetricDate: vi.fn(),
  insertMetrics: vi.fn(),
}));

// metricsCalculator mock
vi.mock("@/services/metricsCalculator", () => ({
  calculateMetricsBatch: vi.fn(),
}));

import { fetchSince } from "@/services/dataFetcher";
import { getLatestDate, insertDailyPrices, getAllPricesByTicker } from "@/database/prices";
import { getLatestMetricDate, insertMetrics } from "@/database/metrics";
import { calculateMetricsBatch } from "@/services/metricsCalculator";

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

/**
 * 가격 데이터 mock 생성 (getAllPricesByTicker 반환용)
 * 지표 계산에 필요한 최소 60개 이상의 데이터를 생성합니다.
 */
function createMockAllPrices(count: number, ticker: string = "SOXL") {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    ticker,
    date: `2026-01-${(i + 1).toString().padStart(2, "0")}`,
    open: 50.0 + i * 0.1,
    high: 51.0 + i * 0.1,
    low: 49.0 + i * 0.1,
    close: 50.5 + i * 0.1,
    adjClose: 50.5 + i * 0.1,
    volume: 1000000,
    createdAt: null as Date | null,
  }));
}

/**
 * fetchSince에서 반환되는 새 가격 데이터 mock 생성
 */
function createMockNewPrices(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-02-${(i + 4).toString().padStart(2, "0")}`,
    open: 50.0 + i,
    high: 51.0 + i,
    low: 49.0 + i,
    close: 50.5 + i,
    adjClose: 50.5 + i,
    volume: 1000000,
  }));
}

/**
 * calculateMetricsBatch에서 반환되는 지표 데이터 mock 생성
 */
function createMockMetrics(count: number, ticker: string = "SOXL") {
  return Array.from({ length: count }, (_, i) => ({
    ticker,
    date: `2026-02-${(i + 4).toString().padStart(2, "0")}`,
    ma20: 48.5 + i * 0.1,
    ma60: 47.0 + i * 0.1,
    maSlope: 2.1,
    disparity: 4.1,
    rsi14: 55.0,
    roc12: 8.5,
    volatility20: 3.2,
    goldenCross: 3.2,
    isGoldenCross: true,
  }));
}

/**
 * 가격 데이터 조회 성공 시나리오 공통 mock 설정
 * getLatestDate, fetchSince, insertDailyPrices, getAllPricesByTicker를 한 번에 설정합니다.
 */
function setupPriceFetchMocks(
  newPrices: ReturnType<typeof createMockNewPrices>,
  allPrices: ReturnType<typeof createMockAllPrices>
): void {
  vi.mocked(getLatestDate).mockResolvedValue("2026-02-03");
  vi.mocked(fetchSince).mockResolvedValue(newPrices);
  vi.mocked(insertDailyPrices).mockResolvedValue(undefined);
  vi.mocked(getAllPricesByTicker).mockResolvedValue(allPrices);
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
    it("새 가격/지표 데이터가 있을 때 200과 결과를 반환해야 한다", async () => {
      const mockNewPrices = createMockNewPrices(2);
      const mockAllPrices = createMockAllPrices(100);
      const mockMetrics = createMockMetrics(2);

      // SOXL, TQQQ 순서로 호출되므로 각각 설정
      setupPriceFetchMocks(mockNewPrices, mockAllPrices);
      vi.mocked(getLatestMetricDate).mockResolvedValue("2026-02-03");
      vi.mocked(calculateMetricsBatch).mockReturnValue(mockMetrics);
      vi.mocked(insertMetrics).mockResolvedValue(undefined);

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.updatedAt).toBeDefined();

      // 두 티커 모두 결과가 있어야 함
      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toEqual({
        ticker: "SOXL",
        newPrices: 2,
        newMetrics: 2,
      });
      expect(data.results[1]).toEqual({
        ticker: "TQQQ",
        newPrices: 2,
        newMetrics: 2,
      });

      // 각 티커별로 함수가 호출되었는지 검증
      expect(getLatestDate).toHaveBeenCalledTimes(2);
      expect(fetchSince).toHaveBeenCalledTimes(2);
      expect(insertDailyPrices).toHaveBeenCalledTimes(2);
      expect(getAllPricesByTicker).toHaveBeenCalledTimes(2);
      expect(getLatestMetricDate).toHaveBeenCalledTimes(2);
      expect(calculateMetricsBatch).toHaveBeenCalledTimes(2);
      expect(insertMetrics).toHaveBeenCalledTimes(2);
    });

    it("새 가격 데이터가 없으면 newPrices: 0, newMetrics: 0을 반환해야 한다", async () => {
      const mockAllPrices = createMockAllPrices(100);

      vi.mocked(getLatestDate).mockResolvedValue("2026-02-03");
      vi.mocked(fetchSince).mockResolvedValue([]); // 새 데이터 없음
      vi.mocked(getAllPricesByTicker).mockResolvedValue(mockAllPrices);
      // 지표도 최신 상태 → startIdx > endIdx → 지표 계산 건너뜀
      vi.mocked(getLatestMetricDate).mockResolvedValue(
        mockAllPrices[mockAllPrices.length - 1].date
      );

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toEqual({
        ticker: "SOXL",
        newPrices: 0,
        newMetrics: 0,
      });
      expect(data.results[1]).toEqual({
        ticker: "TQQQ",
        newPrices: 0,
        newMetrics: 0,
      });

      // 새 데이터가 없으므로 가격 삽입은 호출되지 않아야 함
      expect(insertDailyPrices).not.toHaveBeenCalled();
      // 지표도 최신이므로 계산/삽입이 호출되지 않아야 함
      expect(calculateMetricsBatch).not.toHaveBeenCalled();
      expect(insertMetrics).not.toHaveBeenCalled();
    });

    it("가격은 있지만 계산할 새 지표가 없을 때 newMetrics: 0을 반환해야 한다", async () => {
      const mockNewPrices = createMockNewPrices(2);
      const mockAllPrices = createMockAllPrices(100);

      setupPriceFetchMocks(mockNewPrices, mockAllPrices);
      // latestMetricDate가 마지막 날짜와 같아서 startIdx > endIdx가 됨
      vi.mocked(getLatestMetricDate).mockResolvedValue(
        mockAllPrices[mockAllPrices.length - 1].date
      );

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].newPrices).toBe(2);
      expect(data.results[0].newMetrics).toBe(0);

      // 지표 계산이 호출되지 않아야 함
      expect(calculateMetricsBatch).not.toHaveBeenCalled();
    });

    it("calculateMetricsBatch가 빈 배열을 반환하면 newMetrics: 0이어야 한다", async () => {
      const mockNewPrices = createMockNewPrices(2);
      const mockAllPrices = createMockAllPrices(100);

      setupPriceFetchMocks(mockNewPrices, mockAllPrices);
      vi.mocked(getLatestMetricDate).mockResolvedValue("2026-01-01");
      vi.mocked(calculateMetricsBatch).mockReturnValue([]); // 빈 지표

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].newPrices).toBe(2);
      expect(data.results[0].newMetrics).toBe(0);

      // 빈 배열이면 insertMetrics가 호출되지 않아야 함
      expect(insertMetrics).not.toHaveBeenCalled();
    });
  });

  // =====================
  // 3. 에러 처리
  // =====================
  describe("에러 처리", () => {
    it("fetchSince가 재시도 후에도 실패하면 500을 반환해야 한다", async () => {
      // 타이머를 가짜로 대체하여 재시도 딜레이를 건너뜀
      vi.useFakeTimers();

      vi.mocked(getLatestDate).mockResolvedValue("2026-02-03");
      vi.mocked(fetchSince).mockRejectedValue(new Error("Yahoo Finance API 오류"));

      const request = createCronRequest("Bearer test-secret-token");

      // GET 호출은 내부 setTimeout 때문에 pending 상태로 남음
      // advanceTimersToNextTimerAsync()로 타이머를 진행시킴
      const responsePromise = GET(request);

      // 재시도 간격: 1초 → 2초 (총 2회 재시도, 3번 시도 후 실패)
      // 1차 실패 → 1초 대기
      await vi.advanceTimersByTimeAsync(1000);
      // 2차 실패 → 2초 대기
      await vi.advanceTimersByTimeAsync(2000);

      const response = await responsePromise;
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Update failed");
      expect(data.message).toBe("Internal server error");

      // 3번 시도되었는지 확인 (SOXL에서 실패하면 TQQQ는 시도 안 함)
      expect(fetchSince).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it("insertDailyPrices가 실패하면 500을 반환해야 한다", async () => {
      vi.useFakeTimers();

      vi.mocked(getLatestDate).mockResolvedValue("2026-02-03");
      vi.mocked(fetchSince).mockResolvedValue(createMockNewPrices(2));
      vi.mocked(insertDailyPrices).mockRejectedValue(new Error("DB 삽입 실패"));

      const request = createCronRequest("Bearer test-secret-token");
      const responsePromise = GET(request);

      // 재시도 타이머 진행
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const response = await responsePromise;
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Update failed");
      expect(data.message).toBe("Internal server error");

      vi.useRealTimers();
    });

    it("Error 인스턴스가 아닌 에러도 일반 에러 메시지를 반환해야 한다", async () => {
      vi.useFakeTimers();

      vi.mocked(getLatestDate).mockResolvedValue("2026-02-03");
      vi.mocked(fetchSince).mockRejectedValue("문자열 에러"); // Error가 아닌 값

      const request = createCronRequest("Bearer test-secret-token");
      const responsePromise = GET(request);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const response = await responsePromise;
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Update failed");
      expect(data.message).toBe("Internal server error");

      vi.useRealTimers();
    });
  });

  // =====================
  // 4. 엣지 케이스
  // =====================
  describe("엣지 케이스", () => {
    it("저장된 가격 데이터가 없으면 (getLatestDate null) 크래시 없이 0을 반환해야 한다", async () => {
      vi.mocked(getLatestDate).mockResolvedValue(null); // 데이터 없음

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toEqual({
        ticker: "SOXL",
        newPrices: 0,
        newMetrics: 0,
      });
      expect(data.results[1]).toEqual({
        ticker: "TQQQ",
        newPrices: 0,
        newMetrics: 0,
      });

      // fetchSince는 호출되지 않아야 함
      expect(fetchSince).not.toHaveBeenCalled();
    });

    it("getLatestMetricDate가 null이면 startIdx를 59로 설정하여 계산해야 한다", async () => {
      const mockNewPrices = createMockNewPrices(2);
      const mockAllPrices = createMockAllPrices(100);
      const mockMetrics = createMockMetrics(2);

      setupPriceFetchMocks(mockNewPrices, mockAllPrices);
      vi.mocked(getLatestMetricDate).mockResolvedValue(null); // 지표 데이터 없음
      vi.mocked(calculateMetricsBatch).mockReturnValue(mockMetrics);
      vi.mocked(insertMetrics).mockResolvedValue(undefined);

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].newMetrics).toBe(2);

      // calculateMetricsBatch의 startIdx가 59로 호출되었는지 확인
      const calls = vi.mocked(calculateMetricsBatch).mock.calls;
      expect(calls[0][3]).toBe(59); // startIdx 파라미터
    });

    it("getLatestMetricDate가 존재하지 않는 날짜를 반환하면 startIdx를 59로 설정해야 한다", async () => {
      const mockNewPrices = createMockNewPrices(2);
      const mockAllPrices = createMockAllPrices(100);
      const mockMetrics = createMockMetrics(2);

      setupPriceFetchMocks(mockNewPrices, mockAllPrices);
      // dates 배열에 존재하지 않는 날짜 반환
      vi.mocked(getLatestMetricDate).mockResolvedValue("1999-01-01");
      vi.mocked(calculateMetricsBatch).mockReturnValue(mockMetrics);
      vi.mocked(insertMetrics).mockResolvedValue(undefined);

      const request = createCronRequest("Bearer test-secret-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].newMetrics).toBe(2);

      // startIdx가 59로 설정되었는지 확인
      const calls = vi.mocked(calculateMetricsBatch).mock.calls;
      expect(calls[0][3]).toBe(59);
    });

    it("insertDailyPrices에 ticker 필드가 포함되어 전달되어야 한다", async () => {
      const mockNewPrices = createMockNewPrices(1);
      const mockAllPrices = createMockAllPrices(100);

      setupPriceFetchMocks(mockNewPrices, mockAllPrices);
      vi.mocked(getLatestMetricDate).mockResolvedValue(
        mockAllPrices[mockAllPrices.length - 1].date
      );

      const request = createCronRequest("Bearer test-secret-token");
      await GET(request);

      // 첫 번째 호출 (SOXL)의 인자 확인
      const firstCall = vi.mocked(insertDailyPrices).mock.calls[0][0];
      expect(firstCall[0]).toHaveProperty("ticker", "SOXL");
      expect(firstCall[0]).toHaveProperty("date", mockNewPrices[0].date);
      expect(firstCall[0]).toHaveProperty("open", mockNewPrices[0].open);
      expect(firstCall[0]).toHaveProperty("high", mockNewPrices[0].high);
      expect(firstCall[0]).toHaveProperty("low", mockNewPrices[0].low);
      expect(firstCall[0]).toHaveProperty("close", mockNewPrices[0].close);
      expect(firstCall[0]).toHaveProperty("adjClose", mockNewPrices[0].adjClose);
      expect(firstCall[0]).toHaveProperty("volume", mockNewPrices[0].volume);
    });

    it("SOXL과 TQQQ 순서대로 업데이트해야 한다", async () => {
      vi.mocked(getLatestDate).mockResolvedValue("2026-02-03");
      vi.mocked(fetchSince).mockResolvedValue([]);

      const request = createCronRequest("Bearer test-secret-token");
      await GET(request);

      // getLatestDate 호출 순서 확인
      const calls = vi.mocked(getLatestDate).mock.calls;
      expect(calls[0][0]).toBe("SOXL");
      expect(calls[1][0]).toBe("TQQQ");
    });
  });
});
