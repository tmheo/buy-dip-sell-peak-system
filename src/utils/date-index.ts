/**
 * 날짜 시계열 인덱스 유틸리티
 */

/** 날짜(YYYY-MM-DD) → 배열 인덱스 맵 생성 (O(1) 날짜 조회용) */
export function buildDateToIndexMap(series: { date: string }[]): Map<string, number> {
  const dateToIndexMap = new Map<string, number>();
  for (let i = 0; i < series.length; i++) {
    dateToIndexMap.set(series[i].date, i);
  }
  return dateToIndexMap;
}
