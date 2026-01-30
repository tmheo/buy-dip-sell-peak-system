/**
 * 유사도 파라미터 최적화 모듈 타입 정의
 * SPEC-PERF-001
 */

// ============================================================
// 기본 타입 정의
// ============================================================

/**
 * 메트릭 가중치 튜플 (5개 지표)
 * 순서: [maSlope, disparity, rsi14, roc12, volatility20]
 * 모든 가중치의 합은 1.0이 되어야 함
 */
export type MetricWeights = [number, number, number, number, number];

/**
 * 메트릭 허용오차 튜플 (5개 지표)
 * 순서: [maSlope, disparity, rsi14, roc12, volatility20]
 * 각 지표별 유사도 계산 시 사용되는 허용 범위
 */
export type MetricTolerances = [number, number, number, number, number];

// ============================================================
// 유사도 계산 관련 인터페이스
// ============================================================

/**
 * 유사도 계산 옵션 인터페이스 (선택적 파라미터)
 * calculateExponentialSimilarity 함수의 선택적 파라미터로 사용
 * 지정하지 않으면 기본값(METRIC_WEIGHTS, METRIC_TOLERANCES) 사용
 */
export interface SimilarityOptions {
  /** 메트릭 가중치 (선택적) */
  weights?: MetricWeights;
  /** 메트릭 허용오차 (선택적) */
  tolerances?: MetricTolerances;
}

/**
 * 유사도 파라미터 인터페이스 (필수 파라미터)
 * 최적화 과정에서 사용되는 파라미터 조합
 */
export interface SimilarityParams {
  /** 메트릭 가중치 (필수) */
  weights: MetricWeights;
  /** 메트릭 허용오차 (필수) */
  tolerances: MetricTolerances;
}

// ============================================================
// 최적화 설정 인터페이스
// ============================================================

/**
 * 최적화 설정 인터페이스
 * 최적화 실행 시 필요한 설정값
 */
export interface OptimizationConfig {
  /** 종목 티커 */
  ticker: "SOXL" | "TQQQ";
  /** 백테스트 시작일 (YYYY-MM-DD) */
  startDate: string;
  /** 백테스트 종료일 (YYYY-MM-DD) */
  endDate: string;
  /** 초기 투자금 */
  initialCapital: number;
  /** 랜덤 파라미터 조합 수 (기본값: 50) */
  randomCombinations: number;
  /** 상위 후보별 변형 수 (기본값: 10) */
  variationsPerTop: number;
  /** 상위 후보 수 (기본값: 3) */
  topCandidates: number;
}

// ============================================================
// 백테스트 결과 인터페이스
// ============================================================

/**
 * 백테스트 메트릭 인터페이스
 * 최적화에서 사용되는 백테스트 결과 지표
 */
export interface BacktestMetrics {
  /** 수익률 (소수점, 예: 0.45 = 45%) */
  returnRate: number;
  /** 최대 낙폭 (소수점, 예: -0.18 = -18%) */
  mdd: number;
  /** 전략 점수: returnRate * exp(mdd * 0.01) */
  strategyScore: number;
  /** 총 사이클 수 */
  totalCycles: number;
  /** 승률 (소수점, 예: 0.7 = 70%) */
  winRate: number;
}

// ============================================================
// 최적화 결과 인터페이스
// ============================================================

/**
 * 순위별 후보 인터페이스
 * 최적화 결과에서 각 후보의 상세 정보
 */
export interface RankedCandidate {
  /** 순위 (1부터 시작) */
  rank: number;
  /** 유사도 파라미터 */
  params: SimilarityParams;
  /** 백테스트 결과 메트릭 */
  metrics: BacktestMetrics;
  /** 베이스라인 대비 개선 정보 */
  improvement: {
    /** 수익률 개선 (percentage point, 예: 0.05 = 5%p) */
    returnRate: number;
    /** MDD 개선 (percentage point, 양수가 개선) */
    mdd: number;
    /** 전략 점수 개선 (절대값) */
    strategyScore: number;
  };
}

/**
 * 최적화 요약 인터페이스
 * 전체 최적화 실행의 요약 정보
 */
export interface OptimizationSummary {
  /** 탐색한 총 파라미터 조합 수 */
  totalCombinations: number;
  /** 실행 시간 (밀리초) */
  executionTimeMs: number;
  /** 베이스라인 전략 점수 */
  baselineScore: number;
  /** 최고 전략 점수 */
  bestScore: number;
  /** 개선율 (퍼센트, 예: 8.9 = 8.9%) */
  improvementPercent: number;
}

/**
 * 최적화 결과 인터페이스
 * 전체 최적화 실행 결과
 */
export interface OptimizationResult {
  /** 베이스라인 (현재 파라미터) 백테스트 결과 */
  baseline: BacktestMetrics;
  /** 순위별 후보 목록 */
  candidates: RankedCandidate[];
  /** 최고 성능 후보 */
  bestCandidate: RankedCandidate;
  /** 최적화 요약 정보 */
  summary: OptimizationSummary;
}

// ============================================================
// 상수 정의 (기본값)
// ============================================================

/**
 * 기본 최적화 설정
 */
export const DEFAULT_OPTIMIZATION_CONFIG: Omit<
  OptimizationConfig,
  "ticker" | "startDate" | "endDate" | "initialCapital"
> = {
  randomCombinations: 50,
  variationsPerTop: 10,
  topCandidates: 3,
};

/**
 * 가중치 생성 범위
 * 각 가중치는 이 범위 내에서 랜덤 생성됨
 */
export const WEIGHT_RANGE = {
  min: 0.01,
  max: 0.5,
} as const;

/**
 * 허용오차 생성 범위 (지표별)
 * 순서: [maSlope, disparity, rsi14, roc12, volatility20]
 */
export const TOLERANCE_RANGES: readonly [
  { min: number; max: number },
  { min: number; max: number },
  { min: number; max: number },
  { min: number; max: number },
  { min: number; max: number },
] = [
  { min: 10, max: 100 }, // maSlope
  { min: 30, max: 200 }, // disparity
  { min: 1, max: 20 }, // rsi14
  { min: 10, max: 100 }, // roc12
  { min: 10, max: 80 }, // volatility20
] as const;

/**
 * 변형 생성 시 적용되는 범위 (기존 값의 +/- 10%)
 */
export const VARIATION_RANGE = 0.1;
