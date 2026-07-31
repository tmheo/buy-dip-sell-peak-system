/**
 * 전략 추천 시스템 모듈 내보내기
 */

// 타입 내보내기
export type {
  Recommendation,
  RecommendOutcome,
  InsufficientReason,
  InsufficientReasonCode,
  RecommendRequest,
  RecommendResult,
  RecommendationDetail,
  SimilarPeriod,
  PeriodBacktestResult,
  StrategyScore,
  PeriodStrategyScore,
  ChartDataPoint,
  MetricsVector,
  HistoricalMetrics,
  TechnicalMetrics,
  Strategy,
  DowngradeInfo,
  MetricWeights,
  MetricTolerances,
  SimilarityConfig,
} from "./types";

// 유사도 계산 함수 내보내기
export {
  ANALYSIS_PERIOD_DAYS,
  PERFORMANCE_PERIOD_DAYS,
  MIN_PAST_GAP_DAYS,
  MIN_PERIOD_GAP_DAYS,
  METRIC_WEIGHTS,
  METRIC_TOLERANCES,
  DEFAULT_SIMILARITY_CONFIG,
  calculateExponentialSimilarity,
  calculateEuclideanSimilarity,
  createMetricsVector,
  findSimilarPeriods,
  findSimilarPeriodsWithDates,
} from "./similarity";

// 추천 서비스 내보내기
export {
  recommend,
  recommendOrDefault,
  clearRecommendationCache,
  DEFAULT_STRATEGY,
  type RecommendOptions,
} from "./service";

// 순수 계산 코어 내보내기 (DB 없는 테스트·도구용)
export { computeRecommendation, type RecommendComputeInput } from "./core";

// 점수 계산 함수 내보내기
export {
  MDD_WEIGHT,
  calculateStrategyScore,
  calculateAverageScore,
  calculateAllStrategyScores,
  getRecommendedStrategy,
  getStrategyTierRatios,
  generateRecommendReason,
} from "./score";
