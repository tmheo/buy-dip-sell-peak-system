/**
 * 추천 전략 백테스트 모듈 내보내기
 * #64: BacktestEngine(#63)에 추천 공급자를 꽂아 돌리는 얇은 조립 모듈.
 * 전략 추천 자체는 src/recommend의 RecommendationService가 소유한다 (#56).
 */

// 타입 내보내기
export type {
  RecommendBacktestRequest,
  RecommendBacktestResult,
  CycleStrategyInfo,
  DailySnapshotWithStrategy,
  StrategyUsageStats,
} from "./types";

// 공급자 어댑터 내보내기
export { createRecommendProvider } from "./provider";

// facade 내보내기
export { runRecommendBacktest } from "./run";
export type { RecommendBacktestOptions } from "./run";
