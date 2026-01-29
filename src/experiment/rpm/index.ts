/**
 * RPM (Real-Time Pattern Machine) 실험 모듈
 *
 * 8개 기술적 지표 기반 유사도 계산 방식 실험
 *
 * @module experiment/rpm
 * @version 1.0.0
 * @see SPEC-RPM-EXPERIMENT-001
 *
 * ## 주요 기능
 * - 8개 RPM 지표 계산 (RSI, 이격도20/60, ROC10, MACD, Bollinger, ATR%, Stochastic)
 * - 가중합 유사도 계산 (-500 ~ +500)
 * - RPM 기반 추천 백테스트 엔진
 * - 베이스라인 vs RPM 비교 실험
 *
 * ## RPM 8개 지표 구성
 * | 지표 | 배점 | 비중 | 계산 방식 |
 * |------|------|------|----------|
 * | RSI 14 | 120점 | 24% | 14일 RSI (Wilder's EMA) |
 * | 이격도 20 | 80점 | 16% | (종가 - MA20) / MA20 x 100 |
 * | ROC 10 | 80점 | 16% | (현재가 - 10일전) / 10일전 x 100 |
 * | MACD Histogram | 50점 | 10% | MACD(12,26) - Signal(9) |
 * | 변동성폭 | 50점 | 10% | 볼린저밴드폭 = (상단-하단) / 중앙 |
 * | ATR % | 50점 | 10% | ATR(14) / 종가 x 100 |
 * | 이격도 60 | 20점 | 4% | (종가 - MA60) / MA60 x 100 |
 * | 스토캐스틱 K | 20점 | 4% | %K(14, 3) |
 *
 * ## 유사도 계산 방식
 * ```
 * 각 지표별 점수 = 배점 x (1 - |기준값 - 비교값| / 허용오차)
 * 유사도 점수 = 합계(각 지표별 점수), 범위: -500 ~ +500
 * ```
 *
 * ## 사용 예시
 * ```typescript
 * import { runExperiment, calculateRpmIndicators, RpmRecommendBacktestEngine } from "./experiment/rpm";
 *
 * // 전체 실험 실행
 * const result = runExperiment(prices, {
 *   ticker: "SOXL",
 *   startDate: "2025-01-01",
 *   endDate: "2025-12-31",
 *   seedCapital: 10000
 * });
 *
 * // 개별 지표 계산
 * const indicators = calculateRpmIndicators(ohlcPrices, dateIndex);
 *
 * // RPM 추천 백테스트 엔진 사용
 * const engine = new RpmRecommendBacktestEngine("SOXL", allPrices, dateToIndexMap);
 * const backtestResult = engine.run(request, backtestStartIndex);
 * ```
 *
 * ## 참고 자료
 * - 블로그 출처: https://blog.naver.com/therich-roy/224158442470
 * - 기존 시스템: src/recommend/similarity.ts (5개 지표 + 지수감쇠)
 */

// 타입 내보내기
export type {
  RpmIndicators,
  RpmSimilarityResult,
  RpmMetricsVector,
  RpmWeightConfig,
  RpmSimilarityConfig,
  ExperimentBacktestMetrics,
  ExperimentResult,
  RpmIndicatorRecord,
  DailyPrice,
} from "./types";

// 지표 계산 함수 내보내기
export {
  // MACD 관련
  calculateEMA,
  calculateMACD,
  calculateSignalLine,
  calculateMACDHistogram,
  // 기타 지표
  calculateBollingerWidth,
  calculateATRPercent,
  calculateStochasticK,
  calculateROC10,
  calculateDisparity20,
  calculateDisparity60,
  // 통합 함수
  calculateRpmIndicators,
} from "./rpm-indicators";

// 유사도 계산 함수 내보내기
export {
  // 상수
  DEFAULT_RPM_CONFIG,
  MIN_PAST_GAP_DAYS,
  MIN_PERIOD_GAP_DAYS,
  // 단일 지표 점수 계산
  calculateIndicatorScore,
  // 유사도 계산
  calculateRpmSimilarity,
  // 유사 구간 검색
  findRpmSimilarPeriods,
  // 유틸리티
  calculateScoreDifference,
  getTotalMaxScore,
} from "./rpm-similarity";

// RPM 추천 백테스트 엔진 내보내기
export type { RpmRecommendResult } from "./rpm-recommend-engine";
export {
  RpmRecommendBacktestEngine,
  getRpmQuickRecommendation,
  clearRpmRecommendationCache,
} from "./rpm-recommend-engine";

// 실험 실행기 내보내기
export type { ExperimentRunnerConfig } from "./rpm-experiment-runner";
export {
  runExperiment,
  runBaselineBacktest,
  runRpmBacktest,
  compareResults,
  extractMetrics,
  calculateImprovement,
  calculateMddImprovement,
  formatComparisonReport,
  printComparisonReport,
  getRecommendLookbackStart,
  DEFAULT_EXPERIMENT_CONFIG,
} from "./rpm-experiment-runner";
