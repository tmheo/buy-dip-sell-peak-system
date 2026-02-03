/**
 * 트레이딩 계좌 CRUD 함수 (PRD-TRADING-001)
 *
 * 이 파일은 하위 호환성을 위해 유지됩니다.
 * 새로운 모듈화된 구조는 ./trading/ 디렉토리에 있습니다.
 *
 * 모듈 구조:
 * - ./trading/mappers.ts: Drizzle → Application 타입 변환
 * - ./trading/accounts.ts: TradingAccount CRUD
 * - ./trading/tier-holdings.ts: TierHolding CRUD
 * - ./trading/orders.ts: DailyOrder CRUD 및 주문 생성
 * - ./trading/execution.ts: 주문 체결 처리
 * - ./trading/profits.ts: 수익 기록 CRUD
 */

// 모든 public 함수/타입을 새 모듈에서 re-export
export {
  // Mappers
  mapDrizzleTradingAccount,
  mapDrizzleTierHolding,
  mapDrizzleDailyOrder,
  mapDrizzleProfitRecord,

  // Constants
  BASE_TIER_COUNT,
  RESERVE_TIER_NUMBER,

  // TierHolding CRUD
  getTierHoldings,
  getTotalShares,
  updateTierHolding,

  // TradingAccount CRUD
  createTradingAccount,
  getTradingAccountsByUserId,
  getTradingAccountById,
  getTradingAccountWithHoldings,
  updateTradingAccount,
  deleteTradingAccount,

  // DailyOrder CRUD
  getDailyOrders,
  createDailyOrder,
  updateOrderExecuted,
  getClosingPrice,
  deleteDailyOrders,
  generateDailyOrders,
  getNextBuyTier,

  // Order Execution
  getAccountStrategy,
  completeCycleAndIncrement,
  processOrderExecution,
  processPreviousDayExecution,
  getNextTradingDate,
  processHistoricalOrders,

  // Profit Records
  createProfitRecord,
  getProfitRecords,
  aggregateProfits,
  groupProfitsByMonth,
} from "./trading/index";

// 타입 re-export
export type { ExecutionResult, ProfitAggregate } from "./trading/index";
