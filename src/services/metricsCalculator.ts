/**
 * 배치 기술적 지표 계산 서비스
 * SPEC-PERFORMANCE-001
 *
 * 목적: 슬라이딩 윈도우 최적화를 통한 대량 지표 계산
 * - 기존 calculateTechnicalMetrics와 동일한 결과 보장
 * - O(m×n) → O(m) 시간 복잡도 개선 (SMA 계산)
 */

import Decimal from "decimal.js";
import type { DailyMetricRow } from "@/types";
import { floorToDecimal } from "@/backtest/order";

/** 기술적 지표 계산을 위한 기간 상수 */
const RSI_PERIOD = 14;
const ROC_PERIOD = 12;
const VOLATILITY_PERIOD = 20;
const MA_SLOPE_LOOKBACK = 10;

/**
 * 배치 SMA 계산 (슬라이딩 윈도우 최적화)
 * 기존: O(period) per index
 * 최적화: O(1) per index (첫 인덱스 이후)
 *
 * @param prices - 가격 배열
 * @param period - 이동평균 기간
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns SMA 값 배열 (인덱스별)
 */
function calculateSMABatch(
  prices: number[],
  period: number,
  startIndex: number,
  endIndex: number
): (number | null)[] {
  const results: (number | null)[] = [];

  // 첫 번째 유효한 인덱스 찾기
  const firstValidIndex = Math.max(startIndex, period - 1);

  // startIndex부터 firstValidIndex-1까지는 null
  for (let i = startIndex; i < firstValidIndex && i <= endIndex; i++) {
    results.push(null);
  }

  if (firstValidIndex > endIndex) {
    return results;
  }

  // 첫 번째 SMA 계산 (전체 합산)
  let sum = new Decimal(0);
  for (let i = firstValidIndex - period + 1; i <= firstValidIndex; i++) {
    sum = sum.add(prices[i]);
  }

  results.push(sum.div(period).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber());

  // 슬라이딩 윈도우로 나머지 계산
  for (let i = firstValidIndex + 1; i <= endIndex; i++) {
    if (i >= prices.length) {
      results.push(null);
      continue;
    }

    // 새 값 추가, 오래된 값 제거
    sum = sum.sub(prices[i - period]).add(prices[i]);
    results.push(sum.div(period).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber());
  }

  return results;
}

/**
 * 배치 RSI 계산 (Wilder's EMA 방식)
 *
 * @param prices - 가격 배열
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns RSI 값 배열
 */
function calculateRSIBatch(
  prices: number[],
  startIndex: number,
  endIndex: number
): (number | null)[] {
  const period = RSI_PERIOD;
  const results: (number | null)[] = [];

  // 먼저 index 0부터 시작하여 avgGain/avgLoss 상태를 유지
  let avgGain = new Decimal(0);
  let avgLoss = new Decimal(0);
  let initialized = false;

  // 초기 14일 계산 (인덱스 14에서 RSI 계산 가능)
  if (prices.length > period) {
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

    avgGain = sumGain.div(period);
    avgLoss = sumLoss.div(period);
    initialized = true;

    // index 15부터 startIndex 직전까지 상태 업데이트
    for (let i = period + 1; i < startIndex && i < prices.length; i++) {
      const change = new Decimal(prices[i]).sub(prices[i - 1]);
      const gain = change.gt(0) ? change : new Decimal(0);
      const loss = change.lt(0) ? change.abs() : new Decimal(0);

      avgGain = avgGain
        .mul(period - 1)
        .add(gain)
        .div(period);
      avgLoss = avgLoss
        .mul(period - 1)
        .add(loss)
        .div(period);
    }
  }

  // startIndex부터 endIndex까지 계산
  for (let i = startIndex; i <= endIndex; i++) {
    if (i < period || i >= prices.length) {
      results.push(null);
      continue;
    }

    if (!initialized) {
      results.push(null);
      continue;
    }

    // i == startIndex이고 startIndex > period인 경우, 상태 업데이트
    if (i >= period + 1) {
      const change = new Decimal(prices[i]).sub(prices[i - 1]);
      const gain = change.gt(0) ? change : new Decimal(0);
      const loss = change.lt(0) ? change.abs() : new Decimal(0);

      avgGain = avgGain
        .mul(period - 1)
        .add(gain)
        .div(period);
      avgLoss = avgLoss
        .mul(period - 1)
        .add(loss)
        .div(period);
    }

    // RSI 계산
    if (avgLoss.eq(0)) {
      results.push(100);
    } else {
      const rs = avgGain.div(avgLoss);
      const rsi = new Decimal(100).sub(new Decimal(100).div(new Decimal(1).add(rs)));
      results.push(rsi.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber());
    }
  }

  return results;
}

