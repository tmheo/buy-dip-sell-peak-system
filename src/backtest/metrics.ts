/**
 * 성과 지표 계산 함수
 * SPEC-BACKTEST-001 REQ-009
 * SPEC-METRICS-001 기술적 지표 계산
 */
import Decimal from "decimal.js";
import type { DailySnapshot, TechnicalMetrics } from "./types";
import { floorToDecimal, roundToDecimal } from "./order";

/**
 * 수익률 계산
 *
 * @param initial - 초기 투자금
 * @param final - 최종 자산
 * @returns 수익률 (소수점, 예: 0.3 = 30%)
 */
export function calculateReturn(initial: number, final: number): number {
  if (initial === 0) return 0;
  return roundToDecimal((final - initial) / initial, 4);
}

/**
 * MDD (Maximum Drawdown) 계산
 * 고점 대비 최대 낙폭을 계산
 *
 * @param history - 일별 스냅샷 배열
 * @returns MDD (음수, 예: -0.25 = -25%)
 */
export function calculateMDD(history: DailySnapshot[]): number {
  if (history.length === 0) return 0;

  let peak = history[0].totalAsset;
  let maxDrawdown = 0;

  for (const snapshot of history) {
    if (snapshot.totalAsset > peak) {
      peak = snapshot.totalAsset;
    }
    const drawdown = (peak - snapshot.totalAsset) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // -0 대신 0을 반환하기 위해 명시적 처리
  if (maxDrawdown === 0) return 0;
  return floorToDecimal(-maxDrawdown, 4); // 음수로 반환
}

/**
 * 승률 계산
 * 수익이 0보다 큰 사이클의 비율
 *
 * @param cycles - 사이클별 수익 배열
 * @returns 승률 (소수점, 예: 0.8667 = 86.67%)
 */
export function calculateWinRate(cycles: { profit: number }[]): number {
  if (cycles.length === 0) return 0;

  const wins = cycles.filter((c) => c.profit > 0).length;
  return floorToDecimal(wins / cycles.length, 4);
}

// ============================================================
// SPEC-METRICS-001: 기술적 지표 계산 함수
// ============================================================

/**
 * 단순이동평균 (SMA) 계산
 * SPEC-METRICS-001
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param period - 이동평균 기간 (예: 20, 60)
 * @param index - 계산할 인덱스
 * @returns SMA 값 또는 데이터 부족 시 null (CON-001)
 */
export function calculateSMA(prices: number[], period: number, index: number): number | null {
  // CON-001: 데이터 부족 시 null 반환
  if (index < period - 1) return null;
  if (prices.length <= index) return null;

  let sum = new Decimal(0);
  for (let i = index - period + 1; i <= index; i++) {
    sum = sum.add(prices[i]);
  }

  return sum.div(period).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/**
 * RSI (Relative Strength Index) 계산 - Wilder's EMA 방식
 * SPEC-METRICS-001
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns RSI 값 (0-100) 또는 데이터 부족 시 null (CON-001)
 */
export function calculateRSI(prices: number[], index: number): number | null {
  const period = 14;

  // CON-001: RSI14는 최소 15개 데이터 필요 (14일 변화량)
  if (index < period) return null;
  if (prices.length <= index) return null;

  // 첫 14일의 상승/하락 계산 (단순 평균)
  // 변화량: prices[1] - prices[0], prices[2] - prices[1], ..., prices[14] - prices[13]
  let sumGain = new Decimal(0);
  let sumLoss = new Decimal(0);

  for (let i = 1; i <= period; i++) {
    const change = new Decimal(prices[i]).sub(prices[i - 1]);
    if (change.gt(0)) {
      sumGain = sumGain.add(change);
    } else {
      sumLoss = sumLoss.add(change.abs());
    }
  }

  let avgGain = sumGain.div(period);
  let avgLoss = sumLoss.div(period);

  // Wilder's EMA 적용 (15일 이후부터 index까지)
  for (let i = period + 1; i <= index; i++) {
    const change = new Decimal(prices[i]).sub(prices[i - 1]);
    const gain = change.gt(0) ? change : new Decimal(0);
    const loss = change.lt(0) ? change.abs() : new Decimal(0);

    // 스무딩: (이전 평균 × 13 + 현재 값) / 14
    avgGain = avgGain
      .mul(period - 1)
      .add(gain)
      .div(period);
    avgLoss = avgLoss
      .mul(period - 1)
      .add(loss)
      .div(period);
  }

  // CON-002: avgLoss가 0이면 RSI = 100
  if (avgLoss.eq(0)) {
    return 100;
  }

  const rs = avgGain.div(avgLoss);
  const rsi = new Decimal(100).sub(new Decimal(100).div(new Decimal(1).add(rs)));

  return rsi.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/**
 * ROC (Rate of Change) 계산 - 12일 변화율
 * SPEC-METRICS-001
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns ROC 값 (%) 또는 데이터 부족 시 null (CON-001, CON-002)
 */
export function calculateROC(prices: number[], index: number): number | null {
  const period = 12;

  // CON-001: 데이터 부족 시 null 반환
  if (index < period) return null;
  if (prices.length <= index) return null;

  const prevPrice = prices[index - period];

  // CON-002: 12일 전 가격이 0이면 null (제로 나눗셈 방지)
  if (prevPrice === 0) return null;

  const currentPrice = new Decimal(prices[index]);
  const prev = new Decimal(prevPrice);

  // ROC = (현재가 - 12일 전 가격) / 12일 전 가격 × 100
  const roc = currentPrice.sub(prev).div(prev).mul(100);

  return roc.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 변동성 계산 - 20일 표본 표준편차 × √20 (원본 사이트 방식)
 * SPEC-METRICS-001
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns 변동성 (√20 연환산) 또는 데이터 부족 시 null (CON-001)
 */
export function calculateVolatility(prices: number[], index: number): number | null {
  const period = 20;

  // CON-001: 20일 수익률 계산에 21개 데이터 필요
  if (index < period) return null;
  if (prices.length <= index) return null;

  // 일별 수익률 계산
  const returns: Decimal[] = [];
  for (let i = index - period + 1; i <= index; i++) {
    const prevPrice = prices[i - 1];
    // CON-002: 이전 가격이 0이면 건너뛰기
    if (prevPrice === 0) continue;

    const dailyReturn = new Decimal(prices[i]).sub(prevPrice).div(prevPrice);
    returns.push(dailyReturn);
  }

  if (returns.length === 0) return 0;
  if (returns.length === 1) return 0; // 표본 분산 계산 불가 (n-1=0)

  // 평균 수익률
  const sum = returns.reduce((acc, r) => acc.add(r), new Decimal(0));
  const mean = sum.div(returns.length);

  // 표본 분산 계산 (n-1로 나눔)
  const squaredDiffs = returns.map((r) => r.sub(mean).pow(2));
  const variance = squaredDiffs
    .reduce((acc, d) => acc.add(d), new Decimal(0))
    .div(returns.length - 1);

  // 표본 표준편차
  const stddev = variance.sqrt();

  // √20 연환산 (원본 사이트 방식)
  const annualized = stddev.mul(new Decimal(20).sqrt());

  return annualized.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/**
 * CAGR (Compound Annual Growth Rate) 계산
 * 연평균 복리 수익률
 *
 * @param initialCapital - 초기 투자금
 * @param finalAsset - 최종 자산
 * @param tradingDays - 거래일 수
 * @returns CAGR (소수점, 예: 0.15 = 15%)
 */
export function calculateCAGR(
  initialCapital: number,
  finalAsset: number,
  tradingDays: number
): number {
  if (initialCapital <= 0 || tradingDays <= 0) return 0;

  // 연간 거래일 수 (약 252일)
  const tradingDaysPerYear = 252;
  const years = tradingDays / tradingDaysPerYear;

  if (years <= 0) return 0;

  // CAGR = (최종자산 / 초기자산)^(1/연수) - 1
  const ratio = new Decimal(finalAsset).div(initialCapital);

  // 손실인 경우에도 정확히 계산
  if (ratio.lte(0)) return -1; // -100% 이하 손실

  const cagr = ratio.pow(new Decimal(1).div(years)).sub(1);

  return cagr.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * 단일 날짜의 기술적 지표 계산 (부분 계산 허용)
 * 차트용으로 일부 지표만 계산 가능해도 반환
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @param date - 해당 날짜
 * @returns 부분 기술적 지표 객체
 */
export function calculateDailyMetrics(
  prices: number[],
  index: number,
  date: string
): {
  date: string;
  goldenCross: number | null;
  maSlope: number | null;
  disparity: number | null;
  rsi14: number | null;
  roc12: number | null;
  volatility20: number | null;
} {
  // MA20, MA60 계산
  const ma20 = calculateSMA(prices, 20, index);
  const ma60 = calculateSMA(prices, 60, index);

  // 골든크로스: (MA20 - MA60) / MA60 × 100
  let goldenCross: number | null = null;
  if (ma20 !== null && ma60 !== null && ma60 !== 0) {
    goldenCross = new Decimal(ma20)
      .sub(ma60)
      .div(ma60)
      .mul(100)
      .toDecimalPlaces(4, Decimal.ROUND_DOWN)
      .toNumber();
  }

  // MA 기울기: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100
  let maSlope: number | null = null;
  if (ma20 !== null && index >= 29) {
    const ma20_10DaysAgo = calculateSMA(prices, 20, index - 10);
    if (ma20_10DaysAgo !== null && ma20_10DaysAgo !== 0) {
      maSlope = new Decimal(ma20)
        .sub(ma20_10DaysAgo)
        .div(ma20_10DaysAgo)
        .mul(100)
        .toDecimalPlaces(4, Decimal.ROUND_DOWN)
        .toNumber();
    }
  }

  // 이격도: (adjClose - MA20) / MA20 × 100
  let disparity: number | null = null;
  if (ma20 !== null && ma20 !== 0) {
    disparity = new Decimal(prices[index])
      .sub(ma20)
      .div(ma20)
      .mul(100)
      .toDecimalPlaces(4, Decimal.ROUND_DOWN)
      .toNumber();
  }

  // RSI14
  const rsi14 = calculateRSI(prices, index);

  // ROC12
  const roc12 = calculateROC(prices, index);

  // 변동성
  const volatility20 = calculateVolatility(prices, index);

  return {
    date,
    goldenCross,
    maSlope,
    disparity,
    rsi14,
    roc12,
    volatility20,
  };
}

/**
 * 기술적 지표 종합 계산
 * SPEC-METRICS-001
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @param backtestDays - 백테스트 기간 내 거래일 수 (정배열 NaN 처리용, 선택)
 * @returns TechnicalMetrics 객체 또는 데이터 부족 시 null (CON-001)
 */
export function calculateTechnicalMetrics(
  prices: number[],
  index: number,
  backtestDays?: number
): TechnicalMetrics | null {
  // CON-001: MA60 요구사항 - 최소 60개 데이터 필요
  if (index < 59) return null;
  if (prices.length <= index) return null;

  // MA20 계산
  const ma20 = calculateSMA(prices, 20, index);
  if (ma20 === null) return null;

  // MA60 계산
  const ma60 = calculateSMA(prices, 60, index);
  if (ma60 === null) return null;

  // CON-002: MA60이 0이면 null (제로 나눗셈 방지)
  if (ma60 === 0) return null;

  // 정배열 여부: MA20 > MA60 (짧은 백테스트 기간에도 표시)
  const isGoldenCross = ma20 > ma60;

  // 골든크로스: (MA20 - MA60) / MA60 × 100
  // 백테스트 기간이 60일 미만이면 NaN (원본 사이트 방식)
  let goldenCross: number;
  if (backtestDays !== undefined && backtestDays < 60) {
    goldenCross = NaN;
  } else {
    goldenCross = new Decimal(ma20)
      .sub(ma60)
      .div(ma60)
      .mul(100)
      .toDecimalPlaces(4, Decimal.ROUND_DOWN)
      .toNumber();
  }

  // MA 기울기: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100
  const ma20_10DaysAgo = calculateSMA(prices, 20, index - 10);
  let maSlope = 0;
  if (ma20_10DaysAgo !== null && ma20_10DaysAgo !== 0) {
    maSlope = new Decimal(ma20)
      .sub(ma20_10DaysAgo)
      .div(ma20_10DaysAgo)
      .mul(100)
      .toDecimalPlaces(4, Decimal.ROUND_DOWN)
      .toNumber();
  }

  // 이격도: (adjClose - MA20) / MA20 × 100 (원본 사이트 방식)
  const disparity = new Decimal(prices[index])
    .sub(ma20)
    .div(ma20)
    .mul(100)
    .toDecimalPlaces(4, Decimal.ROUND_DOWN)
    .toNumber();

  // RSI14 계산
  const rsi14 = calculateRSI(prices, index);
  if (rsi14 === null) return null;

  // ROC12 계산
  const roc12 = calculateROC(prices, index);
  if (roc12 === null) return null;

  // 20일 변동성 계산
  const volatility20 = calculateVolatility(prices, index);
  if (volatility20 === null) return null;

  return {
    goldenCross,
    isGoldenCross,
    maSlope,
    disparity,
    rsi14,
    roc12,
    volatility20,
  };
}
