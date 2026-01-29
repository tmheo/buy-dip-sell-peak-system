/**
 * RPM 8개 지표 계산 함수
 * SPEC-RPM-EXPERIMENT-001 TASK-003, TASK-004
 *
 * 새로운 지표:
 * - MACD Histogram: EMA(12) - EMA(26), Signal = EMA(9) of MACD
 * - Bollinger Width: (상단 - 하단) / 중앙
 * - ATR%: ATR(14) / 종가 × 100
 * - Stochastic %K: Slow Stochastic (14, 3)
 * - ROC 10: 10일 변화율
 * - Disparity 60: (종가 - MA60) / MA60 × 100
 */
import Decimal from "decimal.js";

import { calculateSMA, calculateRSI } from "@/backtest/metrics";

import type { RpmIndicators, DailyPrice } from "./types";

/**
 * 소수점 자릿수 맞춤 (버림)
 */
function toDecimalPlaces(value: Decimal, places: number): number {
  return value.toDecimalPlaces(places, Decimal.ROUND_DOWN).toNumber();
}

// ============================================================
// TASK-003: MACD Implementation
// ============================================================

/**
 * EMA (Exponential Moving Average) 계산
 * MACD에서 사용하는 표준 EMA: α = 2 / (period + 1)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param period - EMA 기간
 * @param index - 계산할 인덱스
 * @returns EMA 값 또는 데이터 부족 시 null
 */
export function calculateEMA(prices: number[], period: number, index: number): number | null {
  // 최소 period 개의 데이터 필요
  if (index < period - 1) return null;
  if (prices.length <= index) return null;

  // 초기 SMA로 EMA 시작값 계산
  let ema = new Decimal(0);
  for (let i = 0; i < period; i++) {
    ema = ema.add(prices[i]);
  }
  ema = ema.div(period);

  // EMA 스무딩 적용: EMA = Price × α + EMA_prev × (1 - α)
  const alpha = new Decimal(2).div(period + 1);
  const oneMinusAlpha = new Decimal(1).sub(alpha);

  for (let i = period; i <= index; i++) {
    ema = new Decimal(prices[i]).mul(alpha).add(ema.mul(oneMinusAlpha));
  }

  return toDecimalPlaces(ema, 4);
}

/**
 * MACD Line 계산: EMA(12) - EMA(26)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns MACD Line 또는 데이터 부족 시 null
 */
export function calculateMACD(prices: number[], index: number): number | null {
  // EMA26 계산에 최소 26개 데이터 필요 (index >= 25)
  if (index < 25) return null;

  const ema12 = calculateEMA(prices, 12, index);
  const ema26 = calculateEMA(prices, 26, index);

  if (ema12 === null || ema26 === null) return null;

  const macd = new Decimal(ema12).sub(ema26);
  return toDecimalPlaces(macd, 4);
}

/**
 * MACD Signal Line 계산: EMA(9) of MACD values
 *
 * @param macdValues - MACD 값 배열
 * @param index - 계산할 인덱스 (macdValues 배열 내)
 * @returns Signal Line 또는 데이터 부족 시 null
 */
export function calculateSignalLine(macdValues: number[], index: number): number | null {
  // Signal Line은 MACD의 9일 EMA
  if (index < 8) return null;
  if (macdValues.length <= index) return null;

  return calculateEMA(macdValues, 9, index);
}

/**
 * MACD Histogram 계산: MACD - Signal
 * 가격 배열에서 직접 계산
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns MACD Histogram 또는 데이터 부족 시 null
 */
