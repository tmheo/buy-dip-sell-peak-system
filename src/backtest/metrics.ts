/**
 * 성과 지표 계산 함수
 * SPEC-BACKTEST-001 REQ-009
 * SPEC-METRICS-001 기술적 지표 계산
 */
import Decimal from "decimal.js";
import type { DailySnapshot, TechnicalMetrics } from "./types";
import { floorToDecimal } from "./order";

/**
 * 수익률 계산
 *
 * @param initial - 초기 투자금
 * @param final - 최종 자산
 * @returns 수익률 (소수점, 예: 0.3 = 30%)
 */
export function calculateReturn(initial: number, final: number): number {
  if (initial === 0) return 0;
  return floorToDecimal((final - initial) / initial, 4);
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
 * 변동성 계산 - 20일 연환산 변동성
 * SPEC-METRICS-001
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns 연환산 변동성 (%) 또는 데이터 부족 시 null (CON-001)
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

  // 평균 수익률
  const sum = returns.reduce((acc, r) => acc.add(r), new Decimal(0));
  const mean = sum.div(returns.length);

  // 분산 계산
  const squaredDiffs = returns.map((r) => r.sub(mean).pow(2));
  const variance = squaredDiffs.reduce((acc, d) => acc.add(d), new Decimal(0)).div(returns.length);

  // 표준편차
  const stddev = variance.sqrt();

  // 연환산: stddev × sqrt(252) × 100
  const annualized = stddev.mul(new Decimal(252).sqrt()).mul(100);

  return annualized.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 기술적 지표 종합 계산
 * SPEC-METRICS-001
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns TechnicalMetrics 객체 또는 데이터 부족 시 null (CON-001)
 */
export function calculateTechnicalMetrics(
  prices: number[],
  index: number
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

  // 골든크로스: (MA20 - MA60) / MA60 × 100
  const goldenCross = new Decimal(ma20)
    .sub(ma60)
    .div(ma60)
    .mul(100)
    .toDecimalPlaces(4, Decimal.ROUND_DOWN)
    .toNumber();

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

  // 이격도: adjClose / MA20 × 100
  const disparity = new Decimal(prices[index])
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
    maSlope,
    disparity,
    rsi14,
    roc12,
    volatility20,
  };
}
