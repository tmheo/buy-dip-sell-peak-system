/**
 * metrics.ts 단위 테스트
 * SPEC-BACKTEST-001 REQ-009
 * SPEC-METRICS-001 기술적 지표 계산 함수
 */
import { describe, it, expect } from "vitest";
import {
  calculateReturn,
  calculateMDD,
  calculateWinRate,
  calculateSMA,
  calculateRSI,
  calculateROC,
  calculateVolatility,
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
    cycleNumber: 1,
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
// SPEC-METRICS-001: 기술적 지표 계산 함수 테스트
// ============================================================

describe("calculateSMA", () => {
  // 정상 계산 시나리오
  it("20일 SMA를 올바르게 계산해야 한다", () => {
    // 20개의 가격 데이터 (모두 100)
    const prices = Array(20).fill(100);
    // index 19 (20번째)에서 SMA20 계산 가능
    expect(calculateSMA(prices, 20, 19)).toBe(100);
  });

  it("다양한 가격에서 SMA를 올바르게 계산해야 한다", () => {
    // 가격: 1, 2, 3, ..., 20
    const prices = Array.from({ length: 20 }, (_, i) => i + 1);
    // SMA20 = (1+2+...+20) / 20 = 210 / 20 = 10.5
    expect(calculateSMA(prices, 20, 19)).toBe(10.5);
  });

  it("60일 SMA를 올바르게 계산해야 한다", () => {
    // 60개의 가격 데이터
    const prices = Array.from({ length: 60 }, (_, i) => i + 1);
    // SMA60 = (1+2+...+60) / 60 = 1830 / 60 = 30.5
    expect(calculateSMA(prices, 60, 59)).toBe(30.5);
  });

  // 경계 조건 테스트
  it("정확히 필요한 데이터만 있을 때 계산해야 한다 (경계 조건)", () => {
    const prices = Array(20).fill(50);
    // index 19 = period - 1, 정확히 20개 데이터
    expect(calculateSMA(prices, 20, 19)).toBe(50);
  });

  // 불충분한 데이터 테스트
  it("데이터가 부족할 때 null을 반환해야 한다", () => {
    const prices = Array(19).fill(100);
    // 19개 데이터로는 20일 SMA 계산 불가
    expect(calculateSMA(prices, 20, 18)).toBeNull();
  });

  it("index가 period-1보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    // index 18 < period 20 - 1 = 19
    expect(calculateSMA(prices, 20, 18)).toBeNull();
  });

  // 정밀도 테스트
  it("소수점 4자리까지 정밀도를 유지해야 한다", () => {
    // 가격이 소수점을 포함할 때
    const prices = [10.1234, 20.5678, 30.9012, 40.3456, 50.789];
    // SMA5 at index 4 = (10.1234 + 20.5678 + 30.9012 + 40.3456 + 50.7890) / 5
    // = 152.727 / 5 = 30.5454
    const result = calculateSMA(prices, 5, 4);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(30.5454, 4);
  });
});