export function calculateMACDHistogram(prices: number[], index: number): number | null {
  // MACD 계산에 26일 필요, Signal에 추가 8일 필요 (총 34일, index >= 33)
  // 정확히: MACD는 index 25부터, Signal은 MACD 9개 필요하므로 index 33부터
  if (index < 33) return null;
  if (prices.length <= index) return null;

  // MACD 값들을 먼저 계산 (index 25부터 현재까지)
  const macdValues: number[] = [];
  for (let i = 25; i <= index; i++) {
    const macd = calculateMACD(prices, i);
    if (macd === null) return null;
    macdValues.push(macd);
  }

  // Signal Line 계산 (macdValues의 마지막 인덱스에서)
  const macdIndex = macdValues.length - 1;
  if (macdIndex < 8) return null;

  const signal = calculateSignalLine(macdValues, macdIndex);
  if (signal === null) return null;

  const currentMacd = macdValues[macdIndex];
  const histogram = new Decimal(currentMacd).sub(signal);

  return toDecimalPlaces(histogram, 4);
}

// ============================================================
// TASK-004: Other Indicators
// ============================================================

/**
 * Bollinger Band Width 계산
 * Width = (상단 - 하단) / 중앙
 * 상단 = MA20 + 2σ, 하단 = MA20 - 2σ, 중앙 = MA20
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns Bollinger Width 또는 데이터 부족 시 null
 */
export function calculateBollingerWidth(prices: number[], index: number): number | null {
  const period = 20;

  // MA20 계산에 최소 20개 데이터 필요 (index >= 19)
  if (index < period - 1) return null;
  if (prices.length <= index) return null;

  // MA20 (중앙 밴드)
  const ma20 = calculateSMA(prices, period, index);
  if (ma20 === null || ma20 === 0) return null;

  // 표준편차 계산
  let sumSquaredDiff = new Decimal(0);
  for (let i = index - period + 1; i <= index; i++) {
    const diff = new Decimal(prices[i]).sub(ma20);
    sumSquaredDiff = sumSquaredDiff.add(diff.pow(2));
  }
  const variance = sumSquaredDiff.div(period);
  const stdDev = variance.sqrt();

  // 상단 = MA20 + 2σ, 하단 = MA20 - 2σ
  const upper = new Decimal(ma20).add(stdDev.mul(2));
  const lower = new Decimal(ma20).sub(stdDev.mul(2));

  // Width = (상단 - 하단) / 중앙
  const width = upper.sub(lower).div(ma20);

  return toDecimalPlaces(width, 4);
}

/**
 * True Range 계산
 * TR = max(H-L, |H-Cp|, |L-Cp|)
 * Cp = 전일 종가
 *
 * @param high - 당일 고가
 * @param low - 당일 저가
 * @param prevClose - 전일 종가
 * @returns True Range
 */
function calculateTrueRange(high: number, low: number, prevClose: number): number {
  const highLow = new Decimal(high).sub(low);
  const highClose = new Decimal(high).sub(prevClose).abs();
  const lowClose = new Decimal(low).sub(prevClose).abs();

  return Decimal.max(highLow, highClose, lowClose).toNumber();
}

/**
 * ATR% 계산: ATR(14) / 종가 × 100
 * ATR = 14일 True Range의 EMA (Wilder's smoothing)
 *
 * @param prices - OHLC 가격 배열
 * @param index - 계산할 인덱스
 * @returns ATR% 또는 데이터 부족 시 null
 */
export function calculateATRPercent(prices: DailyPrice[], index: number): number | null {
  const period = 14;

  // ATR14 계산에 최소 15개 데이터 필요 (14일 TR + 시작점)
  if (index < period) return null;
  if (prices.length <= index) return null;

  // 초기 ATR: 처음 14일의 TR 단순 평균
  let sumTR = new Decimal(0);
  for (let i = 1; i <= period; i++) {
    const tr = calculateTrueRange(prices[i].high, prices[i].low, prices[i - 1].close);
    sumTR = sumTR.add(tr);
  }
  let atr = sumTR.div(period);

  // Wilder's smoothing 적용: ATR = (ATR_prev × 13 + TR) / 14
  for (let i = period + 1; i <= index; i++) {
    const tr = calculateTrueRange(prices[i].high, prices[i].low, prices[i - 1].close);
    atr = atr
      .mul(period - 1)
      .add(tr)
      .div(period);
  }

  // ATR% = ATR / 종가 × 100
  const closePrice = prices[index].adjClose;
  if (closePrice === 0) return null;

  const atrPercent = atr.div(closePrice).mul(100);
  return toDecimalPlaces(atrPercent, 4);
}

