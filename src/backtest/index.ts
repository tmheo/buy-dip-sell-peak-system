/**
 * 백테스트 모듈 내보내기
 * SPEC-BACKTEST-001
 */

// 상수 내보내기
export { BASE_TIER_COUNT, RESERVE_TIER_NUMBER, MIN_TIER_NUMBER, MAX_TIER_NUMBER } from "./types";

// 타입 내보내기
export type {
  StrategyName,
  StrategyConfig,
  TierState,
  CycleState,
  BacktestRequest,
  BacktestResult,
  DailySnapshot,
  TradeAction,
  OrderCalculation,
} from "./types";

// 전략 내보내기
export { PRO_STRATEGIES, getStrategy } from "./strategy";

// 주문 계산 함수 내보내기
export {
  floorToDecimal,
  calculateBuyLimitPrice,
  calculateSellLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
} from "./order";

// 사이클 관리 클래스 내보내기
export { CycleManager } from "./cycle";

// 백테스트 엔진 내보내기
export { BacktestEngine } from "./engine";

// 성과 지표 함수 내보내기
export { calculateReturn, calculateMDD, calculateWinRate } from "./metrics";
