/**
 * BacktestEngine 전략 결정 경계(StrategyProvider) 테스트 (이슈 #63)
 *
 * 공급자(StrategyProvider) 호출 시점 계약 (#61, 모두 전일 종가 기준일):
 * 1. 백테스트 시작 전날 (초기 전략)
 * 2. 사이클 완료 익일 (새 사이클 전략)
 * 3. 사이클 내 첫 매수 전 매일 (재평가 - 추천이 바뀌면 전략 교체)
 *
 * 공급자 모드는 DB 없이 가짜 공급자(정해진 순서로 전략 반환)로 검증한다.
 */
import { describe, it, expect } from "vitest";
import { BacktestEngine } from "../engine";
import type { BacktestRequest, StrategyDecision, StrategyProvider } from "../types";
import type { Strategy } from "@/types/trading";
import type { DailyPrice } from "@/types";

function createMockPrice(date: string, adjClose: number): DailyPrice {
  return {
    date,
    open: adjClose,
    high: adjClose,
    low: adjClose,
    close: adjClose,
    adjClose,
    volume: 1000000,
  };
}

function createRequest(prices: DailyPrice[], startIndex = 0): BacktestRequest {
  return {
    ticker: "SOXL",
    strategy: "Pro2",
    startDate: prices[startIndex].date,
    endDate: prices[prices.length - 1].date,
    initialCapital: 10000,
  };
}

function decision(strategy: Strategy, reason = `${strategy} 추천`): StrategyDecision {
  return {
    strategy,
    reason,
    metrics: { rsi14: 42, isGoldenCross: true },
  };
}

/** 정해진 순서로 전략을 반환하는 가짜 공급자 (호출 기록 포함) */
function fakeProvider(sequence: StrategyDecision[]) {
  let callCount = 0;
  const calls: { referenceDate: string; cycleNumber: number }[] = [];
  const provider: StrategyProvider = async (referenceDate, cycleNumber) => {
    calls.push({ referenceDate, cycleNumber });
    const result = sequence[Math.min(callCount, sequence.length - 1)];
    callCount++;
    return result;
  };
  return { provider, calls };
}

describe("고정 전략 모드 (공급자 없음) - 상위집합 결과", () => {
  it("사이클별 정보를 '고정 전략' 사유로 채우고 스냅샷마다 전략을 기록해야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    const prices = [
      createMockPrice("2025-01-02", 100),
      createMockPrice("2025-01-03", 99),
      createMockPrice("2025-01-04", 99),
    ];

    const result = await engine.run(createRequest(prices), prices);

    expect(result.cycleStrategies).toHaveLength(1);
    const cycle = result.cycleStrategies[0];
    expect(cycle.cycleNumber).toBe(1);
    expect(cycle.strategy).toBe("Pro2");
    expect(cycle.recommendReason).toBe("고정 전략");
    expect(cycle.initialCapital).toBe(10000);
    // 데이터 부족(60일 미만)이면 시작 지표는 중립값
    expect(cycle.startRsi).toBe(0);
    expect(cycle.isGoldenCross).toBe(false);

    for (const snapshot of result.dailyHistory) {
      expect(snapshot.strategy).toBe("Pro2");
    }

    expect(result.strategyStats.Pro2.cycles).toBe(1);
    expect(result.strategyStats.Pro2.totalDays).toBe(3);
    expect(result.strategyStats.Pro1).toEqual({ cycles: 0, totalDays: 0 });
    expect(result.strategyStats.Pro3).toEqual({ cycles: 0, totalDays: 0 });
  });

  it("사이클이 완료되면 사이클 정보를 마감하고 완료 사이클에 전략을 기록해야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    // 매수(99) → 매도(+1.5% 이상: 100.48) → 사이클 완료 → 새 사이클 매수
    const prices = [
      createMockPrice("2025-01-02", 100),
      createMockPrice("2025-01-03", 99),
      createMockPrice("2025-01-04", 100.48),
      createMockPrice("2025-01-06", 110),
      createMockPrice("2025-01-07", 108),
    ];

    const result = await engine.run(createRequest(prices), prices);

    expect(result.totalCycles).toBe(2);
    expect(result.cycleStrategies).toHaveLength(2);

    const first = result.cycleStrategies[0];
    expect(first.endDate).toBe("2025-01-04");
    expect(first.finalAsset).not.toBeNull();
    expect(first.returnRate).not.toBeNull();

    const second = result.cycleStrategies[1];
    expect(second.cycleNumber).toBe(2);
    expect(second.strategy).toBe("Pro2");
    expect(second.recommendReason).toBe("고정 전략");
    expect(second.endDate).toBeNull();

    expect(result.completedCycles).toEqual([{ profit: expect.any(Number), strategy: "Pro2" }]);
  });

  it("60일 이상 과거 데이터가 있으면 시작 지표를 엔진이 직접 계산해야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    // 70일 상승 시계열: 백테스트 시작 전날 기준 RSI > 0, MA20 > MA60 (정배열)
    const prices: DailyPrice[] = [];
    for (let i = 0; i < 70; i++) {
      const date = new Date(Date.UTC(2025, 0, 1));
      date.setUTCDate(date.getUTCDate() + i);
      prices.push(createMockPrice(date.toISOString().slice(0, 10), 100 + i * 0.5));
    }

    const result = await engine.run(createRequest(prices, 65), prices, 65);

    const cycle = result.cycleStrategies[0];
    expect(cycle.startRsi).toBeGreaterThan(0);
    expect(cycle.isGoldenCross).toBe(true);
  });
});