/**
 * Stochastic Fast %K 계산
 * %K = (C - L14) / (H14 - L14) × 100
 *
 * 참고: RPM 블로그에서 사용하는 공식은 Fast %K (스무딩 없음)
 * https://blog.naver.com/therich-roy/224158442470
 *
 * @param prices - OHLC 가격 배열
 * @param index - 계산할 인덱스
 * @returns Stochastic %K (0-100) 또는 데이터 부족 시 null
 */
export function calculateStochasticK(prices: DailyPrice[], index: number): number | null {
  const kPeriod = 14;

  // Fast %K 계산에 14일 데이터 필요 (index >= 13)
  if (index < kPeriod - 1) return null;
  if (prices.length <= index) return null;

  // 14일간 고가/저가 찾기
  let highest = prices[index].high;
  let lowest = prices[index].low;

  for (let i = index - kPeriod + 1; i < index; i++) {
    if (prices[i].high > highest) highest = prices[i].high;
    if (prices[i].low < lowest) lowest = prices[i].low;
  }

  const closePrice = prices[index].adjClose;
  const range = new Decimal(highest).sub(lowest);

  // 범위가 0이면 50으로 처리 (변동 없음)
  if (range.eq(0)) {
    return 50;
  }

  // Fast %K = (Close - LL14) / (HH14 - LL14) × 100
  const fastK = new Decimal(closePrice).sub(lowest).div(range).mul(100);

  return toDecimalPlaces(fastK, 4);
}

/**
 * Stochastic Slow %K 계산 (Fast %K의 3일 SMA)
 * Fast %K = (C - L14) / (H14 - L14) × 100
 * Slow %K = SMA(3) of Fast %K
 *
 * @param prices - OHLC 가격 배열
 * @param index - 계산할 인덱스
 * @returns Slow Stochastic %K (0-100) 또는 데이터 부족 시 null
 */
export function calculateSlowStochasticK(prices: DailyPrice[], index: number): number | null {
  const kPeriod = 14;
  const smoothPeriod = 3;

  // Slow %K 계산에 14 + 3 - 1 = 16일 데이터 필요 (index >= 15)
  if (index < kPeriod + smoothPeriod - 2) return null;
  if (prices.length <= index) return null;

  // Fast %K 값들 계산 (smoothPeriod 개)
  const fastKValues: number[] = [];

  for (let j = index - smoothPeriod + 1; j <= index; j++) {
    // j 위치에서 14일 고가/저가 찾기
    let highest = prices[j].high;
    let lowest = prices[j].low;

    for (let i = j - kPeriod + 1; i < j; i++) {
      if (prices[i].high > highest) highest = prices[i].high;
      if (prices[i].low < lowest) lowest = prices[i].low;
    }

    const closePrice = prices[j].adjClose;
    const range = new Decimal(highest).sub(lowest);

    // 범위가 0이면 50으로 처리 (변동 없음)
    if (range.eq(0)) {
      fastKValues.push(50);
    } else {
      const fastK = new Decimal(closePrice).sub(lowest).div(range).mul(100);
      fastKValues.push(fastK.toNumber());
    }
  }

  // Slow %K = Fast %K의 3일 SMA
  const slowK = fastKValues.reduce((sum, val) => sum + val, 0) / smoothPeriod;

  return toDecimalPlaces(new Decimal(slowK), 4);
}

/**
 * ROC 10 계산: (현재가 - 10일전) / 10일전 × 100
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns ROC10 (%) 또는 데이터 부족 시 null
 */
