/**
 * Drizzle Row -> Application Type 변환 함수
 * Drizzle은 Date/Timestamp를 Date 객체로, Application은 string으로 사용
 */

import type {
  TradingAccount as DrizzleTradingAccount,
  TierHolding as DrizzleTierHolding,
  DailyOrder as DrizzleDailyOrder,
  ProfitRecord as DrizzleProfitRecord,
} from "../schema/index";

import type {
  TradingAccount,
  TierHolding,
  DailyOrder,
  ProfitRecord,
  Ticker,
  Strategy,
  OrderType,
  OrderMethod,
} from "@/types/trading";

export function mapDrizzleTradingAccount(row: DrizzleTradingAccount): TradingAccount {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    ticker: row.ticker as Ticker,
    seedCapital: row.seedCapital,
    strategy: row.strategy as Strategy,
    cycleStartDate: row.cycleStartDate,
    cycleNumber: row.cycleNumber,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapDrizzleTierHolding(row: DrizzleTierHolding): TierHolding {
  return {
    id: row.id,
    accountId: row.accountId,
    tier: row.tier,
    buyPrice: row.buyPrice,
    shares: row.shares,
    buyDate: row.buyDate,
    sellTargetPrice: row.sellTargetPrice,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapDrizzleDailyOrder(row: DrizzleDailyOrder): DailyOrder {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    tier: row.tier,
    type: row.type as OrderType,
    orderMethod: row.orderMethod as OrderMethod,
    limitPrice: row.limitPrice,
    shares: row.shares,
    executed: row.executed,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapDrizzleProfitRecord(row: DrizzleProfitRecord): ProfitRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    tier: row.tier,
    ticker: row.ticker as Ticker,
    strategy: row.strategy as Strategy,
    buyDate: row.buyDate,
    buyPrice: row.buyPrice,
    buyQuantity: row.buyQuantity,
    sellDate: row.sellDate,
    sellPrice: row.sellPrice,
    buyAmount: row.buyAmount,
    sellAmount: row.sellAmount,
    profit: row.profit,
    profitRate: row.profitRate,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
