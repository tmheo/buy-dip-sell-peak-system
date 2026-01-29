/**
 * RPM 지표 계산 함수 단위 테스트
 * SPEC-RPM-EXPERIMENT-001
 */
import { describe, it, expect } from "vitest";
import {
  calculateEMA,
  calculateMACD,
  calculateSignalLine,
  calculateMACDHistogram,
  calculateBollingerWidth,
  calculateATRPercent,
  calculateStochasticK,
  calculateROC10,
  calculateDisparity20,
  calculateDisparity60,
  calculateRpmIndicators,
} from "../rpm-indicators";
import type { DailyPrice } from "../types";

// ============================================================
// Helper Functions
// ============================================================

/**
 * 간단한 DailyPrice 생성 헬퍼
 */
function createDailyPrice(date: string, close: number, high?: number, low?: number): DailyPrice {
  const h = high ?? close * 1.02;
  const l = low ?? close * 0.98;
  return {
    date,
    open: close,
    high: h,
    low: l,
    close: close,
    adjClose: close,
  };
}

/**
 * 연속 거래일 DailyPrice 배열 생성
 */
function createPriceArray(
  startDate: string,
  prices: number[],
  volatility: number = 0.02
): DailyPrice[] {
  return prices.map((price, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    return createDailyPrice(dateStr, price, price * (1 + volatility), price * (1 - volatility));
  });
}

// ============================================================
// EMA Tests
// ============================================================

describe("calculateEMA", () => {
  it("12일 EMA를 올바르게 계산해야 한다", () => {
    // 12개의 동일한 가격
    const prices = Array(12).fill(100);
    const ema = calculateEMA(prices, 12, 11);
    expect(ema).toBe(100);
  });

  it("상승 추세에서 EMA가 SMA보다 높아야 한다", () => {
    // 상승 추세 가격
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const ema = calculateEMA(prices, 12, 19);
    expect(ema).not.toBeNull();
    expect(ema!).toBeGreaterThan(100);
  });

  it("데이터가 부족할 때 null을 반환해야 한다", () => {
    const prices = Array(11).fill(100);
    expect(calculateEMA(prices, 12, 10)).toBeNull();
  });

  it("index가 period-1보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateEMA(prices, 12, 10)).toBeNull();
  });

  it("소수점 4자리까지 정밀도를 유지해야 한다", () => {
    const prices = Array.from({ length: 15 }, (_, i) => 100 + Math.sin(i) * 5);
    const ema = calculateEMA(prices, 12, 14);
    expect(ema).not.toBeNull();
    const decimalPlaces = (ema!.toString().split(".")[1] || "").length;
    expect(decimalPlaces).toBeLessThanOrEqual(4);
  });
});

// ============================================================
// MACD Tests
// ============================================================

describe("calculateMACD", () => {
  it("MACD Line을 올바르게 계산해야 한다", () => {
    // 26개 이상의 가격 데이터
    const prices = Array(30).fill(100);
    const macd = calculateMACD(prices, 29);
    expect(macd).not.toBeNull();
    // 가격이 일정하면 MACD = EMA12 - EMA26 = 0
    expect(macd!).toBeCloseTo(0, 2);
  });

  it("상승 추세에서 양수 MACD를 반환해야 한다", () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const macd = calculateMACD(prices, 29);
    expect(macd).not.toBeNull();
    // 상승 추세에서 EMA12 > EMA26
    expect(macd!).toBeGreaterThan(0);
  });

  it("하락 추세에서 음수 MACD를 반환해야 한다", () => {
    const prices = Array.from({ length: 30 }, (_, i) => 130 - i);
    const macd = calculateMACD(prices, 29);
    expect(macd).not.toBeNull();
    // 하락 추세에서 EMA12 < EMA26
    expect(macd!).toBeLessThan(0);
  });

  it("index가 25보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateMACD(prices, 24)).toBeNull();
  });

  it("index가 25일 때 계산해야 한다 (경계 조건)", () => {
    const prices = Array(26).fill(100);
    expect(calculateMACD(prices, 25)).not.toBeNull();
  });
});

describe("calculateSignalLine", () => {
  it("Signal Line을 올바르게 계산해야 한다", () => {
    // 9개 이상의 MACD 값
    const macdValues = Array(10).fill(5);
    const signal = calculateSignalLine(macdValues, 9);
    expect(signal).not.toBeNull();
    expect(signal!).toBeCloseTo(5, 2);
  });

  it("데이터가 부족할 때 null을 반환해야 한다", () => {
    const macdValues = Array(8).fill(5);
    expect(calculateSignalLine(macdValues, 7)).toBeNull();
  });
});

