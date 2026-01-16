/**
 * engine.ts 통합 테스트
 * SPEC-BACKTEST-001
 */
import { describe, it, expect } from "vitest";
import { BacktestEngine } from "../engine";
import type { BacktestRequest } from "../types";
import type { DailyPrice } from "@/types";

// Mock 가격 데이터 생성 헬퍼
function createMockPrice(
  date: string,
  close: number,
  open?: number,
  high?: number,
  low?: number
): DailyPrice {
  return {
    date,
    open: open ?? close,
    high: high ?? close,
    low: low ?? close,
    close,
    volume: 1000000,
  };
}

describe("BacktestEngine", () => {
  describe("constructor", () => {
    it("전략 이름으로 엔진을 생성할 수 있어야 한다", () => {
      const engine = new BacktestEngine("Pro2");
      expect(engine).toBeDefined();
    });
  });

  describe("run", () => {
    it("최소 2일 이상의 데이터가 필요하다 (첫날은 매수 불가)", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-02",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [createMockPrice("2025-01-02", 100)];

      expect(() => engine.run(request, prices)).toThrow();
    });

    it("기본 백테스트 결과 구조를 반환해야 한다", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-03",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 100),
      ];

      const result = engine.run(request, prices);

      expect(result.strategy).toBe("Pro2");
      expect(result.startDate).toBe("2025-01-02");
      expect(result.endDate).toBe("2025-01-03");
      expect(result.initialCapital).toBe(10000);
      expect(result.dailyHistory).toHaveLength(2);
    });
  });

  describe("매수 로직", () => {
    it("둘째 날부터 매수 주문이 발생해야 한다", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-03",
        initialCapital: 10000,
      };
      // 첫날 종가 100, 둘째날 종가 99 (하락 -> 매수 체결)
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99),
      ];

      const result = engine.run(request, prices);
      const day2 = result.dailyHistory[1];

      // 둘째 날에 매수 체결이 있어야 함
      expect(day2.trades.some((t) => t.type === "BUY")).toBe(true);
    });

    it("종가가 매수 지정가보다 높으면 매수 미체결", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-03",
        initialCapital: 10000,
      };
      // 첫날 종가 100, 둘째날 종가 101 (상승 -> 매수 미체결)
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 101),
      ];

      const result = engine.run(request, prices);
      const day2 = result.dailyHistory[1];

      expect(day2.trades.some((t) => t.type === "BUY")).toBe(false);
    });
  });

  describe("매도 로직", () => {
    it("종가가 매도 지정가 이상이면 매도 체결", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-06",
        initialCapital: 10000,
      };
      // Day 1: 100, Day 2: 99 (매수), Day 3: 101 (매도 시도), Day 4: 102 (매도 체결)
      // Pro2 sellThreshold = +1.5%, 매수가 99, 매도가 = 99 * 1.015 = 100.485 -> 100.48
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99), // 매수
        createMockPrice("2025-01-04", 100), // 매도가 100.48 미달
        createMockPrice("2025-01-05", 100.48), // 매도가 도달
        createMockPrice("2025-01-06", 101),
      ];

      const result = engine.run(request, prices);

      // 매도 체결 확인
      const sellTrade = result.dailyHistory.flatMap((d) => d.trades).find((t) => t.type === "SELL");
      expect(sellTrade).toBeDefined();
    });
  });

  describe("손절 로직", () => {
    it("REQ-006: stopLossDay 도달 시 MOC 매도", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-17",
        initialCapital: 10000,
      };
      // Pro2 stopLossDay = 10
      // Day 1: 100, Day 2: 99 (매수), Day 3-11: 횡보, Day 12: 손절
      const prices: DailyPrice[] = [createMockPrice("2025-01-02", 100)];
      for (let i = 3; i <= 17; i++) {
        prices.push(createMockPrice(`2025-01-${i.toString().padStart(2, "0")}`, 99));
      }

      const result = engine.run(request, prices);

      // 손절 거래 확인
      const stopLossTrade = result.dailyHistory
        .flatMap((d) => d.trades)
        .find((t) => t.type === "STOP_LOSS");
      expect(stopLossTrade).toBeDefined();
      expect(stopLossTrade?.orderType).toBe("MOC");
    });
  });

  describe("사이클 관리", () => {
    it("모든 티어 매도 후 새 사이클 시작", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-10",
        initialCapital: 10000,
      };
      // 간단한 매수-매도 사이클
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99), // 매수
        createMockPrice("2025-01-06", 101), // 매도 (Pro2: 99 * 1.015 = 100.485)
        createMockPrice("2025-01-07", 100),
        createMockPrice("2025-01-08", 99), // 새 사이클 매수
        createMockPrice("2025-01-09", 101),
        createMockPrice("2025-01-10", 102),
      ];

      const result = engine.run(request, prices);

      // 최소 1개 이상의 사이클이 완료되어야 함
      expect(result.totalCycles).toBeGreaterThanOrEqual(1);
    });
  });

  describe("일별 스냅샷", () => {
    it("매일 스냅샷이 기록되어야 한다", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-06",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99),
        createMockPrice("2025-01-04", 98),
        createMockPrice("2025-01-05", 99),
        createMockPrice("2025-01-06", 100),
      ];

      const result = engine.run(request, prices);

      expect(result.dailyHistory.length).toBe(5);
      result.dailyHistory.forEach((snapshot, i) => {
        expect(snapshot.date).toBe(prices[i].date);
        expect(snapshot.close).toBe(prices[i].close);
        expect(snapshot.totalAsset).toBeGreaterThan(0);
      });
    });

    it("스냅샷에 총자산이 올바르게 계산되어야 한다", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-03",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 100),
      ];

      const result = engine.run(request, prices);

      // 첫날은 매수 없이 예수금만
      expect(result.dailyHistory[0].totalAsset).toBe(10000);
    });
  });

  describe("결과 계산", () => {
    it("최종 자산이 올바르게 계산되어야 한다", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-03",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 100),
      ];

      const result = engine.run(request, prices);
      const lastSnapshot = result.dailyHistory[result.dailyHistory.length - 1];

      expect(result.finalAsset).toBe(lastSnapshot.totalAsset);
    });

    it("수익률이 올바르게 계산되어야 한다", () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-03",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 100),
      ];

      const result = engine.run(request, prices);

      // 수익률 = (최종자산 - 초기자본) / 초기자본
      const expectedReturn = (result.finalAsset - result.initialCapital) / result.initialCapital;
      expect(result.returnRate).toBeCloseTo(expectedReturn, 4);
    });
  });
});
