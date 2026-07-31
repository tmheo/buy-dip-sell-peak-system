/**
 * 기술적 지표 계산 코어
 * SPEC-METRICS-001
 *
 * 슬라이딩 윈도우 배치 알고리즘으로 계산하되, 수치 의미는 개별 계산 방식을 정본으로 따른다:
 * 모든 지표는 Decimal 연쇄로 계산한 뒤 소수 4자리에서 ROUND_DOWN 한다.
 * 계산 불가능한 지표는 null로 보존한다.
 * 결측 정책(행 스킵, 0 치환, 정배열 NaN)은 코어가 아니라 소비자 어댑터의 몫이다.
 */
import Decimal from "decimal.js";
import type { IndicatorRow } from "./types";

/** 기술적 지표 계산을 위한 기간 상수 */
const MA_SHORT_PERIOD = 20;
const MA_LONG_PERIOD = 60;
const MA_SLOPE_LOOKBACK = 10;
const RSI_PERIOD = 14;
const ROC_PERIOD = 12;
const VOLATILITY_PERIOD = 20;

function roundDown4(value: Decimal): number {
  return value.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/** 변화율(%): (to - from) / from × 100. 호출부에서 from이 0이 아님을 보장해야 한다. */
function changeRatePercent(from: number, to: number): number {
  return roundDown4(new Decimal(to).sub(from).div(from).mul(100));
}

/**
 * SMA 시계열 계산 (슬라이딩 윈도우)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param period - 이동평균 기간
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns startIndex에 정렬된 SMA 배열. 계산 불가능한 인덱스는 null (CON-001)
 */
function smaSeries(
  prices: number[],
  period: number,
  startIndex: number,
  endIndex: number
): (number | null)[] {
  const results: (number | null)[] = new Array(endIndex - startIndex + 1).fill(null);

  const firstValid = Math.max(startIndex, period - 1);
  const lastValid = Math.min(endIndex, prices.length - 1);
  if (firstValid > lastValid) return results;

  // 첫 번째 윈도우는 전체 합산
  let sum = new Decimal(0);
  for (let i = firstValid - period + 1; i <= firstValid; i++) {
    sum = sum.add(prices[i]);
  }
  results[firstValid - startIndex] = roundDown4(sum.div(period));

  // 이후는 슬라이딩 윈도우: 새 값 추가, 오래된 값 제거
  for (let i = firstValid + 1; i <= lastValid; i++) {
    sum = sum.sub(prices[i - period]).add(prices[i]);
    results[i - startIndex] = roundDown4(sum.div(period));
  }

  return results;
}

/**
 * RSI14 시계열 계산 (Wilder's EMA 방식)
 * avgGain/avgLoss 상태를 한 번만 누적해 구간 전체를 계산한다.
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns startIndex에 정렬된 RSI 배열. 계산 불가능한 인덱스는 null (CON-001)
 */
function rsiSeries(prices: number[], startIndex: number, endIndex: number): (number | null)[] {
  const results: (number | null)[] = new Array(endIndex - startIndex + 1).fill(null);

  const lastValid = Math.min(endIndex, prices.length - 1);
  // CON-001: RSI14는 최소 15개 데이터 필요 (14일 변화량)
  if (lastValid < RSI_PERIOD || lastValid < startIndex) return results;

  // 첫 14일의 상승/하락 계산 (단순 평균)
  let sumGain = new Decimal(0);
  let sumLoss = new Decimal(0);
  for (let i = 1; i <= RSI_PERIOD; i++) {
    const change = new Decimal(prices[i]).sub(prices[i - 1]);
    if (change.gt(0)) {
      sumGain = sumGain.add(change);
    } else {
      sumLoss = sumLoss.add(change.abs());
    }
  }
  let avgGain = sumGain.div(RSI_PERIOD);
  let avgLoss = sumLoss.div(RSI_PERIOD);

  for (let i = RSI_PERIOD; i <= lastValid; i++) {
    if (i > RSI_PERIOD) {
      // Wilder's EMA 스무딩: (이전 평균 × 13 + 현재 값) / 14
      const change = new Decimal(prices[i]).sub(prices[i - 1]);
      const gain = change.gt(0) ? change : new Decimal(0);
      const loss = change.lt(0) ? change.abs() : new Decimal(0);

      avgGain = avgGain
        .mul(RSI_PERIOD - 1)
        .add(gain)
        .div(RSI_PERIOD);
      avgLoss = avgLoss
        .mul(RSI_PERIOD - 1)
        .add(loss)
        .div(RSI_PERIOD);
    }

    if (i < startIndex) continue;

    // CON-002: avgLoss가 0이면 RSI = 100
    if (avgLoss.eq(0)) {
      results[i - startIndex] = 100;
    } else {
      const rs = avgGain.div(avgLoss);
      const rsi = new Decimal(100).sub(new Decimal(100).div(new Decimal(1).add(rs)));
      results[i - startIndex] = roundDown4(rsi);
    }
  }

  return results;
}

/**
 * ROC12 시계열 계산
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns startIndex에 정렬된 ROC 배열. 계산 불가능한 인덱스는 null (CON-001, CON-002)
 */
function rocSeries(prices: number[], startIndex: number, endIndex: number): (number | null)[] {
  const results: (number | null)[] = new Array(endIndex - startIndex + 1).fill(null);

  const lastValid = Math.min(endIndex, prices.length - 1);
  for (let i = Math.max(startIndex, ROC_PERIOD); i <= lastValid; i++) {
    const prevPrice = prices[i - ROC_PERIOD];
    // CON-002: 12일 전 가격이 0이면 null (제로 나눗셈 방지)
    if (prevPrice === 0) continue;

    // ROC = (현재가 - 12일 전 가격) / 12일 전 가격 × 100
    results[i - startIndex] = changeRatePercent(prevPrice, prices[i]);
  }

  return results;
}

/**
 * 20일 변동성 시계열 계산 - 표본 표준편차 × √20 (원본 사이트 방식)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns startIndex에 정렬된 변동성 배열. 계산 불가능한 인덱스는 null (CON-001)
 */
function volatilitySeries(
  prices: number[],
  startIndex: number,
  endIndex: number
): (number | null)[] {
  const results: (number | null)[] = new Array(endIndex - startIndex + 1).fill(null);

  const lastValid = Math.min(endIndex, prices.length - 1);
  // CON-001: 20일 수익률 계산에 21개 데이터 필요
  for (let i = Math.max(startIndex, VOLATILITY_PERIOD); i <= lastValid; i++) {
    // 일별 수익률 계산
    const returns: Decimal[] = [];
    for (let j = i - VOLATILITY_PERIOD + 1; j <= i; j++) {
      const prevPrice = prices[j - 1];
      // CON-002: 이전 가격이 0이면 건너뛰기
      if (prevPrice === 0) continue;

      returns.push(new Decimal(prices[j]).sub(prevPrice).div(prevPrice));
    }

    // 표본 분산 계산 불가 (n-1=0)
    if (returns.length <= 1) {
      results[i - startIndex] = 0;
      continue;
    }

    // 평균 수익률
    const sum = returns.reduce((acc, r) => acc.add(r), new Decimal(0));
    const mean = sum.div(returns.length);

    // 표본 분산 (n-1로 나눔)
    const squaredDiffs = returns.map((r) => r.sub(mean).pow(2));
    const variance = squaredDiffs
      .reduce((acc, d) => acc.add(d), new Decimal(0))
      .div(returns.length - 1);

    // 표본 표준편차 × √20 연환산 (원본 사이트 방식)
    const annualized = variance.sqrt().mul(new Decimal(VOLATILITY_PERIOD).sqrt());
    results[i - startIndex] = roundDown4(annualized);
  }

  return results;
}

/**
 * 기술적 지표 시계열 계산 (종합 계산의 유일한 경로)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns 인덱스별 IndicatorRow 배열 (null 보존).
 *          배열 범위를 벗어난 인덱스는 전부 null인 행이 된다.
 */
export function computeIndicatorSeries(
  prices: number[],
  startIndex: number,
  endIndex: number
): IndicatorRow[] {
  if (startIndex > endIndex) return [];

  // maSlope용 과거 MA20까지 한 번에 계산 (구간을 10일 앞으로 확장)
  const ma20Values = smaSeries(prices, MA_SHORT_PERIOD, startIndex - MA_SLOPE_LOOKBACK, endIndex);
  const ma60Values = smaSeries(prices, MA_LONG_PERIOD, startIndex, endIndex);
  const rsiValues = rsiSeries(prices, startIndex, endIndex);
  const rocValues = rocSeries(prices, startIndex, endIndex);
  const volatilityValues = volatilitySeries(prices, startIndex, endIndex);

  const rows: IndicatorRow[] = [];

  for (let i = startIndex; i <= endIndex; i++) {
    const offset = i - startIndex;
    const ma20 = ma20Values[offset + MA_SLOPE_LOOKBACK];
    const ma20Past = ma20Values[offset];
    const ma60 = ma60Values[offset];

    // 골든크로스: (MA20 - MA60) / MA60 × 100
    const goldenCross =
      ma20 !== null && ma60 !== null && ma60 !== 0 ? changeRatePercent(ma60, ma20) : null;

    // 정배열 여부: MA20 > MA60
    const isGoldenCross = ma20 !== null && ma60 !== null ? ma20 > ma60 : null;

    // MA 기울기: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100
    const maSlope =
      ma20 !== null && ma20Past !== null && ma20Past !== 0
        ? changeRatePercent(ma20Past, ma20)
        : null;

    // 이격도: (adjClose - MA20) / MA20 × 100
    const disparity = ma20 !== null && ma20 !== 0 ? changeRatePercent(ma20, prices[i]) : null;

    rows.push({
      ma20,
      ma60,
      goldenCross,
      isGoldenCross,
      maSlope,
      disparity,
      rsi14: rsiValues[offset],
      roc12: rocValues[offset],
      volatility20: volatilityValues[offset],
    });
  }

  return rows;
}

/**
 * 단일 날짜의 기술적 지표 계산 (추천 기준일용)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns IndicatorRow (null 보존)
 */
export function computeIndicatorsAt(prices: number[], index: number): IndicatorRow {
  return computeIndicatorSeries(prices, index, index)[0];
}

/**
 * 단순이동평균 (SMA) 계산
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param period - 이동평균 기간 (예: 20, 60)
 * @param index - 계산할 인덱스
 * @returns SMA 값 또는 데이터 부족 시 null (CON-001)
 */
export function calculateSMA(prices: number[], period: number, index: number): number | null {
  return smaSeries(prices, period, index, index)[0];
}

/**
 * RSI14 (Relative Strength Index) 계산 - Wilder's EMA 방식
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns RSI 값 (0-100) 또는 데이터 부족 시 null (CON-001)
 */
export function calculateRSI(prices: number[], index: number): number | null {
  return rsiSeries(prices, index, index)[0];
}

/**
 * ROC12 (Rate of Change) 계산 - 12일 변화율
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns ROC 값 (%) 또는 데이터 부족 시 null (CON-001, CON-002)
 */
export function calculateROC(prices: number[], index: number): number | null {
  return rocSeries(prices, index, index)[0];
}

/**
 * 20일 변동성 계산 - 표본 표준편차 × √20 (원본 사이트 방식)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @returns 변동성 (√20 연환산) 또는 데이터 부족 시 null (CON-001)
 */
export function calculateVolatility(prices: number[], index: number): number | null {
  return volatilitySeries(prices, index, index)[0];
}
