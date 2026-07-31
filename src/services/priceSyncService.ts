/**
 * 가격 시계열 동기화 서비스 (이슈 #42, ADR-0002)
 *
 * 일일 동기화의 유일한 경로: Yahoo 전체 히스토리 재페치 → 분할 가드 →
 * 신규·변경 행만 가격 upsert → 지표 전체 재계산.
 * 배당 등 원천의 adjClose 소급 조정을 매일 자동 흡수해 시계열 연속성 불변식을 지킨다.
 *
 * 분할 가드: close가 행 단위 5% 초과로 소급 변경되면 분할로 의심하고 해당 티커의
 * 모든 쓰기(가격·지표)를 건너뛴다. 보정은 SPEC-SPLIT-001 런북(사람)이 수행한다.
 */

import { fetchAllHistory, normalizePrice } from "@/services/dataFetcher";
import { getAllPricesByTicker, upsertDailyPrices } from "@/database/prices";
import { upsertMetrics } from "@/database/metrics";
import { calculateMetricsBatch } from "@/services/metricsCalculator";

import type { SupportedTicker } from "@/services/dataFetcher";
import type { NewDailyMetric } from "@/database/schema/index";
import type { DailyMetricRow, DailyPrice } from "@/types/index";

/** 분할 가드 임계값: 기존 close 대비 소급 변경 비율이 이 값을 넘으면 쓰기를 중단한다 */
export const CLOSE_GUARD_THRESHOLD = 0.05;

/** MA60 계산에 필요한 최소 데이터 인덱스 (60일 이동평균 기준) */
const MA60_MIN_INDEX = 59;

/**
 * 전체 히스토리 페치 재시도 설정.
 * 재시도는 페치 단계에만 둔다 - DB 쓰기 이후를 통째로 재시도하면 2회차 diff가
 * 0건이 되어 요약 수치가 왜곡되고, Vercel 60초 예산 안에서 전체 페치가 반복된다.
 * (rate limit 재시도는 fetchAllHistory 내부에 별도로 있다)
 */
const FETCH_MAX_ATTEMPTS = 3;
const FETCH_RETRY_BASE_DELAY_MS = 1000;

const PRICE_COLUMNS = ["open", "high", "low", "close", "adjClose", "volume"] as const;

export type PriceColumn = (typeof PRICE_COLUMNS)[number];

/** 분할 가드 위반 행: 기존 close 대비 5% 초과로 소급 변경된 날짜 */
export interface CloseGuardViolation {
  date: string;
  dbClose: number;
  fetchedClose: number;
  /** |재수집본 close / DB close - 1| */
  changeRatio: number;
}

/** DB 시계열과 원천 스냅샷의 날짜별 대조 결과 */
export interface PriceSnapshotDiff {
  /** DB에 없는 날짜의 재수집본 행 */
  newRows: DailyPrice[];
  /** 값이 하나라도 달라진 날짜의 재수집본 행 (upsert 시 이 값이 DB를 덮어쓴다) */
  changedRows: DailyPrice[];
  changedColumnCounts: Record<PriceColumn, number>;
  /** 재수집본에 없는 DB 날짜 (원천 이상 신호, 삭제하지 않고 보고만 한다) */
  dbOnlyDates: string[];
  guardViolations: CloseGuardViolation[];
}

export interface TickerSyncSummary {
  ticker: SupportedTicker;
  /** guard-triggered면 이 티커에 어떤 쓰기도 없었으므로 호출자가 실패로 보고해야 한다 */
  status: "synced" | "guard-triggered";
  guardViolations: CloseGuardViolation[];
  fetchedRows: number;
  newPriceRows: number;
  changedPriceRows: number;
  changedColumns: Record<PriceColumn, number>;
  dbOnlyDates: string[];
  upsertedMetrics: number;
}

export interface SyncOptions {
  /**
   * 분할 런북(SPEC-SPLIT-001) 전용: 가드 위반을 보고만 하고 쓰기를 진행한다.
   * 크론 등 자동 경로에서는 절대 사용하지 않는다.
   */
  bypassCloseGuard?: boolean;
}

/** volume은 정수라 정규화 없이, 가격 컬럼은 소수점 2자리 정규화 후 비교한다 */
function columnValue(row: DailyPrice, column: PriceColumn): number {
  return column === "volume" ? row[column] : normalizePrice(row[column]);
}

/**
 * DB 시계열과 원천 스냅샷을 날짜별로 대조해 신규·변경·가드 위반을 분류한다.
 * 양쪽 가격을 normalizePrice 관례(소수점 2자리, ROUND_HALF_UP)로 정규화해
 * DB real(float4) 표현 오차가 변경으로 잡히지 않게 한다.
 */
export function diffPriceSnapshots(
  dbPrices: DailyPrice[],
  fetchedPrices: DailyPrice[]
): PriceSnapshotDiff {
  const dbByDate = new Map(dbPrices.map((row) => [row.date, row]));
  const fetchedDates = new Set(fetchedPrices.map((row) => row.date));

  const newRows: DailyPrice[] = [];
  const changedRows: DailyPrice[] = [];
  const changedColumnCounts = Object.fromEntries(PRICE_COLUMNS.map((c) => [c, 0])) as Record<
    PriceColumn,
    number
  >;
  const guardViolations: CloseGuardViolation[] = [];

  for (const fetchedRow of fetchedPrices) {
    const dbRow = dbByDate.get(fetchedRow.date);
    if (!dbRow) {
      newRows.push(fetchedRow);
      continue;
    }

    let changed = false;
    for (const column of PRICE_COLUMNS) {
      if (columnValue(dbRow, column) !== columnValue(fetchedRow, column)) {
        changedColumnCounts[column] += 1;
        changed = true;
      }
    }
    if (!changed) continue;

    changedRows.push(fetchedRow);

    const dbClose = normalizePrice(dbRow.close);
    const fetchedClose = normalizePrice(fetchedRow.close);
    const changeRatio = Math.abs(fetchedClose / dbClose - 1);
    if (changeRatio > CLOSE_GUARD_THRESHOLD) {
      guardViolations.push({ date: fetchedRow.date, dbClose, fetchedClose, changeRatio });
    }
  }

  const dbOnlyDates = dbPrices
    .map((row) => row.date)
    .filter((date) => !fetchedDates.has(date))
    .sort();

  return { newRows, changedRows, changedColumnCounts, dbOnlyDates, guardViolations };
}

