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
export { settle } from "./settle";
export { startNextCycle } from "./cycle";
export { PRO_STRATEGIES, getStrategyParams } from "./params";
// 예수금 파생 규칙(ADR-0001)의 단일 소유자. 소비자가 재계산하지 않도록 함께 공개한다.
// 매수 티어 선정, 티어 금액, 지정가, 체결 판정은 모듈 내부 구현이다.
export { availableCash } from "./calculations";
export type {
  CycleState,
  CycleEvent,
  DayBar,
  Execution,
  OrderIntent,
  SettleResult,
  StrategyParams,
  TierHolding,
} from "./types";
export { BASE_TIER_COUNT, MIN_TIER_NUMBER, RESERVE_TIER_NUMBER } from "./types";
