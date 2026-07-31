/**
 * 백테스트 모듈 내보내기
 * SPEC-BACKTEST-001
 *
 * 매매 규칙(전략 파라미터, 티어 상수, 주문 계산)은 src/strategy가 소유한다 (#43).
 */

// 상수 내보내기
export { STRATEGY_COLORS } from "./types";

// 타입 내보내기
export type {
  BacktestRequest,
  BacktestResult,
  CycleStrategyInfo,
  DailySnapshot,
  StrategyDecision,
  StrategyDecisionMetrics,
  StrategyProvider,
  StrategyUsageStats,
  TradeAction,
  OrderAction,
} from "./types";

// 백테스트 엔진 내보내기
export { BacktestEngine } from "./engine";

// 성과 지표 함수 내보내기
export { calculateReturn, calculateMDD, calculateWinRate } from "./metrics";

// 다이버전스 탐지 함수 내보내기
export { findLocalHighs, detectBearishDivergence } from "./divergence";
export type { DivergenceResult, DivergenceOptions } from "./divergence";

// SOXL 하향 규칙 내보내기
export { applySOXLDowngrade, formatDowngradeReason, checkDivergenceCondition } from "./downgrade";
export type { DowngradeResult } from "./downgrade";
