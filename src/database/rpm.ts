/**
 * RPM 지표 데이터베이스 CRUD 함수
 * SPEC-RPM-EXPERIMENT-001 TASK-002
 *
 * 참고: better-sqlite3 동기 방식 사용 (기존 database/index.ts 패턴 준수)
 */
import Database from "better-sqlite3";
import path from "path";

import type { RpmIndicators, RpmIndicatorRecord } from "@/experiment/rpm/types";

// =====================================================
// Database Connection
// =====================================================

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "prices.db");

let db: Database.Database | null = null;

/**
 * 데이터베이스 연결 (싱글톤)
 */
function getConnection(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

// =====================================================
// Schema SQL
// =====================================================

export const CREATE_RPM_INDICATORS_TABLE = `
CREATE TABLE IF NOT EXISTS rpm_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL DEFAULT 'SOXL',
    date TEXT NOT NULL,
    rsi14 REAL NOT NULL,
    disparity20 REAL NOT NULL,
    roc10 REAL NOT NULL,
    macd_histogram REAL NOT NULL,
    bollinger_width REAL NOT NULL,
    atr_percent REAL NOT NULL,
    disparity60 REAL NOT NULL,
    stochastic_k REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
)
`;

export const CREATE_RPM_INDEX = `
CREATE INDEX IF NOT EXISTS idx_rpm_ticker_date ON rpm_indicators(ticker, date)
`;

// =====================================================
// SQL Statements
// =====================================================

const INSERT_RPM_INDICATOR = `
INSERT OR REPLACE INTO rpm_indicators (
    ticker, date, rsi14, disparity20, roc10, macd_histogram,
    bollinger_width, atr_percent, disparity60, stochastic_k
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_RPM_BY_DATE = `
SELECT id, ticker, date,
       rsi14, disparity20, roc10,
       macd_histogram as macdHistogram,
       bollinger_width as bollingerWidth,
       atr_percent as atrPercent,
       disparity60, stochastic_k as stochasticK,
       created_at as createdAt
FROM rpm_indicators
WHERE ticker = ? AND date = ?
`;

const SELECT_RPM_BY_DATE_RANGE = `
SELECT id, ticker, date,
       rsi14, disparity20, roc10,
       macd_histogram as macdHistogram,
       bollinger_width as bollingerWidth,
       atr_percent as atrPercent,
       disparity60, stochastic_k as stochasticK,
       created_at as createdAt
FROM rpm_indicators
WHERE ticker = ? AND date >= ? AND date <= ?
ORDER BY date ASC
`;

const SELECT_RPM_COUNT = `
SELECT COUNT(*) as count FROM rpm_indicators WHERE ticker = ?
`;

const SELECT_RPM_LATEST_DATE = `
SELECT date FROM rpm_indicators WHERE ticker = ? ORDER BY date DESC LIMIT 1
`;

const DELETE_RPM_BY_TICKER = `
DELETE FROM rpm_indicators WHERE ticker = ?
`;

// =====================================================
// CRUD Functions
// =====================================================

/**
 * RPM 지표 테이블 초기화
 */
export function initRpmTable(): void {
  const database = getConnection();
  database.exec(CREATE_RPM_INDICATORS_TABLE);
  database.exec(CREATE_RPM_INDEX);
}

/**
 * RPM 지표 삽입 (단일)
 */
export function insertRpmIndicator(ticker: string, date: string, indicators: RpmIndicators): void {
  const database = getConnection();
  const stmt = database.prepare(INSERT_RPM_INDICATOR);
  stmt.run(
    ticker,
    date,
    indicators.rsi14,
    indicators.disparity20,
    indicators.roc10,
    indicators.macdHistogram,
    indicators.bollingerWidth,
    indicators.atrPercent,
    indicators.disparity60,
    indicators.stochasticK
  );
}

/**
 * RPM 지표 일괄 삽입 (트랜잭션)
 */
export function insertRpmIndicatorsBulk(
  ticker: string,
  data: Array<{ date: string; indicators: RpmIndicators }>
): number {
  const database = getConnection();
  const stmt = database.prepare(INSERT_RPM_INDICATOR);

  const insertMany = database.transaction(
    (items: Array<{ date: string; indicators: RpmIndicators }>) => {
      for (const item of items) {
        stmt.run(
          ticker,
          item.date,
          item.indicators.rsi14,
          item.indicators.disparity20,
          item.indicators.roc10,
          item.indicators.macdHistogram,
          item.indicators.bollingerWidth,
          item.indicators.atrPercent,
          item.indicators.disparity60,
          item.indicators.stochasticK
        );
      }
    }
  );

  insertMany(data);
  return data.length;
}

/**
 * 특정 날짜의 RPM 지표 조회
 */
export function getRpmIndicatorByDate(ticker: string, date: string): RpmIndicatorRecord | null {
  const database = getConnection();
  const stmt = database.prepare(SELECT_RPM_BY_DATE);
  const row = stmt.get(ticker, date) as RpmIndicatorRecord | undefined;
  return row ?? null;
}

/**
 * 날짜 범위로 RPM 지표 조회
 */
export function getRpmIndicatorsByDateRange(
  ticker: string,
  startDate: string,
  endDate: string
): RpmIndicatorRecord[] {
  const database = getConnection();
  const stmt = database.prepare(SELECT_RPM_BY_DATE_RANGE);
  return stmt.all(ticker, startDate, endDate) as RpmIndicatorRecord[];
}

/**
 * RPM 지표 개수 조회
 */
export function getRpmIndicatorCount(ticker: string): number {
  const database = getConnection();
  const stmt = database.prepare(SELECT_RPM_COUNT);
  const result = stmt.get(ticker) as { count: number };
  return result.count;
}

/**
 * 최신 RPM 지표 날짜 조회
 */
export function getLatestRpmDate(ticker: string): string | null {
  const database = getConnection();
  const stmt = database.prepare(SELECT_RPM_LATEST_DATE);
  const result = stmt.get(ticker) as { date: string } | undefined;
  return result?.date ?? null;
}

/**
 * 티커의 모든 RPM 지표 삭제
 */
export function deleteRpmIndicatorsByTicker(ticker: string): void {
  const database = getConnection();
  const stmt = database.prepare(DELETE_RPM_BY_TICKER);
  stmt.run(ticker);
}