describe("calculateMACDHistogram", () => {
  it("MACD Histogram을 올바르게 계산해야 한다", () => {
    // 최소 34개 데이터 필요 (index >= 33)
    const prices = Array(40).fill(100);
    const histogram = calculateMACDHistogram(prices, 39);
    expect(histogram).not.toBeNull();
    // 가격이 일정하면 histogram ≈ 0
    expect(Math.abs(histogram!)).toBeLessThan(0.1);
  });

  it("index가 33보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateMACDHistogram(prices, 32)).toBeNull();
  });

  it("index가 33일 때 계산해야 한다 (경계 조건)", () => {
    const prices = Array(34).fill(100);
    expect(calculateMACDHistogram(prices, 33)).not.toBeNull();
  });

  it("가속 상승 추세에서 양수 histogram을 반환해야 한다", () => {
    // 가속 상승 추세 (2차 함수, 기울기 증가)
    // 선형 추세에서는 MACD와 Signal이 수렴하여 histogram이 0에 가까움
    // 가속 추세에서는 MACD가 Signal보다 빠르게 반응하여 histogram > 0
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + i * i * 0.1);
    const histogram = calculateMACDHistogram(prices, 49);
    expect(histogram).not.toBeNull();
    // 가속 상승에서 MACD > Signal이므로 histogram > 0
    expect(histogram!).toBeGreaterThan(0);
  });
});

// ============================================================
// Bollinger Width Tests
// ============================================================

describe("calculateBollingerWidth", () => {
  it("변동이 없으면 width가 0이어야 한다", () => {
    const prices = Array(20).fill(100);
    const width = calculateBollingerWidth(prices, 19);
    expect(width).not.toBeNull();
    expect(width!).toBe(0);
  });

  it("변동이 있으면 양수 width를 반환해야 한다", () => {
    // 변동이 있는 가격
    const prices = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const width = calculateBollingerWidth(prices, 24);
    expect(width).not.toBeNull();
    expect(width!).toBeGreaterThan(0);
  });

  it("index가 19보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateBollingerWidth(prices, 18)).toBeNull();
  });

  it("index가 19일 때 계산해야 한다 (경계 조건)", () => {
    const prices = Array(20).fill(100);
    expect(calculateBollingerWidth(prices, 19)).not.toBeNull();
  });

  it("변동성이 클수록 width가 커야 한다", () => {
    // 낮은 변동성
    const lowVolPrices = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 1);
    // 높은 변동성
    const highVolPrices = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 10);

    const lowWidth = calculateBollingerWidth(lowVolPrices, 24);
    const highWidth = calculateBollingerWidth(highVolPrices, 24);

    expect(lowWidth).not.toBeNull();
    expect(highWidth).not.toBeNull();
    expect(highWidth!).toBeGreaterThan(lowWidth!);
  });
});

// ============================================================
// ATR% Tests
// ============================================================

describe("calculateATRPercent", () => {
  it("ATR%를 올바르게 계산해야 한다", () => {
    // 변동이 있는 가격 데이터
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 5),
      0.03
    );
    const atrPercent = calculateATRPercent(prices, 19);
    expect(atrPercent).not.toBeNull();
    expect(atrPercent!).toBeGreaterThan(0);
  });

  it("index가 14보다 작으면 null을 반환해야 한다", () => {
    const prices = createPriceArray("2024-01-01", Array(100).fill(100));
    expect(calculateATRPercent(prices, 13)).toBeNull();
  });

  it("index가 14일 때 계산해야 한다 (경계 조건)", () => {
    const prices = createPriceArray("2024-01-01", Array(15).fill(100), 0.02);
    expect(calculateATRPercent(prices, 14)).not.toBeNull();
  });

  it("변동성이 클수록 ATR%가 커야 한다", () => {
    // 낮은 변동성
    const lowVolPrices = createPriceArray("2024-01-01", Array(20).fill(100), 0.01);
    // 높은 변동성
    const highVolPrices = createPriceArray("2024-01-01", Array(20).fill(100), 0.05);

    const lowAtr = calculateATRPercent(lowVolPrices, 19);
    const highAtr = calculateATRPercent(highVolPrices, 19);

    expect(lowAtr).not.toBeNull();
    expect(highAtr).not.toBeNull();
    expect(highAtr!).toBeGreaterThan(lowAtr!);
  });

  it("종가가 0이면 null을 반환해야 한다", () => {
    const prices = createPriceArray("2024-01-01", Array(20).fill(100));
    prices[19].adjClose = 0;
    expect(calculateATRPercent(prices, 19)).toBeNull();
  });
});

// ============================================================
// Stochastic %K Tests
// ============================================================

