/**
 * 실계좌 저장 모듈 통합 export
 *
 * 이 모듈은 순수 저장만 소유한다 - 조회, 삽입/갱신, 그리고 여러 저장 연산을
 * 한 트랜잭션으로 묶는 일.
 * 전략을 호출하는 조율(주문 생성, 체결 처리, 마감 처리)은 src/trading이 소유한다.
 */

// 쿼리 실행자 타입 (조율 계층이 트랜잭션 컨텍스트를 넘길 때 사용)
export type { DbExecutor } from "../db-drizzle";

// 트랜잭션
export { runInTransaction } from "./transaction";

// Mappers (내부용이지만 필요시 export)
export {
  mapDrizzleTradingAccount,
  mapDrizzleTierHolding,
  mapDrizzleDailyOrder,
  mapDrizzleProfitRecord,
} from "./mappers";

// TierHolding CRUD
export { getTierHoldings, getTotalShares, updateTierHolding } from "./tier-holdings";

// TradingAccount CRUD
export {
  createTradingAccount,
  getTradingAccountsByUserId,
  getAllTradingAccounts,
  getActiveTradingAccounts,
  markAccountViewed,
  getTradingAccountById,
  getTradingAccountByIdWithoutOwnerCheck,
  getTradingAccountWithHoldings,
  updateTradingAccount,
  deleteTradingAccount,
  completeCycleAndIncrement,
  updateAccountLastProcessedDate,
} from "./accounts";

// DailyOrder CRUD
export {
  getDailyOrders,
  createDailyOrder,
  updateOrderExecuted,
  getClosingPrice,
  getPreviousTradingClose,
  listTradingDatesBetween,
  deleteDailyOrders,
  replaceDailyOrders,
  hasNewerPriceSince,
} from "./orders";
export type { NewDailyOrder } from "./orders";

// Profit Records
export {
  createProfitRecord,
  getProfitRecords,
  aggregateProfits,
  groupProfitsByMonth,
} from "./profits";
export type { ProfitAggregate } from "./profits";
