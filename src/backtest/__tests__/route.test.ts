/**
 * API 엔드포인트 테스트
 * SPEC-BACKTEST-001 REQ-012
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/backtest/route";
import type { DailyPrice } from "@/types";

// Mock 인증 모듈 (next-auth ESM 호환성 문제 해결)
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/api-auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "test-user" } }),
  isUnauthorized: vi.fn().mockReturnValue(false),
}));

// Mock 데이터베이스 함수
vi.mock("@/database", () => ({
  getPricesByDateRange: vi.fn(),
}));

import { getPricesByDateRange } from "@/database";

// Mock 가격 데이터 생성
function createMockPrices(count: number, startPrice: number = 100): DailyPrice[] {
  const prices: DailyPrice[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const day = i + 2;
    prices.push({
      date: `2025-01-${day.toString().padStart(2, "0")}`,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      adjClose: price,
      volume: 1000000,
    });
    // 약간의 변동 추가
    price = price * (1 + (Math.random() * 0.02 - 0.01));
  }
  return prices;
}

describe("POST /api/backtest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("유효한 요청", () => {
    it("성공적인 백테스트 결과를 반환해야 한다", async () => {
      const mockPrices = createMockPrices(10, 100);
      vi.mocked(getPricesByDateRange).mockReturnValue(mockPrices);

      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "Pro2",
          startDate: "2025-01-02",
          endDate: "2025-01-11",
          initialCapital: 10000,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.strategy).toBe("Pro2");
      expect(data.data.initialCapital).toBe(10000);
    });

    it("응답에 필수 필드가 포함되어야 한다", async () => {
      const mockPrices = createMockPrices(10, 100);
      vi.mocked(getPricesByDateRange).mockReturnValue(mockPrices);

      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "Pro1",
          startDate: "2025-01-02",
          endDate: "2025-01-11",
          initialCapital: 10000,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.data).toHaveProperty("strategy");
      expect(data.data).toHaveProperty("startDate");
      expect(data.data).toHaveProperty("endDate");
      expect(data.data).toHaveProperty("initialCapital");
      expect(data.data).toHaveProperty("finalAsset");
      expect(data.data).toHaveProperty("returnRate");
      expect(data.data).toHaveProperty("mdd");
      expect(data.data).toHaveProperty("totalCycles");
      expect(data.data).toHaveProperty("winRate");
      expect(data.data).toHaveProperty("dailyHistory");
    });
  });

  describe("유효성 검사", () => {
    it("잘못된 전략 이름은 400 에러를 반환해야 한다", async () => {
      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "InvalidStrategy",
          startDate: "2025-01-02",
          endDate: "2025-01-11",
          initialCapital: 10000,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("필수 필드 누락 시 400 에러를 반환해야 한다", async () => {
      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          // strategy 누락
          startDate: "2025-01-02",
          endDate: "2025-01-11",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("음수 초기자본은 400 에러를 반환해야 한다", async () => {
      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "Pro2",
          startDate: "2025-01-02",
          endDate: "2025-01-11",
          initialCapital: -1000,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("잘못된 날짜 형식은 400 에러를 반환해야 한다", async () => {
      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "Pro2",
          startDate: "invalid-date",
          endDate: "2025-01-11",
          initialCapital: 10000,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("종료일이 시작일보다 앞서면 400 에러를 반환해야 한다", async () => {
      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "Pro2",
          startDate: "2025-01-11",
          endDate: "2025-01-02",
          initialCapital: 10000,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe("에러 처리", () => {
    it("데이터베이스 오류 시 500 에러를 반환해야 한다", async () => {
      vi.mocked(getPricesByDateRange).mockImplementation(() => {
        throw new Error("Database error");
      });

      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "Pro2",
          startDate: "2025-01-02",
          endDate: "2025-01-11",
          initialCapital: 10000,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });

    it("가격 데이터가 부족하면 400 에러를 반환해야 한다", async () => {
      vi.mocked(getPricesByDateRange).mockReturnValue([]);

      const request = new Request("http://localhost/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "SOXL",
          strategy: "Pro2",
          startDate: "2025-01-02",
          endDate: "2025-01-11",
          initialCapital: 10000,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});
