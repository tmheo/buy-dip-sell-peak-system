import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

import type { DailyMetricRow, DailyPrice, QueryOptions } from "@/types";
import {
  CREATE_DAILY_METRICS_TABLE,
  CREATE_DAILY_PRICES_TABLE,
  CREATE_METRICS_INDEX,
  CREATE_TICKER_DATE_INDEX,
  INSERT_DAILY_METRIC,
  INSERT_DAILY_PRICE,
  SELECT_ALL_PRICES,
  SELECT_ALL_PRICES_BY_TICKER,
  SELECT_COUNT,
  SELECT_LATEST_DATE,
  SELECT_LATEST_METRIC_DATE,
  SELECT_LATEST_PRICES,
  SELECT_METRICS_BY_DATE_RANGE,
  SELECT_METRICS_COUNT,
  SELECT_PRICES_BY_DATE_RANGE,
  SELECT_TOTAL_COUNT,
} from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../data/prices.db");

const DEFAULT_TICKER = "SOXL";

let db: Database.Database | null = null;

/**
 * 데이터베이스 연결 (싱글톤)
 */
function getConnection(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

/**
 * 데이터베이스 연결 종료
 */
export function close(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 테이블 초기화
 */
export function initTables(): void {
  const database = getConnection();
  database.exec(CREATE_DAILY_PRICES_TABLE);
  database.exec(CREATE_TICKER_DATE_INDEX);
  database.exec(CREATE_DAILY_METRICS_TABLE);
  database.exec(CREATE_METRICS_INDEX);
  console.log("데이터베이스 테이블 초기화 완료");
}

/**
 * 단일 가격 데이터 삽입
 */
export function insertPrice(price: DailyPrice, ticker: string = DEFAULT_TICKER): void {
  const database = getConnection();
  const stmt = database.prepare(INSERT_DAILY_PRICE);
  stmt.run(
    ticker,
    price.date,
    price.open,
    price.high,
    price.low,
    price.close,
    price.adjClose,
    price.volume
  );
}

/**
 * 여러 가격 데이터 일괄 삽입 (트랜잭션)
 */
export function insertPrices(prices: DailyPrice[], ticker: string = DEFAULT_TICKER): number {
  const database = getConnection();
  const stmt = database.prepare(INSERT_DAILY_PRICE);

  const insertMany = database.transaction((items: DailyPrice[]) => {
    for (const price of items) {
      stmt.run(
        ticker,
        price.date,
        price.open,
        price.high,
        price.low,
        price.close,
        price.adjClose,
        price.volume
      );
    }
  });

  insertMany(prices);
  return prices.length;
}

/**
 * 모든 가격 데이터 조회 (전체 티커)
 */
export function getAllPrices(): DailyPrice[] {
  const database = getConnection();
  const stmt = database.prepare(SELECT_ALL_PRICES);
  return stmt.all() as DailyPrice[];
}

/**
 * 특정 티커의 모든 가격 데이터 조회
 */
export function getAllPricesByTicker(ticker: string = DEFAULT_TICKER): DailyPrice[] {
  const database = getConnection();
  const stmt = database.prepare(SELECT_ALL_PRICES_BY_TICKER);
  return stmt.all(ticker) as DailyPrice[];
}

/**
 * 날짜 범위로 가격 데이터 조회
 */
export function getPricesByDateRange(
  options: QueryOptions,
  ticker: string = DEFAULT_TICKER
): DailyPrice[] {
  if (options.startDate && options.endDate) {
    const database = getConnection();
    const stmt = database.prepare(SELECT_PRICES_BY_DATE_RANGE);
    return stmt.all(ticker, options.startDate, options.endDate) as DailyPrice[];
  }

  return getAllPricesByTicker(ticker);
}

/**
 * 가장 최근 저장된 날짜 조회
 */
export function getLatestDate(ticker: string = DEFAULT_TICKER): string | null {
  const database = getConnection();
  const stmt = database.prepare(SELECT_LATEST_DATE);
  const result = stmt.get(ticker) as { date: string } | undefined;
  return result?.date ?? null;
}

/**
 * 특정 티커의 저장된 데이터 수 조회
 */
export function getCount(ticker: string = DEFAULT_TICKER): number {
  const database = getConnection();
  const stmt = database.prepare(SELECT_COUNT);
  const result = stmt.get(ticker) as { count: number };
  return result.count;
}

/**
 * 전체 데이터 수 조회
 */
export function getTotalCount(): number {
  const database = getConnection();
  const stmt = database.prepare(SELECT_TOTAL_COUNT);
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * 최근 N일 가격 데이터 조회 (날짜 내림차순)
 */
export function getLatestPrices(
  limit: number,
  ticker: string = DEFAULT_TICKER
): { date: string; adjClose: number }[] {
  const database = getConnection();
  const stmt = database.prepare(SELECT_LATEST_PRICES);
  return stmt.all(ticker, limit) as { date: string; adjClose: number }[];
}

// =====================================================
// daily_metrics CRUD 함수 (SPEC-PERFORMANCE-001)
// =====================================================

/**
 * 여러 기술적 지표 데이터 일괄 삽입 (트랜잭션)
 */
export function insertMetrics(metrics: DailyMetricRow[], ticker: string = DEFAULT_TICKER): number {
  const database = getConnection();
  const stmt = database.prepare(INSERT_DAILY_METRIC);

  const insertMany = database.transaction((items: DailyMetricRow[]) => {
    for (const metric of items) {
      stmt.run(
        ticker,
        metric.date,
        metric.ma20,
        metric.ma60,
        metric.maSlope,
        metric.disparity,
        metric.rsi14,
        metric.roc12,
        metric.volatility20,
        metric.goldenCross,
        metric.isGoldenCross ? 1 : 0
      );
    }
  });

  insertMany(metrics);
  return metrics.length;
}

/**
 * 기술적 지표 UPSERT (기존 데이터 갱신)
 */
export function upsertMetrics(metrics: DailyMetricRow[], ticker: string = DEFAULT_TICKER): number {
  // INSERT OR REPLACE를 사용하므로 insertMetrics와 동일
  return insertMetrics(metrics, ticker);
}

/** SQLite에서 조회된 지표 row 타입 (boolean이 INTEGER로 저장됨) */
type MetricRowFromDb = Omit<DailyMetricRow, "isGoldenCross"> & { isGoldenCross: number };

/**
 * 날짜 범위로 기술적 지표 조회
 */
export function getMetricsByDateRange(
  options: QueryOptions,
  ticker: string = DEFAULT_TICKER
): DailyMetricRow[] {
  if (!options.startDate || !options.endDate) {
    return [];
  }

  const database = getConnection();
  const stmt = database.prepare(SELECT_METRICS_BY_DATE_RANGE);
  const rows = stmt.all(ticker, options.startDate, options.endDate) as MetricRowFromDb[];

  // SQLite는 boolean을 INTEGER로 저장하므로 변환 필요
  return rows.map((row) => ({
    ...row,
    isGoldenCross: row.isGoldenCross === 1,
  }));
}

/**
 * 가장 최근 저장된 지표 날짜 조회
 */
export function getLatestMetricDate(ticker: string = DEFAULT_TICKER): string | null {
  const database = getConnection();
  const stmt = database.prepare(SELECT_LATEST_METRIC_DATE);
  const result = stmt.get(ticker) as { date: string } | undefined;
  return result?.date ?? null;
}

/**
 * 특정 티커의 저장된 지표 데이터 수 조회
 */
export function getMetricsCount(ticker: string = DEFAULT_TICKER): number {
  const database = getConnection();
  const stmt = database.prepare(SELECT_METRICS_COUNT);
  const result = stmt.get(ticker) as { count: number };
  return result.count;
}
