/**
 * metrics.ts 단위 테스트
 * SPEC-BACKTEST-001 REQ-009
 * SPEC-METRICS-001 기준일 종합 지표 어댑터
 *
 * 개별 지표 계산의 단위 테스트는 src/metrics/__tests__가 소유한다 (#73).
 */
import { describe, it, expect } from "vitest";
import {
  calculateReturn,
  calculateMDD,
  calculateWinRate,
  calculateTechnicalMetrics,
} from "../metrics";
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
    totalShares: 0,
    cycleNumber: 1,
    strategy: "Pro2",
    ma20: null,
    ma60: null,
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

// ============================================================
// SPEC-METRICS-001: 기준일 종합 지표 어댑터 테스트
// ============================================================

describe("calculateTechnicalMetrics", () => {
  // 정상 계산 시나리오
  it("모든 지표가 계산 가능할 때 TechnicalMetrics를 반환해야 한다", () => {
    // 60개 이상의 가격 데이터 필요 (MA60 요구사항)
    const prices = Array.from({ length: 70 }, (_, i) => 100 + i * 0.5);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    expect(metrics!).toHaveProperty("goldenCross");
    expect(metrics!).toHaveProperty("isGoldenCross");
    expect(metrics!).toHaveProperty("maSlope");
    expect(metrics!).toHaveProperty("disparity");
    expect(metrics!).toHaveProperty("rsi14");
    expect(metrics!).toHaveProperty("roc12");
    expect(metrics!).toHaveProperty("volatility20");
  });

  it("isGoldenCross가 MA20 > MA60일 때 true를 반환해야 한다", () => {
    // 상승 추세: MA20 > MA60
    const prices = Array.from({ length: 70 }, (_, i) => 100 + i);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    expect(metrics!.isGoldenCross).toBe(true);
  });

  it("isGoldenCross가 MA20 <= MA60일 때 false를 반환해야 한다", () => {
    // 하락 추세: MA20 < MA60
    const prices = Array.from({ length: 70 }, (_, i) => 170 - i);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    expect(metrics!.isGoldenCross).toBe(false);
  });

  it("백테스트 기간이 60일 미만일 때 goldenCross는 NaN이지만 isGoldenCross는 유효해야 한다", () => {
    // 충분한 데이터가 있지만 백테스트 기간만 짧은 경우
    const prices = Array.from({ length: 70 }, (_, i) => 100 + i);
    const metrics = calculateTechnicalMetrics(prices, 69, 30); // backtestDays = 30

    expect(metrics).not.toBeNull();
    expect(Number.isNaN(metrics!.goldenCross)).toBe(true);
    expect(metrics!.isGoldenCross).toBe(true); // MA20 > MA60
  });

  it("goldenCross를 올바르게 계산해야 한다", () => {
    // MA20 > MA60 인 경우 양수
    // 최근 가격이 높은 상승 추세
    const prices = Array.from({ length: 70 }, (_, i) => 100 + i);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    // 상승 추세에서 MA20 > MA60이므로 goldenCross > 0
    expect(metrics!.goldenCross).toBeGreaterThan(0);
  });

  it("maSlope를 올바르게 계산해야 한다", () => {
    // 상승 추세에서 MA20 기울기는 양수
    const prices = Array.from({ length: 70 }, (_, i) => 100 + i);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    // 상승 추세에서 maSlope > 0
    expect(metrics!.maSlope).toBeGreaterThan(0);
  });

  it("disparity를 올바르게 계산해야 한다", () => {
    // disparity = (adjClose - MA20) / MA20 × 100
    const prices = Array(70).fill(100);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    // 가격이 일정하면 disparity = 0 (MA20과 동일)
    expect(metrics!.disparity).toBeCloseTo(0, 2);
  });

  // 경계 조건 테스트
  it("index가 59일 때 계산해야 한다 (최소 요구사항)", () => {
    // MA60 계산에 최소 60개 데이터 필요 (index >= 59)
    const prices = Array(60).fill(100);
    const metrics = calculateTechnicalMetrics(prices, 59);

    expect(metrics).not.toBeNull();
  });

  // 불충분한 데이터 테스트
  it("index가 59보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    // MA60 요구사항 미충족
    expect(calculateTechnicalMetrics(prices, 58)).toBeNull();
  });

  it("데이터가 부족하면 null을 반환해야 한다", () => {
    const prices = Array(59).fill(100);
    expect(calculateTechnicalMetrics(prices, 58)).toBeNull();
  });

  // 정밀도 테스트
  it("모든 지표가 소수점 4자리까지 정밀도를 유지해야 한다", () => {
    const prices = Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 10);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();

    // 각 지표의 소수점 자리수 확인
    const checkPrecision = (value: number) => {
      const decimalPart = value.toString().split(".")[1] || "";
      return decimalPart.length <= 4;
    };

    expect(checkPrecision(metrics!.goldenCross)).toBe(true);
    expect(checkPrecision(metrics!.maSlope)).toBe(true);
    expect(checkPrecision(metrics!.disparity)).toBe(true);
    expect(checkPrecision(metrics!.rsi14)).toBe(true);
    expect(checkPrecision(metrics!.roc12)).toBe(true);
    expect(checkPrecision(metrics!.volatility20)).toBe(true);
  });

  // CON-001, CON-002 제약사항 테스트
  it("CON-001: 불충분한 데이터에 null을 반환해야 한다 (0이나 임의 값이 아님)", () => {
    const prices = Array(50).fill(100);
    const metrics = calculateTechnicalMetrics(prices, 49);
    expect(metrics).toBeNull();
  });
});
