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
  adjClose: number,
  open?: number,
  high?: number,
  low?: number
): DailyPrice {
  return {
    date,
    open: open ?? adjClose,
    high: high ?? adjClose,
    low: low ?? adjClose,
    close: adjClose,
    adjClose,
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
    it("최소 2일 이상의 데이터가 필요하다 (첫날은 매수 불가)", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-02",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [createMockPrice("2025-01-02", 100)];

      await expect(engine.run(request, prices)).rejects.toThrow();
    });

    it("기본 백테스트 결과 구조를 반환해야 한다", async () => {
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

      const result = await engine.run(request, prices);

      expect(result.strategy).toBe("Pro2");
      expect(result.startDate).toBe("2025-01-02");
      expect(result.endDate).toBe("2025-01-03");
      expect(result.initialCapital).toBe(10000);
      expect(result.dailyHistory).toHaveLength(2);
    });
  });

  describe("매수 로직", () => {
    it("둘째 날부터 매수 주문이 발생해야 한다", async () => {
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

      const result = await engine.run(request, prices);
      const day2 = result.dailyHistory[1];

      // 둘째 날에 매수 체결이 있어야 함
      expect(day2.trades.some((t) => t.type === "BUY")).toBe(true);
    });

    it("종가가 매수 지정가보다 높으면 매수 미체결", async () => {
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

      const result = await engine.run(request, prices);
      const day2 = result.dailyHistory[1];

      expect(day2.trades.some((t) => t.type === "BUY")).toBe(false);
    });
  });

  describe("매도 로직", () => {
    it("종가가 매도 지정가 이상이면 매도 체결", async () => {
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

      const result = await engine.run(request, prices);

      // 매도 체결 확인
      const sellTrade = result.dailyHistory.flatMap((d) => d.trades).find((t) => t.type === "SELL");
      expect(sellTrade).toBeDefined();
    });
  });

  describe("손절 로직", () => {
    it("REQ-006: stopLossDay 도달 시 MOC 매도", async () => {
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

      const result = await engine.run(request, prices);

      // 손절 거래 확인
      const stopLossTrade = result.dailyHistory
        .flatMap((d) => d.trades)
        .find((t) => t.type === "STOP_LOSS");
      expect(stopLossTrade).toBeDefined();
      expect(stopLossTrade?.orderType).toBe("MOC");
    });
  });

  describe("사이클 관리", () => {
    it("모든 티어 매도 후 새 사이클 시작", async () => {
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

      const result = await engine.run(request, prices);

      // 최소 1개 이상의 사이클이 완료되어야 함
      expect(result.totalCycles).toBeGreaterThanOrEqual(1);
    });
  });

  describe("일별 스냅샷", () => {
    it("매일 스냅샷이 기록되어야 한다", async () => {
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

      const result = await engine.run(request, prices);

      expect(result.dailyHistory.length).toBe(5);
      result.dailyHistory.forEach((snapshot, i) => {
        expect(snapshot.date).toBe(prices[i].date);
        expect(snapshot.adjClose).toBe(prices[i].adjClose);
        expect(snapshot.totalAsset).toBeGreaterThan(0);
      });
    });

    it("스냅샷에 총자산이 올바르게 계산되어야 한다", async () => {
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

      const result = await engine.run(request, prices);

      // 첫날은 매수 없이 예수금만
      expect(result.dailyHistory[0].totalAsset).toBe(10000);
    });
  });

  describe("src/strategy 이행 (#46)", () => {
    it("체결 판정과 체결가는 close가 아닌 adjClose를 사용해야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-03",
        initialCapital: 10000,
      };
      // close 기준으로는 보합(매수 미체결), adjClose 기준으로는 하락(매수 체결)
      const prices: DailyPrice[] = [
        {
          date: "2025-01-02",
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          adjClose: 90,
          volume: 1000000,
        },
        {
          date: "2025-01-03",
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          adjClose: 89,
          volume: 1000000,
        },
      ];

      const result = await engine.run(request, prices);
      const day2 = result.dailyHistory[1];

      // 매수 지정가 = floor(90 × 0.9999) = 89.99, 당일 adjClose 89 ≤ 89.99 → 체결
      const buyTrade = day2.trades.find((t) => t.type === "BUY");
      expect(buyTrade).toBeDefined();
      expect(buyTrade!.price).toBe(89);
      // 수량 = floor(1000 / 89.99) = 11
      expect(buyTrade!.shares).toBe(11);
      // 보유 자산 평가도 adjClose 기준
      expect(day2.holdingsValue).toBe(11 * 89);
    });

    it("ADR-0001: 손절 매도 시 원금이 즉시 회복되어 다음 매수 여력이 생겨야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-20",
        initialCapital: 10000,
      };
      // 하락 지속: 티어 1-7 순차 매수 후 폭락, 손절일(10 거래일) 도달로 티어 1 MOC 매도.
      // 예수금 = 사이클 자본 - Σ(활성 티어 투자원금)이므로 티어 1 원금은 손실과 무관하게
      // 전액 회복되고, 다음 날 티어 1 재매수가 체결되어야 한다.
      // (기존 예수금 의미에서는 손실만큼 현금이 부족해 매수가 불가능했다)
      const closes = [100, 99, 98, 97, 96, 95, 94, 93, 75, 60, 50, 45, 44];
      const prices: DailyPrice[] = closes.map((close, i) =>
        createMockPrice(`2025-01-${(2 + i).toString().padStart(2, "0")}`, close)
      );

      const result = await engine.run(request, prices);

      // 11일째(45): 티어 1 손절 MOC 매도
      const day11 = result.dailyHistory[11];
      const stopLoss = day11.trades.find((t) => t.type === "STOP_LOSS");
      expect(stopLoss).toBeDefined();
      expect(stopLoss!.tier).toBe(1);
      expect(stopLoss!.price).toBe(45);

      // 12일째(44): 티어 1 재매수 체결 (금액 = min(1000, 예수금), 지정가 44.99)
      const day12 = result.dailyHistory[12];
      const rebuy = day12.trades.find((t) => t.type === "BUY");
      expect(rebuy).toBeDefined();
      expect(rebuy!.tier).toBe(1);
      expect(rebuy!.shares).toBe(22); // floor(1000 / 44.99)
      expect(rebuy!.price).toBe(44);
    });

    it("ADR-0001: 사이클 중 실현 수익은 현금에 쌓이되 매수 여력에 포함되지 않아야 한다", async () => {
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
        createMockPrice("2025-01-03", 99), // 티어 1 매수: 10주 @99 (원금 990)
        createMockPrice("2025-01-04", 98), // 티어 2 매수: 15주 @98 (원금 1470)
        createMockPrice("2025-01-05", 99.5), // 티어 2 매도 (지정가 99.47): 수익 22.5, 티어 1 보유 유지
        createMockPrice("2025-01-06", 98.5), // 티어 2 재매수
      ];

      const result = await engine.run(request, prices);

      // 매도일: 현금 = 사이클 자본 - 활성 원금(990) + 실현 수익(22.5)
      const sellDay = result.dailyHistory[3];
      expect(sellDay.cash).toBe(10000 - 990 + 22.5);
      expect(sellDay.holdingsValue).toBe(10 * 99.5);
      expect(sellDay.totalAsset).toBe(10000 - 990 + 22.5 + 995);

      // 재매수일: 티어 2 금액은 사이클 자본 × 15% 그대로 (실현 수익 미반영)
      // 수량 = floor(1500 / 99.49) = 15
      const rebuyDay = result.dailyHistory[4];
      const rebuy = rebuyDay.trades.find((t) => t.type === "BUY");
      expect(rebuy).toBeDefined();
      expect(rebuy!.tier).toBe(2);
      expect(rebuy!.shares).toBe(15);
      expect(result.totalCycles).toBe(1);
    });

    it("사이클 경계에서 실현 손익이 다음 사이클 자본으로 복리 이월되어야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-07",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99), // 티어 1 매수: 10주 @99
        createMockPrice("2025-01-04", 101), // 티어 1 매도 (지정가 100.48): 수익 20 → 사이클 완료
        createMockPrice("2025-01-06", 111.15), // 새 사이클 시작 (자본 10020), 매수 미체결
        createMockPrice("2025-01-07", 111), // 티어 1 매수: floor(1002 / 111.13) = 9주
      ];

      const result = await engine.run(request, prices);

      expect(result.totalCycles).toBe(2);
      expect(result.completedCycles).toEqual([{ profit: 20, strategy: "Pro2" }]);

      // 새 사이클 첫날: 현금 = 새 사이클 자본 10020
      const newCycleDay = result.dailyHistory[3];
      expect(newCycleDay.cycleNumber).toBe(2);
      expect(newCycleDay.cash).toBe(10020);

      // 티어 1 금액 = 10020 × 10% = 1002 → floor(1002 / 111.13) = 9주
      // (이월이 없었다면 floor(1000 / 111.13) = 8주)
      const buy = result.dailyHistory[4].trades.find((t) => t.type === "BUY");
      expect(buy).toBeDefined();
      expect(buy!.shares).toBe(9);
    });
  });

  describe("backtestStartIndex", () => {
    it("backtestStartIndex가 0일 때 전체 데이터로 백테스트해야 한다", async () => {
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

      const result = await engine.run(request, prices, 0);

      // 전체 5일 데이터가 dailyHistory에 포함
      expect(result.dailyHistory.length).toBe(5);
    });

    it("backtestStartIndex가 설정되면 해당 인덱스부터 거래를 시작해야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-05",
        endDate: "2025-01-08",
        initialCapital: 10000,
      };
      // 과거 데이터 3일 + 백테스트 기간 4일 = 7일
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100), // 과거 데이터 (지표 계산용)
        createMockPrice("2025-01-03", 101),
        createMockPrice("2025-01-04", 102),
        createMockPrice("2025-01-05", 103), // backtestStartIndex = 3
        createMockPrice("2025-01-06", 102),
        createMockPrice("2025-01-07", 101),
        createMockPrice("2025-01-08", 100),
      ];

      const result = await engine.run(request, prices, 3);

      // 백테스트 기간 4일만 dailyHistory에 포함
      expect(result.dailyHistory.length).toBe(4);
      expect(result.dailyHistory[0].date).toBe("2025-01-05");
    });

    it("backtestStartIndex 이전 데이터도 지표 계산에 사용해야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-03-01",
        endDate: "2025-03-05",
        initialCapital: 10000,
      };
      // 60일 과거 데이터 + 5일 백테스트 = 65일
      const prices: DailyPrice[] = [];
      for (let i = 0; i < 65; i++) {
        const date = new Date("2025-01-01");
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        prices.push(createMockPrice(dateStr, 100 + i * 0.5));
      }

      // backtestStartIndex = 60 (61번째 날부터 백테스트)
      const result = await engine.run(request, prices, 60);

      // 백테스트 기간 5일만 dailyHistory에 포함
      expect(result.dailyHistory.length).toBe(5);
      // 지표는 과거 데이터를 포함하여 계산되므로 MA가 null이 아님
      expect(result.dailyHistory[0].ma20).not.toBeNull();
      expect(result.dailyHistory[0].ma60).not.toBeNull();
    });

    it("backtestStartIndex 미지정 시 기본값 0으로 동작해야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-04",
        initialCapital: 10000,
      };
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99),
        createMockPrice("2025-01-04", 98),
      ];

      // backtestStartIndex 미지정
      const result = await engine.run(request, prices);

      expect(result.dailyHistory.length).toBe(3);
    });
  });

  describe("결과 계산", () => {
    it("최종 자산이 올바르게 계산되어야 한다", async () => {
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

      const result = await engine.run(request, prices);
      const lastSnapshot = result.dailyHistory[result.dailyHistory.length - 1];

      expect(result.finalAsset).toBe(lastSnapshot.totalAsset);
    });

    it("수익률이 올바르게 계산되어야 한다", async () => {
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

      const result = await engine.run(request, prices);

      // 수익률 = (최종자산 - 초기자본) / 초기자본
      const expectedReturn = (result.finalAsset - result.initialCapital) / result.initialCapital;
      expect(result.returnRate).toBeCloseTo(expectedReturn, 4);
    });
  });

  describe("잔여 티어", () => {
    it("매수 후 매도되지 않은 티어가 잔여 티어로 반환되어야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-05",
        initialCapital: 10000,
      };
      // 매수 후 매도 조건 미충족 상태로 종료
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99), // 매수 체결
        createMockPrice("2025-01-04", 99), // 매도 미체결
        createMockPrice("2025-01-05", 99), // 매도 미체결
      ];

      const result = await engine.run(request, prices);

      // 잔여 티어가 존재해야 함
      expect(result.remainingTiers.length).toBeGreaterThan(0);
      expect(result.remainingTiers[0].tier).toBe(1);
      expect(result.remainingTiers[0].currentPrice).toBe(99);
    });

    it("모든 티어가 매도되면 잔여 티어가 없어야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-05",
        initialCapital: 10000,
      };
      // 매수 후 매도 체결
      // Pro2 sellThreshold = +1.5%, 매수가 99, 매도가 = 99 * 1.015 = 100.485 -> floor = 100.48
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99), // 매수 체결
        createMockPrice("2025-01-04", 100.48), // 매도 체결
        createMockPrice("2025-01-05", 101),
      ];

      const result = await engine.run(request, prices);

      // 매도 후 새 매수가 없으므로 잔여 티어 없음
      expect(result.remainingTiers.length).toBe(0);
    });

    it("잔여 티어의 수익률이 올바르게 계산되어야 한다", async () => {
      const engine = new BacktestEngine("Pro2");
      const request: BacktestRequest = {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: "2025-01-02",
        endDate: "2025-01-04",
        initialCapital: 10000,
      };
      // 매수 후 횡보 (추가 매수 발생하지 않도록)
      const prices: DailyPrice[] = [
        createMockPrice("2025-01-02", 100),
        createMockPrice("2025-01-03", 99), // 매수 체결 (체결가 = 종가 = 99)
        createMockPrice("2025-01-04", 90), // 횡보 - 매수 지정가(99*0.9999=98.99) 이상이면 추가 매수 없음
      ];

      const result = await engine.run(request, prices);

      // 잔여 티어가 있어야 함
      expect(result.remainingTiers.length).toBeGreaterThanOrEqual(1);
      // 첫 번째 티어의 수익률 확인
      const tier1 = result.remainingTiers.find((t) => t.tier === 1);
      expect(tier1).toBeDefined();
      expect(tier1!.buyPrice).toBe(99);
      expect(tier1!.currentPrice).toBe(90);
      // 수익률: (90 - 99) / 99 ≈ -0.0909 (-9.09%)
      expect(tier1!.returnRate).toBeCloseTo(-0.0909, 3);
    });
  });
});
