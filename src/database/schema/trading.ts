/**
 * 트레이딩 스키마 (Drizzle ORM for PostgreSQL)
 * - trading_accounts: 트레이딩 계좌
 * - tier_holdings: 티어별 보유 현황
 * - daily_orders: 일일 주문
 * - profit_records: 수익 기록
 * - seed_capital_history: 시드 이력 (ADR-0005)
 */

import {
  pgTable,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  boolean,
  primaryKey,
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
    // 더 읽지도 쓰지도 않는다 - 시드는 seed_capital_history가 소유한다 (ADR-0005).
    // 되돌릴 일이 없다고 확인되면 칸을 지운다 (#120).
    seedCapital: numeric("seed_capital", { precision: 14, scale: 2, mode: "number" }),
    strategy: text().notNull().$type<AllowedStrategy>(),
    // 운용 시작일(첫 사이클의 시작일). 사이클이 끝나도 바뀌지 않으며 첫 일일 마감 전에만 바꿀 수 있다.
    cycleStartDate: date("cycle_start_date").notNull(),
    cycleNumber: integer("cycle_number").notNull().default(1),
    // 마감 처리 스케줄러가 마지막으로 처리 완료한 거래일.
    // NULL이면 아직 한 번도 처리되지 않은 상태 (cycleStartDate부터 처리).
    lastProcessedDate: date("last_processed_date"),
    // 계좌 상세 화면을 마지막으로 조회한 시각.
    // 스케줄러는 최근 조회된 활성 계좌만 처리한다 (방치 계좌는 건너뜀).
    lastViewedAt: timestamp("last_viewed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_trading_accounts_user_id").on(table.userId),
    index("idx_trading_accounts_last_viewed_at").on(table.lastViewedAt),
  ]
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
    buyPrice: numeric("buy_price", { precision: 12, scale: 2, mode: "number" }),
    shares: integer().notNull().default(0),
    buyDate: date("buy_date"),
    sellTargetPrice: numeric("sell_target_price", { precision: 12, scale: 2, mode: "number" }),
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
    limitPrice: numeric("limit_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
    shares: integer().notNull(),
    executed: boolean().notNull().default(false),
    executedPrice: numeric("executed_price", { precision: 12, scale: 2, mode: "number" }),
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
    // 체결 시점(사이클 완료 처리 전)의 계좌 사이클 번호 - 이번 사이클 실현손익 합산에 쓴다 (#97)
    cycleNumber: integer("cycle_number").notNull(),
    tier: integer().notNull(), // 1-7
    ticker: text().notNull().$type<AllowedTicker>(),
    strategy: text().notNull().$type<AllowedStrategy>(),
    buyDate: date("buy_date").notNull(),
    buyPrice: numeric("buy_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
    buyQuantity: integer("buy_quantity").notNull(),
    sellDate: date("sell_date").notNull(),
    sellPrice: numeric("sell_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
    buyAmount: numeric("buy_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    sellAmount: numeric("sell_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    profit: numeric("profit", { precision: 14, scale: 2, mode: "number" }).notNull(),
    profitRate: numeric("profit_rate", { precision: 8, scale: 4, mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_profit_records_account_id").on(table.accountId),
    index("idx_profit_records_sell_date").on(table.accountId, table.sellDate),
    index("idx_profit_records_account_cycle").on(table.accountId, table.cycleNumber),
  ]
);

/**
 * seed_capital_history 테이블
 * 계좌의 시드 금액 이력 - 줄마다 적용일부터 쓰이는 시드 (ADR-0005)
 * 계좌를 만들 때 첫 줄(적용일 = 만든 날)을 쓰고, 시드를 바꾸면 다음 거래일을 적용일로 쓴다.
 * 한 계좌에 같은 적용일은 하나뿐이다 - 같은 계좌의 동시 변경이 두 줄을 남기지 않는다.
 */
export const seedCapitalHistory = pgTable(
  "seed_capital_history",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date").notNull(),
    seedCapital: numeric("seed_capital", { precision: 14, scale: 2, mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.effectiveDate] })]
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
export type SeedCapitalHistoryRow = typeof seedCapitalHistory.$inferSelect;