describe("공급자 모드 - 초기 전략 결정", () => {
  it("백테스트 시작 전날 기준일로 공급자를 호출해 초기 전략을 정해야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    const prices = [
      createMockPrice("2025-01-02", 100), // 과거 데이터
      createMockPrice("2025-01-03", 100), // 백테스트 시작 (startIndex 1)
      createMockPrice("2025-01-04", 100),
    ];
    const { provider, calls } = fakeProvider([decision("Pro3", "하락장 추천")]);

    const result = await engine.run(createRequest(prices, 1), prices, 1, provider);

    expect(calls[0]).toEqual({ referenceDate: "2025-01-02", cycleNumber: 1 });
    expect(result.cycleStrategies[0].strategy).toBe("Pro3");
    expect(result.cycleStrategies[0].recommendReason).toBe("하락장 추천");
    expect(result.cycleStrategies[0].startRsi).toBe(42);
    expect(result.cycleStrategies[0].isGoldenCross).toBe(true);
    expect(result.dailyHistory[0].strategy).toBe("Pro3");
  });

  it("시작 전날 데이터가 없으면 초기 호출 없이 생성자 전략으로 시작해야 한다", async () => {
    const engine = new BacktestEngine("Pro1");
    const prices = [createMockPrice("2025-01-02", 100), createMockPrice("2025-01-03", 100)];
    const { provider, calls } = fakeProvider([decision("Pro3")]);

    const result = await engine.run(createRequest(prices), prices, 0, provider);

    // 전일 종가 기준일이 없어 초기 호출은 생략, 둘째 날 재평가만 호출된다
    expect(calls).toEqual([{ referenceDate: "2025-01-02", cycleNumber: 1 }]);
    expect(result.dailyHistory[0].strategy).toBe("Pro1");
    expect(result.dailyHistory[1].strategy).toBe("Pro3");
  });
});

