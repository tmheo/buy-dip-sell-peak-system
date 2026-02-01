/**
 * 캐시 스키마 (Drizzle ORM for PostgreSQL)
 * - recommendation_cache: 추천 전략 캐시
 */

import {
  pgTable,
  text,
  real,
  boolean,
  date,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/**
 * recommendation_cache 테이블
 * 백테스트 추천 전략 캐시 (ticker + date 복합 PK)
 */
export const recommendationCache = pgTable(
  "recommendation_cache",
  {
    ticker: text().notNull(),
    date: date().notNull(),
    strategy: text().notNull(), // Pro1, Pro2, Pro3
    reason: text(),
    rsi14: real(),
    isGoldenCross: boolean("is_golden_cross"),
    maSlope: real("ma_slope"),
    disparity: real(),
    roc12: real(),
    volatility20: real(),
    goldenCross: real("golden_cross"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ticker, table.date] }),
    index("idx_recommendation_cache_ticker_date").on(table.ticker, table.date),
  ]
);

// 타입 추론
export type RecommendationCache = typeof recommendationCache.$inferSelect;
export type NewRecommendationCache = typeof recommendationCache.$inferInsert;
