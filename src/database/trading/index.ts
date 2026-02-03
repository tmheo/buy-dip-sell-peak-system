/**
 * 트레이딩 모듈 통합 export
 * 기존 trading.ts와의 하위 호환성을 위해 모든 public 함수/타입을 re-export
 */

// Mappers (내부용이지만 필요시 export)
export {
  mapDrizzleTradingAccount,
  mapDrizzleTierHolding,
  mapDrizzleDailyOrder,
  mapDrizzleProfitRecord,
} from "./mappers";

// TierHolding CRUD
export {
  BASE_TIER_COUNT,
  RESERVE_TIER_NUMBER,
  getTierHoldings,
  getTotalShares,
  updateTierHolding,
} from "./tier-holdings";

// TradingAccount CRUD
export {
  createTradingAccount,
  getTradingAccountsByUserId,
  getTradingAccountById,
  getTradingAccountWithHoldings,
  updateTradingAccount,
  deleteTradingAccount,
} from "./accounts";

// DailyOrder CRUD
export {
  getDailyOrders,
  createDailyOrder,
  updateOrderExecuted,
  getClosingPrice,
  deleteDailyOrders,
  generateDailyOrders,
  getNextBuyTier,
} from "./orders";

// Order Execution
export {
  getAccountStrategy,
  completeCycleAndIncrement,
  processOrderExecution,
  processPreviousDayExecution,
  getNextTradingDate,
  processHistoricalOrders,
} from "./execution";
export type { ExecutionResult } from "./execution";

// Profit Records
export {
  createProfitRecord,
  getProfitRecords,
  aggregateProfits,
  groupProfitsByMonth,
} from "./profits";
export type { ProfitAggregate } from "./profits";
