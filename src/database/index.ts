import Database from "better-sqlite3";
import path from "path";

import type { DailyMetricRow, DailyPrice, QueryOptions } from "@/types";
import {
  CREATE_DAILY_METRICS_TABLE,
  CREATE_DAILY_PRICES_TABLE,
  CREATE_METRICS_INDEX,
  CREATE_TICKER_DATE_INDEX,
  CREATE_RECOMMENDATION_CACHE_TABLE,
  CREATE_RECOMMENDATION_CACHE_INDEX,
  CREATE_USERS_TABLE,
  CREATE_ACCOUNTS_TABLE,
  CREATE_SESSIONS_TABLE,
  CREATE_USERS_EMAIL_INDEX,
  CREATE_ACCOUNTS_USER_INDEX,
  CREATE_SESSIONS_USER_INDEX,
  INSERT_DAILY_METRIC,
  INSERT_DAILY_PRICE,
  INSERT_RECOMMENDATION_CACHE,
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
  SELECT_RECOMMENDATION_BY_DATE,
  SELECT_RECOMMENDATION_COUNT,
  CREATE_TRADING_ACCOUNTS_TABLE,
  CREATE_TRADING_ACCOUNTS_USER_INDEX,
  CREATE_TIER_HOLDINGS_TABLE,
  CREATE_TIER_HOLDINGS_ACCOUNT_INDEX,
  CREATE_DAILY_ORDERS_TABLE,
  CREATE_DAILY_ORDERS_ACCOUNT_DATE_INDEX,
} from "./schema";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "prices.db");

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
  database.exec(CREATE_RECOMMENDATION_CACHE_TABLE);
  database.exec(CREATE_RECOMMENDATION_CACHE_INDEX);
  // Auth.js 테이블
  database.exec(CREATE_USERS_TABLE);
  database.exec(CREATE_ACCOUNTS_TABLE);
  database.exec(CREATE_SESSIONS_TABLE);
  database.exec(CREATE_USERS_EMAIL_INDEX);
  database.exec(CREATE_ACCOUNTS_USER_INDEX);
  database.exec(CREATE_SESSIONS_USER_INDEX);
  // Trading 테이블
  database.exec(CREATE_TRADING_ACCOUNTS_TABLE);
  database.exec(CREATE_TRADING_ACCOUNTS_USER_INDEX);
  database.exec(CREATE_TIER_HOLDINGS_TABLE);
  database.exec(CREATE_TIER_HOLDINGS_ACCOUNT_INDEX);
  database.exec(CREATE_DAILY_ORDERS_TABLE);
  database.exec(CREATE_DAILY_ORDERS_ACCOUNT_DATE_INDEX);
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

// =====================================================
// recommendation_cache CRUD 함수 (백테스트 추천 성능 개선)
// =====================================================

/** 추천 캐시 row 타입 */
export interface RecommendationCacheRow {
  ticker: string;
  date: string;
  strategy: string;
  reason: string | null;
  rsi14: number | null;
  isGoldenCross: boolean;
  maSlope: number | null;
  disparity: number | null;
  roc12: number | null;
  volatility20: number | null;
  goldenCross: number | null;
}

/** SQLite에서 조회된 추천 캐시 row 타입 (boolean이 INTEGER로 저장됨) */
type RecommendationCacheRowFromDb = Omit<RecommendationCacheRow, "isGoldenCross"> & {
  isGoldenCross: number;
};

/**
 * 추천 캐시에서 특정 날짜의 추천 조회
 */
export function getRecommendationFromCache(
  ticker: string,
  date: string
): RecommendationCacheRow | null {
  const database = getConnection();
  const stmt = database.prepare(SELECT_RECOMMENDATION_BY_DATE);
  const row = stmt.get(ticker, date) as RecommendationCacheRowFromDb | undefined;

  if (!row) return null;

  return {
    ...row,
    isGoldenCross: row.isGoldenCross === 1,
  };
}

/**
 * 추천 결과를 캐시에 저장
 */
export function saveRecommendationToCache(
  ticker: string,
  date: string,
  strategy: string,
  reason: string | null,
  metrics: {
    rsi14?: number;
    isGoldenCross?: boolean;
    maSlope?: number;
    disparity?: number;
    roc12?: number;
    volatility20?: number;
    goldenCross?: number;
  }
): void {
  const database = getConnection();
  const stmt = database.prepare(INSERT_RECOMMENDATION_CACHE);
  stmt.run(
    ticker,
    date,
    strategy,
    reason,
    metrics.rsi14 ?? null,
    metrics.isGoldenCross ? 1 : 0,
    metrics.maSlope ?? null,
    metrics.disparity ?? null,
    metrics.roc12 ?? null,
    metrics.volatility20 ?? null,
    metrics.goldenCross ?? null
  );
}

/** 벌크 저장용 추천 캐시 아이템 */
export interface RecommendationCacheItem {
  ticker: string;
  date: string;
  strategy: string;
  reason: string | null;
  metrics: {
    rsi14?: number;
    isGoldenCross?: boolean;
    maSlope?: number;
    disparity?: number;
    roc12?: number;
    volatility20?: number;
    goldenCross?: number;
  };
}

/**
 * 여러 추천 결과를 캐시에 일괄 저장 (트랜잭션)
 */
export function bulkSaveRecommendations(items: RecommendationCacheItem[]): number {
  const database = getConnection();
  const stmt = database.prepare(INSERT_RECOMMENDATION_CACHE);

  const insertMany = database.transaction((cacheItems: RecommendationCacheItem[]) => {
    for (const item of cacheItems) {
      stmt.run(
        item.ticker,
        item.date,
        item.strategy,
        item.reason,
        item.metrics.rsi14 ?? null,
        item.metrics.isGoldenCross ? 1 : 0,
        item.metrics.maSlope ?? null,
        item.metrics.disparity ?? null,
        item.metrics.roc12 ?? null,
        item.metrics.volatility20 ?? null,
        item.metrics.goldenCross ?? null
      );
    }
  });

  insertMany(items);
  return items.length;
}

/**
 * 특정 티커의 캐시된 추천 데이터 수 조회
 */
export function getRecommendationCacheCount(ticker: string = DEFAULT_TICKER): number {
  const database = getConnection();
  const stmt = database.prepare(SELECT_RECOMMENDATION_COUNT);
  const result = stmt.get(ticker) as { count: number };
  return result.count;
}
