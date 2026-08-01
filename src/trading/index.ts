/**
 * 실계좌 주문표 조율 모듈 (#76)
 *
 * 실계좌의 주문 생성·체결·마감을 조율하는 단일 소유자.
 * 매매 규칙은 src/strategy가, 저장은 src/database/trading이 소유하고,
 * 이 모듈은 저장에서 읽은 상태를 규칙에 넘기고 규칙의 결정을 저장에 반영한다.
 */

// 주문표 생성
export { generateDailyOrders, toStrategyHoldings } from "./orders";

// 체결·마감 처리
export {
  processOrderExecution,
  processPreviousDayExecution,
  processHistoricalOrders,
  getNextTradingDate,
} from "./execution";
export type { ExecutionResult } from "./execution";