export function calculateROC10(prices: number[], index: number): number | null {
  const period = 10;

  // 10일 전 데이터 필요 (index >= 10)
  if (index < period) return null;
  if (prices.length <= index) return null;

  const prevPrice = prices[index - period];
  if (prevPrice === 0) return null;

  const currentPrice = new Decimal(prices[index]);
  const prev = new Decimal(prevPrice);

  // ROC = (현재가 - 10일 전 가격) / 10일 전 가격 × 100
  const roc = currentPrice.sub(prev).div(prev).mul(100);

  return toDecimalPlaces(roc, 4);
}

/**
 * Disparity 20 계산: (종가 - MA20) / MA20 × 100
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns Disparity20 (%) 또는 데이터 부족 시 null
 */
export function calculateDisparity20(prices: number[], index: number): number | null {
  // MA20 계산에 최소 20개 데이터 필요 (index >= 19)
  if (index < 19) return null;
  if (prices.length <= index) return null;

  const ma20 = calculateSMA(prices, 20, index);
  if (ma20 === null || ma20 === 0) return null;

  const disparity = new Decimal(prices[index]).sub(ma20).div(ma20).mul(100);

  return toDecimalPlaces(disparity, 4);
}

/**
 * Disparity 60 계산: (종가 - MA60) / MA60 × 100
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns Disparity60 (%) 또는 데이터 부족 시 null
 */
export function calculateDisparity60(prices: number[], index: number): number | null {
  // MA60 계산에 최소 60개 데이터 필요 (index >= 59)
  if (index < 59) return null;
  if (prices.length <= index) return null;

  const ma60 = calculateSMA(prices, 60, index);
  if (ma60 === null || ma60 === 0) return null;

  const disparity = new Decimal(prices[index]).sub(ma60).div(ma60).mul(100);

  return toDecimalPlaces(disparity, 4);
}

// ============================================================
// TASK-005: Integration
// ============================================================

/**
 * 8개 RPM 지표 통합 계산
 * 최소 60일 데이터 필요 (MA60 계산, MACD Histogram은 34일)
 *
 * @param prices - OHLC 가격 배열
 * @param index - 계산할 인덱스
 * @returns RpmIndicators 객체 또는 데이터 부족 시 null
 */
export function calculateRpmIndicators(prices: DailyPrice[], index: number): RpmIndicators | null {
  // 최소 60일 데이터 필요 (MA60 계산)
  if (index < 59) return null;
  if (prices.length <= index) return null;

  // adjClose 배열 추출 (다른 함수에서 사용)
  const adjCloses = prices.map((p) => p.adjClose);

  // 1. RSI14 - 기존 함수 재사용
  const rsi14 = calculateRSI(adjCloses, index);
  if (rsi14 === null) return null;

  // 2. Disparity20
  const disparity20 = calculateDisparity20(adjCloses, index);
  if (disparity20 === null) return null;

  // 3. ROC10
  const roc10 = calculateROC10(adjCloses, index);
  if (roc10 === null) return null;

  // 4. MACD Histogram
  const macdHistogram = calculateMACDHistogram(adjCloses, index);
  if (macdHistogram === null) return null;

  // 5. Bollinger Width
  const bollingerWidth = calculateBollingerWidth(adjCloses, index);
  if (bollingerWidth === null) return null;

  // 6. ATR%
  const atrPercent = calculateATRPercent(prices, index);
  if (atrPercent === null) return null;

  // 7. Disparity60
  const disparity60 = calculateDisparity60(adjCloses, index);
  if (disparity60 === null) return null;

  // 8. Stochastic %K
  const stochasticK = calculateStochasticK(prices, index);
  if (stochasticK === null) return null;

  return {
    rsi14,
    disparity20,
    roc10,
    macdHistogram,
    bollingerWidth,
    atrPercent,
    disparity60,
    stochasticK,
  };
}