/**
 * 배치 ROC 계산
 *
 * @param prices - 가격 배열
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns ROC 값 배열
 */
function calculateROCBatch(
  prices: number[],
  startIndex: number,
  endIndex: number
): (number | null)[] {
  const period = ROC_PERIOD;
  const results: (number | null)[] = [];

  for (let i = startIndex; i <= endIndex; i++) {
    if (i < period || i >= prices.length) {
      results.push(null);
      continue;
    }

    const prevPrice = prices[i - period];
    if (prevPrice === 0) {
      results.push(null);
      continue;
    }

    const roc = new Decimal(prices[i]).sub(prevPrice).div(prevPrice).mul(100);
    results.push(roc.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber());
  }

  return results;
}

/**
 * 배치 변동성 계산
 *
 * @param prices - 가격 배열
 * @param startIndex - 시작 인덱스
 * @param endIndex - 끝 인덱스
 * @returns 변동성 값 배열
 */
function calculateVolatilityBatch(
  prices: number[],
  startIndex: number,
  endIndex: number
): (number | null)[] {
  const period = VOLATILITY_PERIOD;
  const results: (number | null)[] = [];

  for (let i = startIndex; i <= endIndex; i++) {
    if (i < period || i >= prices.length) {
      results.push(null);
      continue;
    }

    // 일별 수익률 계산
    const returns: Decimal[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      const prevPrice = prices[j - 1];
      if (prevPrice === 0) continue;

      const dailyReturn = new Decimal(prices[j]).sub(prevPrice).div(prevPrice);
      returns.push(dailyReturn);
    }

    if (returns.length <= 1) {
      results.push(0);
      continue;
    }

    // 평균 수익률
    const sum = returns.reduce((acc, r) => acc.add(r), new Decimal(0));
    const mean = sum.div(returns.length);

    // 표본 분산 (n-1)
    const squaredDiffs = returns.map((r) => r.sub(mean).pow(2));
    const variance = squaredDiffs
      .reduce((acc, d) => acc.add(d), new Decimal(0))
      .div(returns.length - 1);

    // 표본 표준편차 × √20
    const stddev = variance.sqrt();
    const annualized = stddev.mul(new Decimal(20).sqrt());

    results.push(annualized.toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber());
  }

  return results;
}

/**
 * 배치 기술적 지표 계산
 * 기존 calculateTechnicalMetrics와 동일한 결과를 배치로 계산
 *
 * @param prices - adjClose 가격 배열
 * @param dates - 날짜 배열
 * @param ticker - 티커 심볼
 * @param startIndex - 시작 인덱스 (최소 59)
 * @param endIndex - 끝 인덱스
 * @returns DailyMetricRow 배열
 */