describe("공급자 모드 - 사이클 완료 익일 재추천", () => {
  it("사이클 완료 다음 날 전일 종가 기준으로 새 전략을 받아 교체해야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    // Pro2: 매수(99) → 매도(100.48) 사이클 완료 → 다음 날 Pro1로 교체
    const prices = [
      createMockPrice("2025-01-01", 100), // 과거 데이터
      createMockPrice("2025-01-02", 100),
      createMockPrice("2025-01-03", 99), // 티어 1 매수
      createMockPrice("2025-01-04", 100.48), // 매도 → 사이클 완료
      createMockPrice("2025-01-06", 110), // 새 사이클 (전일 04 기준 재추천)
      createMockPrice("2025-01-07", 108),
    ];
    const { provider, calls } = fakeProvider([
      decision("Pro2", "초기 추천"),
      decision("Pro2", "유지"), // 매수 체결일 아침 재평가
      decision("Pro1", "새 사이클 추천"),
      decision("Pro1", "새 사이클 추천"), // 새 사이클 첫 매수 전 재평가
    ]);

    const result = await engine.run(createRequest(prices, 1), prices, 1, provider);

    // 사이클 완료 익일(01-06)에 전일(01-04) 기준으로 사이클 2 추천 호출
    expect(calls).toContainEqual({ referenceDate: "2025-01-04", cycleNumber: 2 });
    expect(result.cycleStrategies).toHaveLength(2);
    expect(result.cycleStrategies[1].strategy).toBe("Pro1");
    expect(result.cycleStrategies[1].recommendReason).toBe("새 사이클 추천");
    expect(result.strategyStats.Pro2.cycles).toBe(1);
    expect(result.strategyStats.Pro1.cycles).toBe(1);
    // 완료된 사이클은 완료 시점 전략으로 기록
    expect(result.completedCycles[0].strategy).toBe("Pro2");
  });

  it("사이클 경계일에는 재추천과 재평가를 합쳐 공급자를 하루 한 번만 호출해야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    const prices = [
      createMockPrice("2025-01-01", 100),
      createMockPrice("2025-01-02", 100),
      createMockPrice("2025-01-03", 99),
      createMockPrice("2025-01-04", 100.48), // 사이클 완료
      createMockPrice("2025-01-06", 110), // 경계일: 재추천 + 첫 매수 전 재평가
    ];
    const { provider, calls } = fakeProvider([decision("Pro2")]);

    await engine.run(createRequest(prices, 1), prices, 1, provider);

    const boundaryCalls = calls.filter((c) => c.referenceDate === "2025-01-04");
    expect(boundaryCalls).toHaveLength(1);
  });
});

describe("공급자 모드 - 사이클 내 첫 매수 전 재평가", () => {
  it("첫 매수 전에는 매일 재평가하고 추천이 바뀌면 전략을 교체해야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    // 상승 지속 → 매수 미체결 → 매일 재평가
    const prices = [
      createMockPrice("2025-01-01", 100),
      createMockPrice("2025-01-02", 100),
      createMockPrice("2025-01-03", 101), // 재평가 (기준일 01-02)
      createMockPrice("2025-01-04", 102), // 재평가 (기준일 01-03) → Pro3로 교체
      createMockPrice("2025-01-06", 101), // Pro3로 매수 체결
    ];
    const { provider, calls } = fakeProvider([
      decision("Pro2", "초기 추천"),
      decision("Pro2", "유지"),
      decision("Pro3", "재평가 교체"),
      decision("Pro3", "유지"),
    ]);

    const result = await engine.run(createRequest(prices, 1), prices, 1, provider);

    expect(calls.map((c) => c.referenceDate)).toEqual([
      "2025-01-01", // 초기
      "2025-01-02", // 재평가
      "2025-01-03", // 재평가 → Pro3
      "2025-01-04", // 재평가 (매수 체결일 아침)
    ]);

    const cycle = result.cycleStrategies[0];
    expect(cycle.strategy).toBe("Pro3");
    // 교체 시 사이클 카운트도 이전된다
    expect(result.strategyStats.Pro2.cycles).toBe(0);
    expect(result.strategyStats.Pro3.cycles).toBe(1);
  });

  it("첫 매수가 체결된 뒤에는 재평가를 멈춰야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    const prices = [
      createMockPrice("2025-01-01", 100),
      createMockPrice("2025-01-02", 100),
      createMockPrice("2025-01-03", 99), // 매수 체결
      createMockPrice("2025-01-04", 99),
      createMockPrice("2025-01-06", 99),
    ];
    const { provider, calls } = fakeProvider([decision("Pro2")]);

    await engine.run(createRequest(prices, 1), prices, 1, provider);

    // 초기(01-01) + 매수 체결일 아침 재평가(01-02)까지만. 이후 호출 없음
    expect(calls.map((c) => c.referenceDate)).toEqual(["2025-01-01", "2025-01-02"]);
  });
});

describe("공급자 모드 - 실패 전파", () => {
  it("공급자가 실패하면 run이 같은 오류로 거부되어야 한다", async () => {
    const engine = new BacktestEngine("Pro2");
    const prices = [
      createMockPrice("2025-01-01", 100),
      createMockPrice("2025-01-02", 100),
      createMockPrice("2025-01-03", 99),
    ];
    const failing: StrategyProvider = async () => {
      throw new Error("전략 결정 실패");
    };

    await expect(engine.run(createRequest(prices, 1), prices, 1, failing)).rejects.toThrow(
      "전략 결정 실패"
    );
  });
});