describe("calculateStochasticK (Fast %K)", () => {
  it("Stochastic Fast %K를 올바르게 계산해야 한다", () => {
    // 14개 이상의 가격 데이터 필요
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 20 }, (_, i) => 100 + i),
      0.02
    );
    const stochK = calculateStochasticK(prices, 19);
    expect(stochK).not.toBeNull();
    expect(stochK!).toBeGreaterThanOrEqual(0);
    expect(stochK!).toBeLessThanOrEqual(100);
  });

  it("상승 추세 끝에서 높은 %K를 반환해야 한다", () => {
    // 상승 추세
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 20 }, (_, i) => 100 + i * 2),
      0.01
    );
    const stochK = calculateStochasticK(prices, 19);
    expect(stochK).not.toBeNull();
    expect(stochK!).toBeGreaterThan(70); // 과매수 영역
  });

  it("하락 추세 끝에서 낮은 %K를 반환해야 한다", () => {
    // 하락 추세
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 20 }, (_, i) => 140 - i * 2),
      0.01
    );
    const stochK = calculateStochasticK(prices, 19);
    expect(stochK).not.toBeNull();
    expect(stochK!).toBeLessThan(30); // 과매도 영역
  });

  it("index가 13보다 작으면 null을 반환해야 한다", () => {
    const prices = createPriceArray("2024-01-01", Array(100).fill(100));
    expect(calculateStochasticK(prices, 12)).toBeNull();
  });

  it("index가 13일 때 계산해야 한다 (경계 조건)", () => {
    const prices = createPriceArray("2024-01-01", Array(14).fill(100), 0.02);
    expect(calculateStochasticK(prices, 13)).not.toBeNull();
  });

  it("가격 범위가 0일 때 50을 반환해야 한다", () => {
    // 모든 고가/저가가 동일
    const prices: DailyPrice[] = Array(20)
      .fill(null)
      .map((_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        open: 100,
        high: 100, // 고가 = 저가
        low: 100,
        close: 100,
        adjClose: 100,
      }));
    const stochK = calculateStochasticK(prices, 19);
    expect(stochK).not.toBeNull();
    expect(stochK!).toBe(50);
  });
});

// ============================================================
// ROC10 Tests
// ============================================================

describe("calculateROC10", () => {
  it("10일 ROC를 올바르게 계산해야 한다", () => {
    // price[10] = 110, price[0] = 100
    // ROC = (110 - 100) / 100 * 100 = 10%
    const prices = [100, ...Array(9).fill(105), 110];
    expect(calculateROC10(prices, 10)).toBeCloseTo(10, 4);
  });

  it("하락 시 음수 ROC를 반환해야 한다", () => {
    const prices = [100, ...Array(9).fill(95), 90];
    expect(calculateROC10(prices, 10)).toBeCloseTo(-10, 4);
  });

  it("변화 없을 때 0을 반환해야 한다", () => {
    const prices = Array(11).fill(100);
    expect(calculateROC10(prices, 10)).toBe(0);
  });

  it("index가 10보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateROC10(prices, 9)).toBeNull();
  });

  it("index가 10일 때 계산해야 한다 (경계 조건)", () => {
    const prices = Array(11).fill(100);
    expect(calculateROC10(prices, 10)).not.toBeNull();
  });

  it("10일 전 가격이 0이면 null을 반환해야 한다", () => {
    const prices = [0, ...Array(10).fill(100)];
    expect(calculateROC10(prices, 10)).toBeNull();
  });
});

// ============================================================
// Disparity Tests
// ============================================================

describe("calculateDisparity20", () => {
  it("가격이 MA20과 같으면 0을 반환해야 한다", () => {
    const prices = Array(20).fill(100);
    expect(calculateDisparity20(prices, 19)).toBeCloseTo(0, 4);
  });

  it("가격이 MA20보다 높으면 양수를 반환해야 한다", () => {
    // 상승 추세
    const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
    const disparity = calculateDisparity20(prices, 24);
    expect(disparity).not.toBeNull();
    expect(disparity!).toBeGreaterThan(0);
  });

  it("index가 19보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateDisparity20(prices, 18)).toBeNull();
  });
});

describe("calculateDisparity60", () => {
  it("가격이 MA60과 같으면 0을 반환해야 한다", () => {
    const prices = Array(60).fill(100);
    expect(calculateDisparity60(prices, 59)).toBeCloseTo(0, 4);
  });

  it("가격이 MA60보다 높으면 양수를 반환해야 한다", () => {
    // 상승 추세
    const prices = Array.from({ length: 65 }, (_, i) => 100 + i);
    const disparity = calculateDisparity60(prices, 64);
    expect(disparity).not.toBeNull();
    expect(disparity!).toBeGreaterThan(0);
  });

  it("index가 59보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(100).fill(100);
    expect(calculateDisparity60(prices, 58)).toBeNull();
  });

  it("index가 59일 때 계산해야 한다 (경계 조건)", () => {
    const prices = Array(60).fill(100);
    expect(calculateDisparity60(prices, 59)).not.toBeNull();
  });
});

