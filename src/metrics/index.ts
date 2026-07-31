/**
 * 기술적 지표 계산 모듈 (SPEC-METRICS-001)
 *
 * 기술적 지표 계산만 소유하는 순수 함수 모듈.
 * 성과 지표(MDD, 승률, CAGR, 수익률)는 백테스트 결과의 소유물이므로 src/backtest에 있다.
 */
export {
  computeIndicatorSeries,
  computeIndicatorsAt,
  calculateSMA,
  calculateRSI,
  calculateROC,
  calculateVolatility,
} from "./indicators";
export type { IndicatorRow } from "./types";
