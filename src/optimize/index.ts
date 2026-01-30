/**
 * 유사도 파라미터 최적화 모듈
 * SPEC-PERF-001
 *
 * 유사도 계산의 가중치 및 허용오차 파라미터를 최적화합니다.
 * 랜덤 탐색 + 상위 후보 변형 탐색 방식으로 최적 파라미터를 찾습니다.
 *
 * @example
 * // CLI 실행
 * npx tsx src/optimize/cli.ts --ticker SOXL --start 2025-01-01 --end 2025-12-31
 *
 * @example
 * // 프로그래매틱 사용
 * import { generateRandomParams, runBacktestWithParams, analyzeResults } from "@/optimize";
 *
 * const config = {
 *   ticker: "SOXL",
 *   startDate: "2025-01-01",
 *   endDate: "2025-12-31",
 *   initialCapital: 10000,
 *   randomCombinations: 50,
 *   variationsPerTop: 10,
 *   topCandidates: 3,
 * };
 *
 * const priceData = loadPriceData(config.ticker);
 * const baseline = runBacktestWithParams(config, null, priceData);
 * const randomParams = generateRandomParams(50);
 * // ... 백테스트 실행 및 분석
 */

// ============================================================
// 타입 Export
// ============================================================

export type {
  /** 메트릭 가중치 튜플 (5개 지표) */
  MetricWeights,
  /** 메트릭 허용오차 튜플 (5개 지표) */
  MetricTolerances,
  /** 유사도 계산 옵션 (선택적 파라미터) */
  SimilarityOptions,
  /** 유사도 파라미터 (필수 파라미터) */
  SimilarityParams,
  /** 최적화 설정 */
  OptimizationConfig,
  /** 백테스트 메트릭 */
  BacktestMetrics,
  /** 순위별 후보 */
  RankedCandidate,
  /** 최적화 결과 */
  OptimizationResult,
  /** 최적화 요약 */
  OptimizationSummary,
} from "./types";

// ============================================================
// 상수 Export
// ============================================================

export {
  /** 기본 최적화 설정 */
  DEFAULT_OPTIMIZATION_CONFIG,
  /** 허용오차 생성 범위 (지표별) */
  TOLERANCE_RANGES,
  /** 가중치 생성 범위 */
  WEIGHT_RANGE,
  /** 변형 생성 범위 (+/- 10%) */
  VARIATION_RANGE,
} from "./types";

// ============================================================
// 파라미터 생성 함수 Export
// ============================================================

export {
  /** 지정된 개수의 랜덤 파라미터 조합 생성 */
  generateRandomParams,
  /** 기존 파라미터 기반 변형 생성 */
  generateVariations,
  /** 유사도 파라미터 유효성 검증 */
  validateParams,
  /** 가중치 정규화 (합 = 1.0 보장) */
  normalizeWeights,
} from "./param-generator";

// ============================================================
// 백테스트 실행 함수 Export
// ============================================================

export {
  /** 데이터베이스에서 가격 데이터 로드 */
  loadPriceData,
  /** 커스텀 파라미터로 백테스트 실행 */
  runBacktestWithParams,
  /** 전략 점수 계산 */
  calculateStrategyScore,
} from "./backtest-runner";

export type {
  /** 가격 데이터 로드 결과 */
  PriceDataResult,
} from "./backtest-runner";

// ============================================================
// 결과 분석 함수 Export
// ============================================================

export {
  /** 최적화 결과 분석 (순위 결정, 요약 생성) */
  analyzeResults,
  /** 순위별 후보 객체 생성 */
  createRankedCandidate,
  /** 최적화 요약 통계 생성 */
  createOptimizationSummary,
} from "./analyzer";

// ============================================================
// CLI 함수 Export
// ============================================================

export {
  /** CLI 인자 파싱 */
  parseArgs,
  /** 최적화 결과를 콘솔 출력 형식으로 포맷팅 */
  formatOutput,
  /** CLI 메인 함수 */
  main as runOptimizationCli,
} from "./cli";
