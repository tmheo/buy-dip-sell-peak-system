/**
 * DB 지표 행 변환 어댑터 (#70, #73)
 *
 * 지표 계산은 src/metrics 코어(null 보존)가 소유하고, daily_metrics 적재 정책은
 * 여기가 소유한다: 필수 지표(ma60·rsi14·roc12·volatility20)가 null이거나 ma60이 0인
 * 날은 행을 버리고, 파생 지표(maSlope·disparity·goldenCross)의 null은 0으로 치환한다.
 * DB에 쓰이는 내용은 구 배치 계산(metricsCalculator)과 동일하다.
 */
import { computeIndicatorSeries } from "@/metrics";
import type { DailyMetricRow } from "@/types";

/** MA60 계산에 필요한 최소 인덱스 */
const MA60_MIN_INDEX = 59;

/**
 * 가격 시계열로부터 daily_metrics 적재용 행을 만든다
 *
 * @param prices - adjClose 가격 배열
 * @param dates - 날짜 배열 (prices와 같은 인덱스)
 * @param ticker - 티커 심볼
 * @param startIndex - 시작 인덱스 (59 미만이면 59로 보정)
 * @param endIndex - 끝 인덱스
 * @returns 결측 정책이 적용된 DailyMetricRow 배열
 */
export function buildDailyMetricRows(
  prices: number[],
  dates: string[],
  ticker: string,
  startIndex: number,
  endIndex: number
): DailyMetricRow[] {
  const effectiveStartIndex = Math.max(startIndex, MA60_MIN_INDEX);
  if (effectiveStartIndex > endIndex || prices.length === 0) {
    return [];
  }

  const indicatorRows = computeIndicatorSeries(prices, effectiveStartIndex, endIndex);
  const results: DailyMetricRow[] = [];

  for (const [offset, row] of indicatorRows.entries()) {
    const index = effectiveStartIndex + offset;

    // 행 스킵: 필수 지표가 없는 날은 적재하지 않는다
    if (row.ma60 === null || row.ma60 === 0) continue;
    if (row.rsi14 === null || row.roc12 === null || row.volatility20 === null) continue;

    results.push({
      ticker,
      date: dates[index],
      ma20: row.ma20,
      ma60: row.ma60,
      maSlope: row.maSlope ?? 0,
      disparity: row.disparity ?? 0,
      rsi14: row.rsi14,
      roc12: row.roc12,
      volatility20: row.volatility20,
      goldenCross: row.goldenCross ?? 0,
      isGoldenCross: row.isGoldenCross ?? false,
    });
  }

  return results;
}
