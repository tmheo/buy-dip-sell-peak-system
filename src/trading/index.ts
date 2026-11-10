/**
 * 실계좌 주문표 조율 모듈 (#76)
 *
 * 실계좌의 주문 생성·체결·마감을 조율하는 단일 소유자.
 * 매매 규칙은 src/strategy가, 저장은 src/database/trading이 소유하고,
 * 이 모듈은 저장에서 읽은 상태를 규칙에 넘기고 규칙의 결정을 저장에 반영한다.
 */

// 주문표 생성과 신선도 정책
export { generateDailyOrders, getFreshDailyOrders } from "./orders";
export type { FreshDailyOrders } from "./orders";

// 사이클 상태 조립 - 화면의 예수금도 주문표와 같은 상태에서 읽는다 (#97)
export { loadCycleState } from "./orders";

// 시드 변경과 감액 경계 - 계좌 상세 화면과 시드 변경 API가 같은 경계를 쓴다 (ADR-0006)
export { changeSeed, loadCycleStateWithSeedCutLimits } from "./seed-change";
export type { CycleStateWithSeedCutLimits, SeedChangeOutcome } from "./seed-change";

// 시드 감액으로 끝난 사이클의 출금액 - 다음 사이클 동안 계좌 상세 화면이 보인다 (#118)
export { loadSeedCutSettlement } from "./seed-cut-settlement";
export type { SeedCutSettlement } from "./seed-cut-settlement";

// 체결·마감 처리
export {
  processOrderExecution,
  processPreviousDayExecution,
  processHistoricalOrders,
  getNextTradingDate,
} from "./execution";
export type { ExecutionResult } from "./execution";

// 마감 스케줄러 정책
export { processDailyClose } from "./scheduler";
export type { AccountCloseResult, DailyCloseOutcome } from "./scheduler";
