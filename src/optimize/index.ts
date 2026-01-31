/**
 * 유사도 파라미터 최적화 모듈
 * SPEC-PERF-001
 */

// 타입
export type {
  MetricWeights,
  MetricTolerances,
  SimilarityOptions,
  SimilarityParams,
  OptimizationConfig,
  BacktestMetrics,
  RankedCandidate,
  OptimizationResult,
  OptimizationSummary,
} from "./types";

// 상수
export {
  DEFAULT_OPTIMIZATION_CONFIG,
  TOLERANCE_RANGES,
  WEIGHT_RANGE,
  VARIATION_RANGE,
} from "./types";

// 파라미터 생성
export {
  generateRandomParams,
  generateVariations,
  validateParams,
  normalizeWeights,
} from "./param-generator";

// 백테스트 실행
export { loadPriceData, runBacktestWithParams, calculateStrategyScore } from "./backtest-runner";

export type { PriceDataResult } from "./backtest-runner";

// 결과 분석
export { analyzeResults, createRankedCandidate, createOptimizationSummary } from "./analyzer";

// CLI
export { parseArgs, formatOutput, main as runOptimizationCli } from "./cli";