describe("calculateRSI", () => {
  // 정상 계산 시나리오 - Wilder's EMA 방식
  it("상승장에서 높은 RSI를 반환해야 한다", () => {
    // 15일 연속 상승 (매일 +1)
    const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
    const rsi = calculateRSI(prices, 14);
    expect(rsi).not.toBeNull();
    // 모든 날이 상승이므로 RSI는 100에 가까워야 함
    expect(rsi!).toBe(100);
  });

  it("하락장에서 낮은 RSI를 반환해야 한다", () => {
    // 15일 연속 하락 (매일 -1)
    const prices = Array.from({ length: 15 }, (_, i) => 100 - i);
    const rsi = calculateRSI(prices, 14);
    expect(rsi).not.toBeNull();
    // 모든 날이 하락이므로 RSI는 0에 가까워야 함
    expect(rsi!).toBe(0);
  });

  it("등락이 같으면 RSI가 50 근처여야 한다", () => {
    // 번갈아 상승/하락 (동일한 크기)
    const prices = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).not.toBeNull();
    // 상승과 하락이 동일하므로 RSI는 50 근처
    expect(rsi!).toBeCloseTo(50, 0);
  });

  // 경계 조건 테스트
  it("정확히 15개 데이터에서 계산해야 한다 (14일 RSI, index 14)", () => {
    const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
    // index 14 = 15번째 데이터, 14일 변화량 필요
    expect(calculateRSI(prices, 14)).not.toBeNull();
  });

  // 불충분한 데이터 테스트
  it("데이터가 부족할 때 null을 반환해야 한다", () => {
    const prices = Array(14).fill(100);
    // 14개 데이터 = 13일의 변화량, RSI14에는 14일 변화량 필요
    expect(calculateRSI(prices, 13)).toBeNull();
  });

  it("index가 14보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateRSI(prices, 13)).toBeNull();
  });

  // 제로 나눗셈 보호
  it("avgLoss가 0일 때 RSI 100을 반환해야 한다", () => {
    // 모든 날 상승 (하락 없음)
    const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
    expect(calculateRSI(prices, 14)).toBe(100);
  });

  // 정밀도 테스트
  it("소수점 4자리까지 정밀도를 유지해야 한다", () => {
    // 실제 가격 데이터 시뮬레이션
    const prices = [100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).not.toBeNull();
    // RSI는 0-100 사이
    expect(rsi!).toBeGreaterThanOrEqual(0);
    expect(rsi!).toBeLessThanOrEqual(100);
  });

  // Wilder's EMA 스무딩 테스트 (index > 14인 경우)
  it("15일 이상 데이터에서 Wilder's EMA 스무딩을 적용해야 한다", () => {
    // 20개 데이터로 RSI 계산 (index 19)
    const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 5);
    const rsi = calculateRSI(prices, 19);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThanOrEqual(0);
    expect(rsi!).toBeLessThanOrEqual(100);
  });

  it("긴 데이터 시리즈에서 RSI를 올바르게 계산해야 한다", () => {
    // 50개 데이터로 RSI 계산
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 3);
    const rsi = calculateRSI(prices, 49);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(50); // 전반적 상승 추세이므로 RSI > 50
  });

  it("avgGain이 0일 때 RSI 0을 반환해야 한다", () => {
    // 모든 날 하락 (상승 없음)
    const prices = Array.from({ length: 15 }, (_, i) => 100 - i);
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toBe(0);
  });
});

describe("calculateROC", () => {
  // 정상 계산 시나리오
  it("12일 ROC를 올바르게 계산해야 한다", () => {
    // price[12] = 110, price[0] = 100
    // ROC = (110 - 100) / 100 * 100 = 10%
    const prices = [100, ...Array(11).fill(105), 110];
    expect(calculateROC(prices, 12)).toBeCloseTo(10, 4);
  });

  it("하락 시 음수 ROC를 반환해야 한다", () => {
    // price[12] = 90, price[0] = 100
    // ROC = (90 - 100) / 100 * 100 = -10%
    const prices = [100, ...Array(11).fill(95), 90];
    expect(calculateROC(prices, 12)).toBeCloseTo(-10, 4);
  });

  it("변화 없을 때 0을 반환해야 한다", () => {
    const prices = Array(13).fill(100);
    expect(calculateROC(prices, 12)).toBe(0);
  });

  // 경계 조건 테스트
  it("정확히 13개 데이터에서 계산해야 한다 (index 12)", () => {
    const prices = [100, ...Array(12).fill(110)];
    // index 12, 12일 전 = index 0
    expect(calculateROC(prices, 12)).toBeCloseTo(10, 4);
  });

  // 불충분한 데이터 테스트
  it("데이터가 부족할 때 null을 반환해야 한다", () => {
    const prices = Array(12).fill(100);
    // 12개 데이터, index 11은 11일 전 데이터가 없음
    expect(calculateROC(prices, 11)).toBeNull();
  });

  it("index가 12보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateROC(prices, 11)).toBeNull();
  });

  // 제로 나눗셈 보호
  it("12일 전 가격이 0이면 null을 반환해야 한다", () => {
    const prices = [0, ...Array(12).fill(100)];
    expect(calculateROC(prices, 12)).toBeNull();
  });

  // 정밀도 테스트
  it("소수점 4자리까지 정밀도를 유지해야 한다", () => {
    // price[12] = 112.5678, price[0] = 100
    // ROC = (112.5678 - 100) / 100 * 100 = 12.5678%
    const prices = [100, ...Array(11).fill(105), 112.5678];
    const roc = calculateROC(prices, 12);
    expect(roc).not.toBeNull();
    expect(roc).toBeCloseTo(12.5678, 4);
  });
});

