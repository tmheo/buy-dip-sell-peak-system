/**
 * Drizzle ORM 스키마 통합 export
 * 모든 테이블 스키마와 타입을 re-export
 */

// 가격 데이터 스키마
export { dailyPrices, dailyMetrics } from "./prices";
export type { DailyPrice, NewDailyPrice, DailyMetric, NewDailyMetric } from "./prices";

// Auth.js 스키마
export { users, accounts, sessions, verificationTokens } from "./auth";
export type {
  User,
  NewUser,
  Account,
  NewAccount,
  Session,
  NewSession,
  VerificationToken,
  NewVerificationToken,
} from "./auth";

// 트레이딩 스키마
export { tradingAccounts, tierHoldings, dailyOrders, profitRecords } from "./trading";
export type {
  TradingAccount,
  NewTradingAccount,
  TierHolding,
  NewTierHolding,
  DailyOrder,
  NewDailyOrder,
  ProfitRecord,
  NewProfitRecord,
} from "./trading";

// 캐시 스키마
export { recommendationCache } from "./cache";
export type { RecommendationCache, NewRecommendationCache } from "./cache";