// ============================================================
// Integration: calculateRpmIndicators Tests
// ============================================================

describe("calculateRpmIndicators", () => {
  it("모든 8개 지표가 계산 가능할 때 RpmIndicators를 반환해야 한다", () => {
    // 최소 60일 데이터 필요
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 3),
      0.02
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();
    expect(indicators!).toHaveProperty("rsi14");
    expect(indicators!).toHaveProperty("disparity20");
    expect(indicators!).toHaveProperty("roc10");
    expect(indicators!).toHaveProperty("macdHistogram");
    expect(indicators!).toHaveProperty("bollingerWidth");
    expect(indicators!).toHaveProperty("atrPercent");
    expect(indicators!).toHaveProperty("disparity60");
    expect(indicators!).toHaveProperty("stochasticK");
  });

  it("index가 59보다 작으면 null을 반환해야 한다", () => {
    const prices = createPriceArray("2024-01-01", Array(100).fill(100));
    expect(calculateRpmIndicators(prices, 58)).toBeNull();
  });

  it("index가 59일 때 계산해야 한다 (경계 조건)", () => {
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 60 }, (_, i) => 100 + i * 0.5),
      0.02
    );
    expect(calculateRpmIndicators(prices, 59)).not.toBeNull();
  });

  it("RSI가 0-100 범위 내에 있어야 한다", () => {
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 10),
      0.02
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();
    expect(indicators!.rsi14).toBeGreaterThanOrEqual(0);
    expect(indicators!.rsi14).toBeLessThanOrEqual(100);
  });

  it("Stochastic %K가 0-100 범위 내에 있어야 한다", () => {
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 10),
      0.02
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();
    expect(indicators!.stochasticK).toBeGreaterThanOrEqual(0);
    expect(indicators!.stochasticK).toBeLessThanOrEqual(100);
  });

  it("Bollinger Width가 양수여야 한다 (또는 변동 없으면 0)", () => {
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 5),
      0.02
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();
    expect(indicators!.bollingerWidth).toBeGreaterThanOrEqual(0);
  });

  it("ATR%가 양수여야 한다", () => {
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 5),
      0.03
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();
    expect(indicators!.atrPercent).toBeGreaterThan(0);
  });

  it("상승 추세에서 예상되는 지표 값을 반환해야 한다", () => {
    // 강한 상승 추세
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 100 + i * 2),
      0.01
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();
    // 상승 추세 특성
    expect(indicators!.rsi14).toBeGreaterThan(50);
    expect(indicators!.disparity20).toBeGreaterThan(0);
    expect(indicators!.disparity60).toBeGreaterThan(0);
    expect(indicators!.roc10).toBeGreaterThan(0);
    expect(indicators!.stochasticK).toBeGreaterThan(50);
  });

  it("하락 추세에서 예상되는 지표 값을 반환해야 한다", () => {
    // 강한 하락 추세
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 240 - i * 2),
      0.01
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();
    // 하락 추세 특성
    expect(indicators!.rsi14).toBeLessThan(50);
    expect(indicators!.disparity20).toBeLessThan(0);
    expect(indicators!.disparity60).toBeLessThan(0);
    expect(indicators!.roc10).toBeLessThan(0);
    expect(indicators!.stochasticK).toBeLessThan(50);
  });

  it("모든 지표가 소수점 4자리까지 정밀도를 유지해야 한다", () => {
    const prices = createPriceArray(
      "2024-01-01",
      Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 10),
      0.02
    );
    const indicators = calculateRpmIndicators(prices, 69);

    expect(indicators).not.toBeNull();

    const checkPrecision = (value: number) => {
      const decimalPart = value.toString().split(".")[1] || "";
      return decimalPart.length <= 4;
    };

    expect(checkPrecision(indicators!.rsi14)).toBe(true);
    expect(checkPrecision(indicators!.disparity20)).toBe(true);
    expect(checkPrecision(indicators!.roc10)).toBe(true);
    expect(checkPrecision(indicators!.macdHistogram)).toBe(true);
    expect(checkPrecision(indicators!.bollingerWidth)).toBe(true);
    expect(checkPrecision(indicators!.atrPercent)).toBe(true);
    expect(checkPrecision(indicators!.disparity60)).toBe(true);
    expect(checkPrecision(indicators!.stochasticK)).toBe(true);
  });
});
