/**
 * 추천 전략 백테스트 모듈 내보내기
 * 전략 추천 자체는 src/recommend의 RecommendationService가 소유한다 (#56)
 */

// 타입 내보내기
export type {
  RecommendBacktestRequest,
  RecommendBacktestResult,
  CycleStrategyInfo,
  DailySnapshotWithStrategy,
  StrategyUsageStats,
} from "./types";

// 엔진 내보내기
export { RecommendBacktestEngine } from "./engine";
