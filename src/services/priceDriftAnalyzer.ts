/**
 * 가격 시계열 불일치(drift) 분석기
 * 이슈 #42: 증분 적재 구조상 배당락일마다 adjClose 시계열에 쌓인 불연속의 규모 측정
 *
 * DB에 저장된 시계열과 Yahoo Finance에서 새로 내려받은 전체 히스토리(재수집본)를
 * 날짜별로 대조한다. 양쪽 값 모두 normalizePrice 관례(소수점 2자리, ROUND_HALF_UP)로
 * 정규화한 뒤 비교해, DB real(float4) 컬럼의 표현 오차나 다운로드 정밀도 차이가
 * 불일치로 잡히지 않게 한다.
 */

import { normalizePrice } from "./dataFetcher.js";

import type { DailyPrice } from "../types/index.js";

const PRICE_COLUMNS = ["open", "high", "low", "close", "adjClose"] as const;

export type PriceColumn = (typeof PRICE_COLUMNS)[number];

/** 날짜가 같은 DB 행과 재수집본 행의 쌍 */
interface ComparedPair {
  dbRow: DailyPrice;
  fetchedRow: DailyPrice;
}

/** 컬럼별 불일치 통계 (상대 오차 기준값은 재수집본) */
export interface ColumnDriftStats {
  column: PriceColumn;
  comparedCount: number;
  mismatchCount: number;
  mismatchRatio: number;
  maxRelativeError: number;
  meanRelativeError: number;
  mismatchDates: string[];
}

/**
 * 비율(DB/재수집본)이 비슷한 adjClose 불일치 행의 묶음.
 * startDate가 새 드리프트 수준이 시작되는 날짜 경계다.
 * 드리프트가 반올림 한계 아래로 내려가 일치한 행은 세그먼트를 끊지 않으므로
 * rowCount가 날짜 범위의 거래일 수보다 작을 수 있다.
 */
export interface DriftSegment {
  startDate: string;
  endDate: string;
  rowCount: number;
  /** Σ(DB 값)/Σ(재수집본 값). 반올림 잡음에 강건한 배당 미반영 누적 배율 추정치 */
  meanRatio: number;
  meanRelativeError: number;
}

export interface DriftReport {
  comparedCount: number;
  dbOnlyDates: string[];
  fetchedOnlyDates: string[];
  columns: ColumnDriftStats[];
  adjCloseSegments: DriftSegment[];
}

// 세그먼트 분리 기준: 구간 누적 비율에서 이 허용치 넘게 벗어나면 새 배당 경계로 본다.
// 양쪽 값 모두 소수점 2자리로 반올림되므로 행 하나의 비율은 최대 ±0.01/가격 수준으로
// 흔들린다. 저가 구간에서 이 잡음이 배당 조정 배율보다 커지므로 가격에 반비례하는
// 허용치(여유분 포함 0.015/가격)를 두되, 고가 구간에서는 0.1%를 하한으로 유지한다.
const SEGMENT_RATIO_TOLERANCE_FLOOR = 0.001;
const SEGMENT_QUANTIZATION_FACTOR = 0.015;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function relativeError(dbValue: number, fetchedValue: number): number {
  return Math.abs(dbValue - fetchedValue) / Math.abs(fetchedValue);
}

/**
 * DB 시계열과 재수집본을 날짜별로 대조해 불일치 규모를 보고한다.
 * @param dbPrices - DB에 저장된 가격 행 (getAllPricesByTicker 결과)
 * @param fetchedPrices - Yahoo Finance에서 새로 내려받은 전체 히스토리 (fetchAllHistory 결과)
 */
export function analyzePriceDrift(
  dbPrices: DailyPrice[],
  fetchedPrices: DailyPrice[]
): DriftReport {
  const fetchedByDate = new Map(fetchedPrices.map((row) => [row.date, row]));
  const dbDates = new Set(dbPrices.map((row) => row.date));

  const comparedPairs: ComparedPair[] = dbPrices
    .filter((row) => fetchedByDate.has(row.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((dbRow) => ({ dbRow, fetchedRow: fetchedByDate.get(dbRow.date)! }));

  const dbOnlyDates = dbPrices
    .map((row) => row.date)
    .filter((date) => !fetchedByDate.has(date))
    .sort();
  const fetchedOnlyDates = fetchedPrices
    .map((row) => row.date)
    .filter((date) => !dbDates.has(date))
    .sort();

  const columns = PRICE_COLUMNS.map((column) => {
    const relativeErrors: number[] = [];
    const mismatchDates: string[] = [];

    for (const { dbRow, fetchedRow } of comparedPairs) {
      const dbValue = normalizePrice(dbRow[column]);
      const fetchedValue = normalizePrice(fetchedRow[column]);
      if (dbValue !== fetchedValue) {
        relativeErrors.push(relativeError(dbValue, fetchedValue));
        mismatchDates.push(dbRow.date);
      }
    }

    return {
      column,
      comparedCount: comparedPairs.length,
      mismatchCount: relativeErrors.length,
      mismatchRatio: comparedPairs.length === 0 ? 0 : relativeErrors.length / comparedPairs.length,
      maxRelativeError: relativeErrors.length === 0 ? 0 : Math.max(...relativeErrors),
      meanRelativeError: mean(relativeErrors),
      mismatchDates,
    };
  });

  return {
    comparedCount: comparedPairs.length,
    dbOnlyDates,
    fetchedOnlyDates,
    columns,
    adjCloseSegments: buildAdjCloseSegments(comparedPairs),
  };
}

/**
 * adjClose 불일치 행을 비율(DB/재수집본)이 안정된 구간 단위로 묶는다.
 * 비율이 허용치 넘게 바뀌는 지점(세그먼트 시작 날짜)이 배당락일 후보 경계다.
 * 일치한 행은 드리프트가 반올림 한계 아래인 것으로 보고 세그먼트를 끊지 않는다.
 */
function buildAdjCloseSegments(comparedPairs: ComparedPair[]): DriftSegment[] {
  const segments: DriftSegment[] = [];
  let current: {
    dates: string[];
    dbSum: number;
    fetchedSum: number;
    relativeErrors: number[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    segments.push({
      startDate: current.dates[0],
      endDate: current.dates[current.dates.length - 1],
      rowCount: current.dates.length,
      meanRatio: current.dbSum / current.fetchedSum,
      meanRelativeError: mean(current.relativeErrors),
    });
    current = null;
  };

  for (const { dbRow, fetchedRow } of comparedPairs) {
    const dbValue = normalizePrice(dbRow.adjClose);
    const fetchedValue = normalizePrice(fetchedRow.adjClose);
    if (dbValue === fetchedValue) continue;

    const ratio = dbValue / fetchedValue;
    if (current) {
      const segmentRatio = current.dbSum / current.fetchedSum;
      const tolerance = Math.max(
        SEGMENT_RATIO_TOLERANCE_FLOOR,
        SEGMENT_QUANTIZATION_FACTOR / fetchedValue
      );
      if (Math.abs(ratio - segmentRatio) > tolerance) flush();
    }

    current ??= { dates: [], dbSum: 0, fetchedSum: 0, relativeErrors: [] };
    current.dates.push(dbRow.date);
    current.dbSum += dbValue;
    current.fetchedSum += fetchedValue;
    current.relativeErrors.push(relativeError(dbValue, fetchedValue));
  }

  flush();
  return segments;
}