export function calculateMetricsBatch(
  prices: number[],
  dates: string[],
  ticker: string,
  startIndex: number,
  endIndex: number
): DailyMetricRow[] {
  // 최소 인덱스 보정 (MA60 요구사항)
  const effectiveStartIndex = Math.max(startIndex, 59);

  if (effectiveStartIndex > endIndex || prices.length === 0) {
    return [];
  }

  // 배치 계산
  const ma20Values = calculateSMABatch(prices, 20, effectiveStartIndex, endIndex);
  const ma60Values = calculateSMABatch(prices, 60, effectiveStartIndex, endIndex);
  const ma20PastValues = calculateSMABatch(
    prices,
    20,
    effectiveStartIndex - MA_SLOPE_LOOKBACK,
    endIndex - MA_SLOPE_LOOKBACK
  );
  const rsiValues = calculateRSIBatch(prices, effectiveStartIndex, endIndex);
  const rocValues = calculateROCBatch(prices, effectiveStartIndex, endIndex);
  const volatilityValues = calculateVolatilityBatch(prices, effectiveStartIndex, endIndex);

  const results: DailyMetricRow[] = [];

  for (let i = effectiveStartIndex; i <= endIndex; i++) {
    const arrayIndex = i - effectiveStartIndex;

    const ma20 = ma20Values[arrayIndex];
    const ma60 = ma60Values[arrayIndex];
    const ma20Past = ma20PastValues[arrayIndex];
    const rsi14 = rsiValues[arrayIndex];
    const roc12 = rocValues[arrayIndex];
    const volatility20 = volatilityValues[arrayIndex];

    // MA60이 null이거나 0이면 스킵 (원본 로직과 동일)
    if (ma60 === null || ma60 === 0) {
      continue;
    }

    // RSI, ROC, Volatility 중 하나라도 null이면 스킵
    if (rsi14 === null || roc12 === null || volatility20 === null) {
      continue;
    }

    // 골든크로스: (MA20 - MA60) / MA60 × 100
    let goldenCross: number | null = null;
    if (ma20 !== null) {
      goldenCross = floorToDecimal(((ma20 - ma60) / ma60) * 100, 4);
    }

    // 정배열 여부
    const isGoldenCross = ma20 !== null && ma20 > ma60;

    // MA 기울기: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100
    let maSlope: number | null = null;
    if (ma20 !== null && ma20Past !== null && ma20Past !== 0) {
      maSlope = floorToDecimal(((ma20 - ma20Past) / ma20Past) * 100, 4);
    }

    // 이격도: (adjClose - MA20) / MA20 × 100
    let disparity: number | null = null;
    if (ma20 !== null && ma20 !== 0) {
      disparity = floorToDecimal(((prices[i] - ma20) / ma20) * 100, 4);
    }

    results.push({
      ticker,
      date: dates[i],
      ma20,
      ma60,
      maSlope: maSlope ?? 0,
      disparity: disparity ?? 0,
      rsi14,
      roc12,
      volatility20,
      goldenCross: goldenCross ?? 0,
      isGoldenCross,
    });
  }

  return results;
}

/**
 * 지표 계산 결과 검증
 * 배치 계산 결과와 개별 계산 결과 비교
 *
 * @param batchResult - 배치 계산 결과
 * @param prices - 가격 배열
 * @param tolerance - 허용 오차 (기본 1e-6)
 * @returns 검증 통과 여부와 실패 항목
 */
export async function verifyMetrics(
  batchResult: DailyMetricRow[],
  prices: number[],
  dates: string[],
  tolerance: number = 1e-6
): Promise<{ passed: boolean; failures: string[] }> {
  // 동적 import로 순환 참조 방지
  const { calculateTechnicalMetrics } = await import("@/backtest/metrics");

  const failures: string[] = [];

  for (const metric of batchResult) {
    const dateIndex = dates.indexOf(metric.date);
    if (dateIndex === -1) {
      failures.push(`Date not found: ${metric.date}`);
      continue;
    }

    const legacy = calculateTechnicalMetrics(prices, dateIndex);
    if (legacy === null) {
      failures.push(`Legacy returned null for date: ${metric.date}`);
      continue;
    }

    // 각 필드 비교
    const fields = ["maSlope", "disparity", "rsi14", "roc12", "volatility20"] as const;
    for (const field of fields) {
      const batchValue = metric[field];
      const legacyValue = legacy[field];

      if (batchValue !== null && legacyValue !== null) {
        const diff = Math.abs(batchValue - legacyValue);
        if (diff > tolerance) {
          failures.push(
            `${metric.date} ${field}: batch=${batchValue}, legacy=${legacyValue}, diff=${diff}`
          );
        }
      }
    }

    // isGoldenCross 비교
    if (metric.isGoldenCross !== legacy.isGoldenCross) {
      failures.push(
        `${metric.date} isGoldenCross: batch=${metric.isGoldenCross}, legacy=${legacy.isGoldenCross}`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
