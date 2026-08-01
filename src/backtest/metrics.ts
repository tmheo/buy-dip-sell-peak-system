/**
 * 성과 지표 계산 함수
 * SPEC-BACKTEST-001 REQ-009
 *
 * 기술적 지표 계산은 src/metrics가 소유한다 (#70, #73).
 * 여기에는 백테스트 결과의 소유물인 성과 지표(수익률, MDD, 승률, CAGR)와
 * 기준일 종합 지표의 결측 정책을 결정하는 어댑터(calculateTechnicalMetrics)만 남는다.
 */
import Decimal from "decimal.js";
import { computeIndicatorsAt } from "@/metrics";
import type { DailySnapshot, TechnicalMetrics } from "./types";
import { floorToDecimal, roundToDecimal } from "@/utils/decimal";

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
 * 기준일 종합 기술적 지표 (백테스트·추천의 결측 정책 어댑터)
 * SPEC-METRICS-001
 *
 * 계산은 src/metrics 코어(null 보존)가 소유하고, 여기는 정책만 결정한다:
 * - 필수 지표(ma60·goldenCross·disparity·rsi14·roc12·volatility20)가 계산 불가능하면
 *   전체를 null로 반환한다 (CON-001, CON-002)
 * - maSlope가 계산 불가능하면 0으로 치환한다
 * - 백테스트 기간이 60일 미만이면 goldenCross를 NaN으로 만든다 (원본 사이트 방식)
 *
 * @param prices - 가격 배열 (adjClose 값들)
 * @param index - 계산할 인덱스
 * @param backtestDays - 백테스트 기간 내 거래일 수 (정배열 NaN 처리용, 선택)
 * @returns TechnicalMetrics 객체 또는 데이터 부족 시 null
 */
export function calculateTechnicalMetrics(
  prices: number[],
  index: number,
  backtestDays?: number
): TechnicalMetrics | null {
  const row = computeIndicatorsAt(prices, index);

  if (row.ma60 === null || row.ma60 === 0) return null;
  if (row.goldenCross === null || row.isGoldenCross === null || row.disparity === null) {
    return null;
  }
  if (row.rsi14 === null || row.roc12 === null || row.volatility20 === null) return null;

  return {
    goldenCross: backtestDays !== undefined && backtestDays < 60 ? NaN : row.goldenCross,
    isGoldenCross: row.isGoldenCross,
    maSlope: row.maSlope ?? 0,
    disparity: row.disparity,
    rsi14: row.rsi14,
    roc12: row.roc12,
    volatility20: row.volatility20,
  };
}
