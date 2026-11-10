/**
 * 떨사오팔 매매 규칙 모듈
 * #43: 백테스트와 실계좌에 두 벌로 구현돼 있던 매매 규칙의 단일 소유자.
 *
 * - planOrders(state, prevClose): 전일 종가(adjClose) 기준 주문표 생성. 순수 함수.
 * - settle(state, orders, bar): 당일 가격으로 체결 판정과 상태 전이. 순수 함수.
 * - 사이클 자본은 외부에서 공급된다 (백테스트: 복리 이월, 실계좌: 시드 금액).
 *
 * 가격 불변식: 입력되는 모든 가격은 분할·배당 조정된 연속 시계열(adjClose)이어야 한다.
 */
export { planOrders } from "./plan-orders";
// 같은 주문표에 예수금 때문에 덜 사거나 사지 않는 매수를 함께 낸다. 화면에 그 이유를 보일 때 쓴다 (#98)
export { planOrdersDetailed } from "./plan-orders";
export { settle } from "./settle";
export { startNextCycle } from "./cycle";
// 사이클 중인지(보유 티어가 있는지)의 판정. 실계좌가 사이클 중에만 감액 경계를 낼 때도 쓴다 (ADR-0006).
export { isCycleInProgress } from "./cycle";
export { PRO_STRATEGIES, getStrategyParams } from "./params";
// 예수금·계좌 현금 파생 규칙(ADR-0001, ADR-0003)의 단일 소유자. 소비자가 재계산하지 않도록 함께 공개한다.
// 매수 티어 선정, 티어 금액, 체결 판정은 모듈 내부 구현이다.
export { accountCash, availableCash, cashBreakdown } from "./calculations";
// 시드 감액으로 사이클을 끝내는 날인지의 판정 (ADR-0006). 주문표와 끝난 사이클의 출금액 계산이 함께 쓴다.
export { endsCycleBySeedCut } from "./calculations";
// 시드 감액의 경계와 분류 (ADR-0006). 계좌 상세 화면과 시드 변경 API가 같은 함수를 쓴다.
export {
  classifySeedChange,
  mayEndCycle,
  needsSeedChangeConfirmation,
  seedCutLimits,
} from "./seed-cut";
export type { CycleEndingSeedChange } from "./seed-cut";
// 매도 지정가 파생 계산. sellTargetPrice DB 컬럼(표시용 캐시)을 채울 때 사용한다 (#43).
export { calculateSellLimitPrice } from "./calculations";
export type {
  CashBreakdown,
  CycleState,
  CycleEvent,
  DayBar,
  DetailedOrderPlan,
  Execution,
  OrderIntent,
  ReducedBuy,
  SeedChangeKind,
  SeedCutLimits,
  SettleResult,
  StrategyParams,
  TierCash,
  TierHolding,
  UnaffordableBuy,
} from "./types";
export { BASE_TIER_COUNT, MAX_TIER_NUMBER, MIN_TIER_NUMBER, RESERVE_TIER_NUMBER } from "./types";
