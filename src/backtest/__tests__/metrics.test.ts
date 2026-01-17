/**
 * metrics.ts 단위 테스트
 * SPEC-BACKTEST-001 REQ-009
 */
import { describe, it, expect } from "vitest";
import { calculateReturn, calculateMDD, calculateWinRate } from "../metrics";
import type { DailySnapshot } from "../types";

// 헬퍼 함수: 간단한 스냅샷 생성
function createSnapshot(date: string, totalAsset: number): DailySnapshot {
  return {
    date,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    adjClose: 100,
    cash: totalAsset,
    holdingsValue: 0,
    totalAsset,
    trades: [],
    orders: [],
    activeTiers: 0,
    cycleNumber: 1,
  };
}

describe("calculateReturn", () => {
  it("수익이 있을 때 양수 수익률을 반환해야 한다", () => {
    // 10000 -> 13000 = 30% 수익
    expect(calculateReturn(10000, 13000)).toBeCloseTo(0.3, 4);
  });

  it("손실이 있을 때 음수 수익률을 반환해야 한다", () => {
    // 10000 -> 8000 = -20% 손실
    expect(calculateReturn(10000, 8000)).toBeCloseTo(-0.2, 4);
  });

  it("변동이 없을 때 0을 반환해야 한다", () => {
    expect(calculateReturn(10000, 10000)).toBe(0);
  });

  it("100% 수익을 정확히 계산해야 한다", () => {
    expect(calculateReturn(10000, 20000)).toBe(1);
  });

  it("소수점 4자리까지 정밀도를 유지해야 한다", () => {
    // 10000 -> 13472 = 34.72%
    expect(calculateReturn(10000, 13472)).toBeCloseTo(0.3472, 4);
  });
});

describe("calculateMDD", () => {
  it("하락이 없으면 0을 반환해야 한다", () => {
    const history = [
      createSnapshot("2025-01-02", 10000),
      createSnapshot("2025-01-03", 10500),
      createSnapshot("2025-01-04", 11000),
    ];
    expect(calculateMDD(history)).toBe(0);
  });

  it("단순 하락 시 MDD를 올바르게 계산해야 한다", () => {
    const history = [
      createSnapshot("2025-01-02", 10000),
      createSnapshot("2025-01-03", 9000), // 10% 하락
    ];
    // MDD = (10000 - 9000) / 10000 = 0.1 = 10%
    expect(calculateMDD(history)).toBeCloseTo(-0.1, 4);
  });

  it("고점 대비 최대 낙폭을 계산해야 한다", () => {
    const history = [
      createSnapshot("2025-01-02", 10000),
      createSnapshot("2025-01-03", 12000), // 새 고점
      createSnapshot("2025-01-04", 9000), // 12000 대비 25% 하락
      createSnapshot("2025-01-05", 11000), // 회복
    ];
    // MDD = (12000 - 9000) / 12000 = 0.25 = 25%
    expect(calculateMDD(history)).toBeCloseTo(-0.25, 4);
  });

  it("여러 번의 하락 중 최대 낙폭을 찾아야 한다", () => {
    const history = [
      createSnapshot("2025-01-02", 10000),
      createSnapshot("2025-01-03", 9500), // 5% 하락
      createSnapshot("2025-01-04", 10500), // 회복
      createSnapshot("2025-01-05", 8400), // 20% 하락 (10500 대비)
      createSnapshot("2025-01-06", 11000),
    ];
    // MDD = (10500 - 8400) / 10500 = 0.2 = 20%
    expect(calculateMDD(history)).toBeCloseTo(-0.2, 4);
  });

  it("빈 히스토리에서 0을 반환해야 한다", () => {
    expect(calculateMDD([])).toBe(0);
  });

  it("단일 데이터에서 0을 반환해야 한다", () => {
    const history = [createSnapshot("2025-01-02", 10000)];
    expect(calculateMDD(history)).toBe(0);
  });
});

describe("calculateWinRate", () => {
  it("모든 사이클이 수익이면 100% 승률", () => {
    const cycles = [{ profit: 100 }, { profit: 50 }, { profit: 200 }];
    expect(calculateWinRate(cycles)).toBe(1);
  });

  it("모든 사이클이 손실이면 0% 승률", () => {
    const cycles = [{ profit: -100 }, { profit: -50 }, { profit: -200 }];
    expect(calculateWinRate(cycles)).toBe(0);
  });

  it("반반이면 50% 승률", () => {
    const cycles = [{ profit: 100 }, { profit: -50 }];
    expect(calculateWinRate(cycles)).toBe(0.5);
  });

  it("수익 0은 패배로 간주", () => {
    const cycles = [{ profit: 100 }, { profit: 0 }, { profit: 100 }];
    // 2승 1패 (0은 승리가 아님)
    expect(calculateWinRate(cycles)).toBeCloseTo(0.6667, 3);
  });

  it("빈 배열에서 0을 반환해야 한다", () => {
    expect(calculateWinRate([])).toBe(0);
  });

  it("소수점 4자리까지 정밀도를 유지해야 한다", () => {
    // 13승 2패 = 0.8667
    const cycles = Array(13)
      .fill({ profit: 100 })
      .concat(Array(2).fill({ profit: -50 }));
    expect(calculateWinRate(cycles)).toBeCloseTo(0.8667, 3);
  });
});