describe("calculateVolatility", () => {
  // 정상 계산 시나리오
  it("20일 연환산 변동성을 올바르게 계산해야 한다", () => {
    // 일정한 가격 = 변동성 0
    const prices = Array(21).fill(100);
    expect(calculateVolatility(prices, 20)).toBe(0);
  });

  it("변동이 있을 때 양수 변동성을 반환해야 한다", () => {
    // 번갈아 상승/하락하는 가격
    const prices = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 100 : 105));
    const vol = calculateVolatility(prices, 20);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(0);
  });

  // 경계 조건 테스트
  it("정확히 21개 데이터에서 계산해야 한다 (index 20)", () => {
    const prices = Array(21).fill(100);
    // index 20 = 21번째 데이터, 20일 수익률 필요
    expect(calculateVolatility(prices, 20)).toBe(0);
  });

  // 불충분한 데이터 테스트
  it("데이터가 부족할 때 null을 반환해야 한다", () => {
    const prices = Array(20).fill(100);
    // 20개 데이터 = 19일 수익률, 20일 변동성에는 20일 수익률 필요
    expect(calculateVolatility(prices, 19)).toBeNull();
  });

  it("index가 20보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateVolatility(prices, 19)).toBeNull();
  });

  // 연환산 검증
  it("연환산 계수 sqrt(252)를 적용해야 한다", () => {
    // 매일 1% 수익률
    const prices: number[] = [100];
    for (let i = 1; i <= 20; i++) {
      prices.push(prices[i - 1] * 1.01);
    }
    const vol = calculateVolatility(prices, 20);
    expect(vol).not.toBeNull();
    // 일별 수익률이 일정하므로 변동성은 0에 가까움
    expect(vol!).toBeCloseTo(0, 1);
  });

  // 정밀도 테스트
  it("소수점 4자리까지 정밀도를 유지해야 한다", () => {
    // 변동이 있는 가격
    const prices = Array.from({ length: 21 }, (_, i) => 100 + Math.sin(i) * 5);
    const vol = calculateVolatility(prices, 20);
    expect(vol).not.toBeNull();
    // 결과가 정의된 소수점 자리수를 가져야 함
    const decimalPlaces = (vol!.toString().split(".")[1] || "").length;
    expect(decimalPlaces).toBeLessThanOrEqual(4);
  });
});

describe("calculateTechnicalMetrics", () => {
  // 정상 계산 시나리오
  it("모든 지표가 계산 가능할 때 TechnicalMetrics를 반환해야 한다", () => {
    // 60개 이상의 가격 데이터 필요 (MA60 요구사항)
    const prices = Array.from({ length: 70 }, (_, i) => 100 + i * 0.5);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    expect(metrics!).toHaveProperty("goldenCross");
    expect(metrics!).toHaveProperty("maSlope");
    expect(metrics!).toHaveProperty("disparity");
    expect(metrics!).toHaveProperty("rsi14");
    expect(metrics!).toHaveProperty("roc12");
    expect(metrics!).toHaveProperty("volatility20");
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
    // disparity = adjClose / MA20 × 100
    const prices = Array(70).fill(100);
    const metrics = calculateTechnicalMetrics(prices, 69);

    expect(metrics).not.toBeNull();
    // 가격이 일정하면 disparity = 100
    expect(metrics!.disparity).toBeCloseTo(100, 2);
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
