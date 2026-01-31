/**
 * 전략 추천 시스템 모듈 내보내기
 */

// 타입 내보내기
export type {
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
  StrategyName,
  DowngradeInfo,
} from "./types";

// 유사도 계산 함수 및 파라미터 관리 내보내기
export {
  ANALYSIS_PERIOD_DAYS,
  PERFORMANCE_PERIOD_DAYS,
  MIN_PAST_GAP_DAYS,
  MIN_PERIOD_GAP_DAYS,
  METRIC_WEIGHTS,
  METRIC_TOLERANCES,
  calculateExponentialSimilarity,
  calculateEuclideanSimilarity,
  createMetricsVector,
  findSimilarPeriods,
  findSimilarPeriodsWithDates,
  setGlobalSimilarityParams,
  resetGlobalSimilarityParams,
  getCurrentSimilarityParams,
} from "./similarity";

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
