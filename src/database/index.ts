import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

import type { DailyPrice, QueryOptions } from "../types/index.js";
import {
  CREATE_DAILY_PRICES_TABLE,
  CREATE_TICKER_DATE_INDEX,
  INSERT_DAILY_PRICE,
  SELECT_ALL_PRICES,
  SELECT_ALL_PRICES_BY_TICKER,
  SELECT_COUNT,
  SELECT_LATEST_DATE,
  SELECT_PRICES_BY_DATE_RANGE,
  SELECT_TOTAL_COUNT,
} from "./schema.js";

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
  console.log("데이터베이스 테이블 초기화 완료");
}

/**
 * 단일 가격 데이터 삽입
 */
export function insertPrice(price: DailyPrice, ticker: string = DEFAULT_TICKER): void {
  const database = getConnection();
  const stmt = database.prepare(INSERT_DAILY_PRICE);
  stmt.run(ticker, price.date, price.open, price.high, price.low, price.close, price.volume);
}

/**
 * 여러 가격 데이터 일괄 삽입 (트랜잭션)
 */
export function insertPrices(prices: DailyPrice[], ticker: string = DEFAULT_TICKER): number {
  const database = getConnection();
  const stmt = database.prepare(INSERT_DAILY_PRICE);

  const insertMany = database.transaction((items: DailyPrice[]) => {
    for (const price of items) {
      stmt.run(ticker, price.date, price.open, price.high, price.low, price.close, price.volume);
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
