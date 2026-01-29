/**
 * RPM 8개 지표 기반 유사도 실험 타입 정의
 * SPEC-RPM-EXPERIMENT-001
 */

/**
 * RPM 8개 기술적 지표 인터페이스
 * 기존 5개 지표에서 확장된 8개 지표
 */
export interface RpmIndicators {
  /** RSI 14일 (Wilder's EMA 방식, 0-100) */
  rsi14: number;
  /** 이격도 20일: (종가 - MA20) / MA20 × 100 */
  disparity20: number;
  /** 10일 ROC: (현재가 - 10일전) / 10일전 × 100 */
  roc10: number;
  /** MACD 히스토그램: MACD(12,26) - Signal(9) */
  macdHistogram: number;
  /** 볼린저밴드 폭: (상단 - 하단) / 중앙 */
  bollingerWidth: number;
  /** ATR%: ATR(14) / 종가 × 100 */
  atrPercent: number;
  /** 이격도 60일: (종가 - MA60) / MA60 × 100 */
  disparity60: number;
  /** 스토캐스틱 %K (14, 3) - Slow Stochastic */
  stochasticK: number;
}

/**
 * RPM 지표별 가중치 설정
 */
export interface RpmWeightConfig {
  /** 배점 (최대 점수) */
  maxScore: number;
  /** 허용 오차 */
  tolerance: number;
}

/**
 * RPM 유사도 설정
 */
export interface RpmSimilarityConfig {
  weights: {
    rsi14: RpmWeightConfig;
    disparity20: RpmWeightConfig;
    roc10: RpmWeightConfig;
    macdHistogram: RpmWeightConfig;
    bollingerWidth: RpmWeightConfig;
    atrPercent: RpmWeightConfig;
    disparity60: RpmWeightConfig;
    stochasticK: RpmWeightConfig;
  };
}

/**
 * RPM 유사도 계산 결과
 */
export interface RpmSimilarityResult {
  /** 날짜 (YYYY-MM-DD) */
  date: string;
  /** 날짜 인덱스 (가격 배열에서의 위치) */
  dateIndex: number;
  /** RPM 8개 지표 */
  indicators: RpmIndicators;
  /** 유사도 점수 (-500 ~ +500) */
  similarityScore: number;
  /** 기준일과의 점수 차이 (절대값) */
  scoreDifference: number;
}

/**
 * RPM 유사도 계산용 벡터 (8개 지표)
 */
export type RpmMetricsVector = [
  number, // rsi14
  number, // disparity20
  number, // roc10
  number, // macdHistogram
  number, // bollingerWidth
  number, // atrPercent
  number, // disparity60
  number, // stochasticK
];

/**
 * 실험 백테스트 지표
 */
export interface ExperimentBacktestMetrics {
  /** 수익률 (소수점, 예: 0.15 = 15%) */
  returnRate: number;
  /** 최대 낙폭 (소수점, 예: -0.25 = -25%) */
  mdd: number;
  /** 연평균 복리 수익률 (CAGR) */
  cagr: number;
  /** 승률 */
  winRate: number;
  /** 총 사이클 수 */
  totalCycles: number;
  /** 전략 점수: 수익률(%) × e^(MDD(%) × 0.01) */
  strategyScore: number;
}

/**
 * 실험 결과 인터페이스
 */
export interface ExperimentResult {
  /** 기준선 (기존 5개 지표) 백테스트 결과 */
  baseline: ExperimentBacktestMetrics;
  /** 실험군 (RPM 8개 지표) 백테스트 결과 */
  experimental: ExperimentBacktestMetrics;
  /** 개선율 */
  improvement: {
    /** 수익률 개선 (pp, percentage points) */
    returnRate: number;
    /** MDD 개선 (pp, 음수가 더 좋음이므로 양수면 개선) */
    mdd: number;
    /** 전략 점수 개선 */
    strategyScore: number;
  };
}

/**
 * RPM 지표 DB 레코드
 */
export interface RpmIndicatorRecord {
  id: number;
  ticker: string;
  date: string;
  rsi14: number;
  disparity20: number;
  roc10: number;
  macdHistogram: number;
  bollingerWidth: number;
  atrPercent: number;
  disparity60: number;
  stochasticK: number;
  createdAt: string;
}

/**
 * OHLC 가격 데이터 인터페이스 (ATR 계산용)
 */
export interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
}