/** DailyMetricRow 배열을 지표 upsert용 DB 행으로 변환 */
export function convertMetricsToRows(metrics: DailyMetricRow[], ticker: string): NewDailyMetric[] {
  return metrics.map((m) => ({
    ticker,
    date: m.date,
    ma20: m.ma20 ?? null,
    ma60: m.ma60 ?? null,
    maSlope: m.maSlope ?? null,
    disparity: m.disparity ?? null,
    rsi14: m.rsi14 ?? null,
    roc12: m.roc12 ?? null,
    volatility20: m.volatility20 ?? null,
    goldenCross: m.goldenCross ?? null,
    isGoldenCross: m.isGoldenCross ?? null,
  }));
}

/** 지수 백오프를 곁들인 전체 히스토리 페치 (일시적 네트워크 오류 대비) */
async function fetchAllHistoryWithRetry(ticker: SupportedTicker): Promise<DailyPrice[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchAllHistory(ticker);
    } catch (error) {
      if (attempt >= FETCH_MAX_ATTEMPTS) throw error;
      const delayMs = FETCH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[${ticker}] 페치 시도 ${attempt}/${FETCH_MAX_ATTEMPTS} 실패, ${delayMs}ms 후 재시도:`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * 티커 하나를 원천 스냅샷과 정합시킨다.
 * 가드 발동 시 어떤 쓰기도 없이 요약만 반환하므로, 호출자가 실패로 보고해야 한다.
 */
export async function syncTickerPrices(
  ticker: SupportedTicker,
  options: SyncOptions = {}
): Promise<TickerSyncSummary> {
  const fetched = await fetchAllHistoryWithRetry(ticker);
  if (fetched.length === 0) {
    throw new Error(`[${ticker}] Yahoo Finance가 빈 히스토리를 반환했습니다. 동기화 중단.`);
  }

  const dbPrices = await getAllPricesByTicker(ticker);
  const diff = diffPriceSnapshots(dbPrices, fetched);

  const base = {
    ticker,
    guardViolations: diff.guardViolations,
    fetchedRows: fetched.length,
    newPriceRows: diff.newRows.length,
    changedPriceRows: diff.changedRows.length,
    changedColumns: diff.changedColumnCounts,
    dbOnlyDates: diff.dbOnlyDates,
  };

  if (diff.guardViolations.length > 0 && !options.bypassCloseGuard) {
    console.error(
      `[${ticker}] 분할 가드 발동: close ${CLOSE_GUARD_THRESHOLD * 100}% 초과 소급 변경 ` +
        `${diff.guardViolations.length}건. 가격·지표 쓰기를 모두 건너뜁니다. ` +
        `(SPEC-SPLIT-001 런북으로 수동 대응)`
    );
    return { ...base, status: "guard-triggered", upsertedMetrics: 0 };
  }

  if (diff.guardViolations.length > 0) {
    console.warn(
      `[${ticker}] 가드 우회 모드: close 5% 초과 변경 ${diff.guardViolations.length}건을 덮어씁니다.`
    );
  }

  if (diff.dbOnlyDates.length > 0) {
    console.warn(
      `[${ticker}] 재수집본에 없는 DB 날짜 ${diff.dbOnlyDates.length}건 (유지됨): ` +
        diff.dbOnlyDates.slice(0, 5).join(", ")
    );
  }

  const rowsToWrite = [...diff.newRows, ...diff.changedRows];
  if (rowsToWrite.length > 0) {
    await upsertDailyPrices(
      rowsToWrite.map(({ date, open, high, low, close, adjClose, volume }) => ({
        ticker,
        date,
        open,
        high,
        low,
        close,
        adjClose,
        volume,
      }))
    );
  }
  console.log(
    `[${ticker}] 가격 정합 완료: 신규 ${diff.newRows.length}건, 변경 ${diff.changedRows.length}건, ` +
      `컬럼별 변경 ${JSON.stringify(diff.changedColumnCounts)}`
  );

  // 지표는 전체 구간을 매일 재계산해 소급 가격 변경과 같은 실행에서 수렴시킨다.
  // 재수집본에 없는 DB 날짜가 유지된 경우에는 upsert 후의 DB 시계열을 다시 읽어,
  // 지표가 가격 테이블과 같은 시계열 위에서 계산되게 한다.
  const seriesForMetrics =
    diff.dbOnlyDates.length > 0 ? await getAllPricesByTicker(ticker) : fetched;
  const metrics = calculateMetricsBatch(
    seriesForMetrics.map((p) => p.adjClose),
    seriesForMetrics.map((p) => p.date),
    ticker,
    MA60_MIN_INDEX,
    seriesForMetrics.length - 1
  );
  if (metrics.length > 0) {
    await upsertMetrics(convertMetricsToRows(metrics, ticker));
  }
  console.log(`[${ticker}] 지표 재계산 완료: ${metrics.length}건 upsert`);

  return { ...base, status: "synced", upsertedMetrics: metrics.length };
}
