/**
 * 트레이딩 스키마 (Drizzle ORM for PostgreSQL)
 * - trading_accounts: 트레이딩 계좌
 * - tier_holdings: 티어별 보유 현황
 * - daily_orders: 일일 주문
 * - profit_records: 수익 기록
 */

import {
  pgTable,
  text,
  integer,
  real,
  date,
  timestamp,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// 허용된 티커 및 전략 타입 정의
type AllowedTicker = "SOXL" | "TQQQ";
type AllowedStrategy = "Pro1" | "Pro2" | "Pro3";
type AllowedOrderType = "BUY" | "SELL";
type AllowedOrderMethod = "LOC" | "MOC";

/**
 * trading_accounts 테이블
 * 사용자의 트레이딩 계좌 정보
 */
export const tradingAccounts = pgTable(
  "trading_accounts",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    ticker: text().notNull().$type<AllowedTicker>(),
    seedCapital: real("seed_capital").notNull(),
    strategy: text().notNull().$type<AllowedStrategy>(),
    cycleStartDate: date("cycle_start_date").notNull(),
    cycleNumber: integer("cycle_number").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_trading_accounts_user_id").on(table.userId)]
);

/**
 * tier_holdings 테이블
 * 티어별 보유 현황 (계좌당 7개 티어)
 */
export const tierHoldings = pgTable(
  "tier_holdings",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    tier: integer().notNull(), // 1-7
    buyPrice: real("buy_price"),
    shares: integer().notNull().default(0),
    buyDate: date("buy_date"),
    sellTargetPrice: real("sell_target_price"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_tier_holdings_account_tier").on(table.accountId, table.tier),
    index("idx_tier_holdings_account_id").on(table.accountId),
  ]
);

/**
 * daily_orders 테이블
 * 일일 주문 (LOC/MOC 주문)
 */
export const dailyOrders = pgTable(
  "daily_orders",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    date: date().notNull(),
    tier: integer().notNull(), // 1-7
    type: text().notNull().$type<AllowedOrderType>(),
    orderMethod: text("order_method").notNull().$type<AllowedOrderMethod>(),
    limitPrice: real("limit_price").notNull(),
    shares: integer().notNull(),
    executed: boolean().notNull().default(false),
    executedPrice: real("executed_price"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_daily_orders_account_date").on(table.accountId, table.date)]
);

/**
 * profit_records 테이블
 * 매도 체결 시 수익 기록
 */
export const profitRecords = pgTable(
  "profit_records",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    tier: integer().notNull(), // 1-7
    ticker: text().notNull().$type<AllowedTicker>(),
    strategy: text().notNull().$type<AllowedStrategy>(),
    buyDate: date("buy_date").notNull(),
    buyPrice: real("buy_price").notNull(),
    buyQuantity: integer("buy_quantity").notNull(),
    sellDate: date("sell_date").notNull(),
    sellPrice: real("sell_price").notNull(),
    buyAmount: real("buy_amount").notNull(),
    sellAmount: real("sell_amount").notNull(),
    profit: real().notNull(),
    profitRate: real("profit_rate").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_profit_records_account_id").on(table.accountId),
    index("idx_profit_records_sell_date").on(table.accountId, table.sellDate),
  ]
);

// 타입 추론
export type TradingAccount = typeof tradingAccounts.$inferSelect;
export type NewTradingAccount = typeof tradingAccounts.$inferInsert;
export type TierHolding = typeof tierHoldings.$inferSelect;
export type NewTierHolding = typeof tierHoldings.$inferInsert;
export type DailyOrder = typeof dailyOrders.$inferSelect;
export type NewDailyOrder = typeof dailyOrders.$inferInsert;
export type ProfitRecord = typeof profitRecords.$inferSelect;
export type NewProfitRecord = typeof profitRecords.$inferInsert;
