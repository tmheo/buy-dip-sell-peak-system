/**
 * RecommendBacktestEngine 테스트
 * #48: 추천 백테스트 엔진도 src/strategy의 planOrders + settle 합성을 소비한다.
 *
 * 추천이 고정이면 일반 백테스트와 동일한 결과가 나와야 한다(동등성).
 * 가격 픽스처는 close와 adjClose를 다르게 두어 adjClose 불변식(#43)을 함께 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DailyPrice } from "@/types";
import type { Strategy } from "@/types/trading";
import { BacktestEngine } from "@/backtest/engine";
import { RecommendBacktestEngine } from "../engine";
import { getQuickRecommendation } from "../recommend-helper";

vi.mock("../recommend-helper", () => ({
  getQuickRecommendation: vi.fn(),
}));

const mockedRecommend = vi.mocked(getQuickRecommendation);

// close를 adjClose와 다르게 두어, 엔진이 close를 쓰면 동등성이 깨지게 한다
function createMockPrice(date: string, adjClose: number): DailyPrice {
  return {
    date,
    open: adjClose + 50,
    high: adjClose + 50,
    low: adjClose + 50,
    close: adjClose + 50,
    adjClose,
    volume: 1000000,
  };
}

function recommendation(strategy: Strategy) {
  return {
    strategy,
    reason: `${strategy} 추천`,
    metrics: { rsi14: 50, isGoldenCross: true },
  } as Awaited<ReturnType<typeof getQuickRecommendation>>;
}

// 매수(하락) → 추가 매수 → 전량 매도(사이클 완료) → 재매수 → 매도를 지나는 시나리오
const PRICES: DailyPrice[] = [
  createMockPrice("2025-01-02", 100),
  createMockPrice("2025-01-03", 99), // T1 매수
  createMockPrice("2025-01-06", 98), // T2 매수
  createMockPrice("2025-01-07", 105), // 전량 매도 → 사이클 완료
  createMockPrice("2025-01-08", 104), // 새 사이클 T1 매수
  createMockPrice("2025-01-09", 106), // 매도 → 사이클 완료
  createMockPrice("2025-01-10", 107),
];

function dateToIndexMap(prices: DailyPrice[]): Map<string, number> {
  return new Map(prices.map((p, i) => [p.date, i]));
}

describe("RecommendBacktestEngine", () => {
  beforeEach(() => {
    mockedRecommend.mockReset();
  });

  it("추천이 고정(Pro2)이면 일반 백테스트(Pro2)와 동일한 결과여야 한다", async () => {
    mockedRecommend.mockResolvedValue(recommendation("Pro2"));

    const initialCapital = 10000;
    const expected = new BacktestEngine("Pro2").run(
      {
        ticker: "SOXL",
        strategy: "Pro2",
        startDate: PRICES[0].date,
        endDate: PRICES[PRICES.length - 1].date,
        initialCapital,
      },
      PRICES,
      0
    );

    const engine = new RecommendBacktestEngine("SOXL", PRICES, dateToIndexMap(PRICES));
    const result = await engine.run(
      {
        ticker: "SOXL",
        startDate: PRICES[0].date,
        endDate: PRICES[PRICES.length - 1].date,
        initialCapital,
      },
      0
    );

    expect(result.finalAsset).toBe(expected.finalAsset);
    expect(result.returnRate).toBe(expected.returnRate);
    expect(result.mdd).toBe(expected.mdd);
    expect(result.totalCycles).toBe(expected.totalCycles);
    expect(result.winRate).toBe(expected.winRate);
    expect(result.remainingTiers).toEqual(expected.remainingTiers);
    expect(result.completedCycles.map((c) => c.profit)).toEqual(
      expected.completedCycles.map((c) => c.profit)
    );
    expect(result.dailyHistory).toHaveLength(expected.dailyHistory.length);
    for (let i = 0; i < result.dailyHistory.length; i++) {
      const actual = result.dailyHistory[i];
      const wanted = expected.dailyHistory[i];
      expect(actual.cash).toBe(wanted.cash);
      expect(actual.totalAsset).toBe(wanted.totalAsset);
      expect(actual.activeTiers).toBe(wanted.activeTiers);
      expect(actual.trades).toEqual(wanted.trades);
      expect(actual.orders).toEqual(wanted.orders);
      expect(actual.strategy).toBe("Pro2");
    }
  });

  it("사이클 경계에서 추천 전략으로 전환해야 한다", async () => {
    // 첫 사이클 Pro2, 이후 추천은 Pro3
    mockedRecommend.mockImplementation(async () => recommendation("Pro3"));

    const engine = new RecommendBacktestEngine("SOXL", PRICES, dateToIndexMap(PRICES));
    const result = await engine.run(
      {
        ticker: "SOXL",
        startDate: PRICES[0].date,
        endDate: PRICES[PRICES.length - 1].date,
        initialCapital: 10000,
      },
      0
    );

    // 모든 사이클이 추천값(Pro3)을 따른다 (첫 사이클도 시작 전 추천을 받는다)
    for (const cycle of result.cycleStrategies) {
      expect(cycle.strategy).toBe("Pro3");
    }
    expect(result.strategyStats.Pro3.cycles).toBe(result.cycleStrategies.length);
    expect(result.strategyStats.Pro2.cycles).toBe(0);
  });

  it("추천 실패(null) 시 기본 전략 Pro2로 진행해야 한다", async () => {
    mockedRecommend.mockResolvedValue(null);

    const engine = new RecommendBacktestEngine("SOXL", PRICES, dateToIndexMap(PRICES));
    const result = await engine.run(
      {
        ticker: "SOXL",
        startDate: PRICES[0].date,
        endDate: PRICES[PRICES.length - 1].date,
        initialCapital: 10000,
      },
      0
    );

    expect(result.cycleStrategies[0].strategy).toBe("Pro2");
    expect(result.cycleStrategies[0].recommendReason).toBe("기본 전략");
  });

  it("사이클 자본은 실현 손익을 복리로 이월해야 한다", async () => {
    mockedRecommend.mockResolvedValue(recommendation("Pro2"));

    const engine = new RecommendBacktestEngine("SOXL", PRICES, dateToIndexMap(PRICES));
    const result = await engine.run(
      {
        ticker: "SOXL",
        startDate: PRICES[0].date,
        endDate: PRICES[PRICES.length - 1].date,
        initialCapital: 10000,
      },
      0
    );

    const [first, second] = result.cycleStrategies;
    expect(first.finalAsset).not.toBeNull();
    // 다음 사이클 자본 = 직전 사이클 종료 시 총 자산 (풀복리)
    expect(second.initialCapital).toBeCloseTo(first.finalAsset as number, 2);
  });
});
