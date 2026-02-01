/**
 * 가격 데이터 스키마 (Drizzle ORM for PostgreSQL)
 * - daily_prices: 일봉 OHLCV 데이터
 * - daily_metrics: 기술적 지표
 */

import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * daily_prices 테이블
 * 일봉 OHLCV (Open, High, Low, Close, Volume) 데이터
 */
export const dailyPrices = pgTable(
  "daily_prices",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ticker: text().notNull().default("SOXL"),
    date: date().notNull(),
    open: real().notNull(),
    high: real().notNull(),
    low: real().notNull(),
    close: real().notNull(),
    adjClose: real("adj_close").notNull(),
    volume: integer().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [uniqueIndex("idx_daily_prices_ticker_date").on(table.ticker, table.date)]
);

/**
 * daily_metrics 테이블
 * 기술적 지표 (이동평균, RSI, 변동성 등)
 */
export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ticker: text().notNull().default("SOXL"),
    date: date().notNull(),
    ma20: real(),
    ma60: real(),
    maSlope: real("ma_slope"),
    disparity: real(),
    rsi14: real(),
    roc12: real(),
    volatility20: real(),
    goldenCross: real("golden_cross"),
    isGoldenCross: boolean("is_golden_cross"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [uniqueIndex("idx_daily_metrics_ticker_date").on(table.ticker, table.date)]
);

// 타입 추론
export type DailyPrice = typeof dailyPrices.$inferSelect;
export type NewDailyPrice = typeof dailyPrices.$inferInsert;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type NewDailyMetric = typeof dailyMetrics.$inferInsert;
