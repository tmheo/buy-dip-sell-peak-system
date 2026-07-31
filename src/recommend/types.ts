/**
 * 전략 추천 시스템 타입 정의
 */
import type { TechnicalMetrics } from "@/backtest/types";
import type { Strategy } from "@/types/trading";

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

/** 유사도 계산에 쓰이는 가중치·허용오차 한 벌 */
export interface SimilarityConfig {
  /** 메트릭 가중치 */
  weights: MetricWeights;
  /** 메트릭 허용오차 */
  tolerances: MetricTolerances;
}

/** 추천 요청 인터페이스 */
export interface RecommendRequest {
  /** 종목 티커 (SOXL | TQQQ) */
  ticker: "SOXL" | "TQQQ";
  /** 기준일 (YYYY-MM-DD 형식) */
  referenceDate: string;
  /** 기준일 유형: 'today' (오늘 기준) 또는 'specific' (특정일 기준) */
  baseType: "today" | "specific";
}

/** 개별 전략 백테스트 결과 인터페이스 */
export interface PeriodBacktestResult {
  /** 수익률 (소수점, 예: 0.15 = 15%) */
  returnRate: number;
  /** 최대 낙폭 (소수점, 예: -0.25 = -25%) */
  mdd: number;
}

/** 유사 구간 인터페이스 */
export interface SimilarPeriod {
  /** 분석 구간 시작일 (YYYY-MM-DD) */
  startDate: string;
  /** 분석 구간 종료일 (YYYY-MM-DD) - 기준일에 해당 */
  endDate: string;
  /** 유사도 (0~1, 1에 가까울수록 유사) */
  similarity: number;
  /** 성과 확인 구간 시작일 (분석 구간 종료일 다음 거래일) */
  performanceStartDate: string;
  /** 성과 확인 구간 종료일 (20 거래일 후) */
  performanceEndDate: string;
  /** 해당 구간의 기술적 지표 */
  metrics: TechnicalMetrics;
  /** 성과 확인 구간 백테스트 결과 (Pro1, Pro2, Pro3) */
  backtestResults: {
    Pro1: PeriodBacktestResult;
    Pro2: PeriodBacktestResult;
    Pro3: PeriodBacktestResult;
  };
  /** 차트 데이터 (분석 구간 + 성과 확인 구간) */
  chartData?: ChartDataPoint[];
}

/** 개별 구간의 전략 점수 인터페이스 */
export interface PeriodStrategyScore {
  /** 해당 구간의 점수 */
  score: number;
  /** 수익률 (%) - 예: 15.5 = 15.5% */
  returnRate: number;
  /** 최대 낙폭 (%) - 예: -25 = -25% */
  mdd: number;
}

/** 전략별 종합 점수 인터페이스 */
export interface StrategyScore {
  /** 전략 이름 */
  strategy: Strategy;
  /** 3개 유사 구간의 개별 점수 */
  periodScores: PeriodStrategyScore[];
  /** 평균 점수 (3개 구간 점수의 유사도 가중 평균) */
  averageScore: number;
  /** 제외 여부 (정배열 시 Pro1 제외) */
  excluded: boolean;
  /** 제외 사유 (excluded가 true인 경우) */
  excludeReason?: string;
}

/** 전략 추천 상세 정보 인터페이스 */
export interface RecommendationDetail {
  /** 추천 전략 */
  strategy: Strategy;
  /** 티어별 투자 비율 (6개 티어) */
  tierRatios: [number, number, number, number, number, number];
  /** 추천 이유 */
  reason: string;
}

/** 전략 하향 적용 정보 */
export interface DowngradeInfo {
  /** 하향 적용 여부 */
  applied: boolean;
  /** 원래 전략 (하향 적용 전) */
  originalStrategy?: Strategy;
  /** 하향 적용된 전략 */
  downgradedStrategy?: Strategy;
  /** 하향 사유 목록 */
  reasons: string[];
  /** 다이버전스 조건 발동으로 정배열 Pro1 제외 규칙 무시 여부 */
  skipPro1Exclusion?: boolean;
}

/** 추천 결과 인터페이스 */
export interface RecommendResult {
  /** 기준일 (YYYY-MM-DD) */
  referenceDate: string;
  /** 분석 구간 (기준일 기준 20 거래일) */
  analysisPeriod: {
    startDate: string;
    endDate: string;
  };
  /** 기준일의 기술적 지표 */
  metrics: TechnicalMetrics;
  /** 기준일 차트 데이터 (분석 구간 + 미래 20일) */
  referenceChartData?: ChartDataPoint[];
  /** 유사 구간 Top 3 */
  similarPeriods: SimilarPeriod[];
  /** 전략별 점수 (Pro1, Pro2, Pro3) */
  strategyScores: StrategyScore[];
  /** 추천 전략 */
  recommendedStrategy: RecommendationDetail;
  /** SOXL 전용: 전략 하향 적용 정보 */
  downgradeInfo?: DowngradeInfo;
}

/** 차트 데이터 포인트 (종가, MA20, MA60) */
export interface ChartDataPoint {
  /** 날짜 (YYYY-MM-DD) */
  date: string;
  /** 종가 (미래 날짜의 경우 null) */
  close: number | null;
  /** 20일 이동평균 */
  ma20: number | null;
  /** 60일 이동평균 */
  ma60: number | null;
}

/** 추천 불가 사유 코드 */
export type InsufficientReasonCode =
  | "PRICE_DATA_NOT_FOUND"
  | "INSUFFICIENT_PRICE_HISTORY"
  | "METRICS_CALCULATION_FAILED"
  | "INSUFFICIENT_HISTORICAL_METRICS"
  | "INSUFFICIENT_SIMILAR_PERIODS";

/**
 * 추천 불가(InsufficientData) 사유
 * route는 이를 HTTP 400으로 매핑하고, 추천 백테스트는 기본 전략 폴백에 사용한다
 */
export interface InsufficientReason {
  /** 사유 코드 */
  code: InsufficientReasonCode;
  /** 사람이 읽는 설명 */
  message: string;
  /** 실패 전에 계산된 기준일 지표 (기본 전략 폴백의 사이클 정보용) */
  referenceMetrics?: TechnicalMetrics;
}

/**
 * 추천 결과 (서비스 반환 단위)
 * 상세 필드(analysisPeriod·similarPeriods·strategyScores·downgradeInfo)는
 * 전체 계산 경로에서만 채워진다. DB 캐시 적중과 기본 전략 폴백은 요약만 반환한다.
 */
export interface Recommendation {
  /** 기준일 (YYYY-MM-DD) */
  referenceDate: string;
  /** 추천 전략 */
  strategy: Strategy;
  /** 추천 사유 (generateRecommendReason 문구로 통일) */
  reason: string;
  /** 기준일 기술적 지표 */
  metrics: TechnicalMetrics;
  /** 티어별 투자 비율 (6개 티어) */
  tierRatios: [number, number, number, number, number, number];
  /** 분석 구간 (기준일 기준 20 거래일) */
  analysisPeriod?: {
    startDate: string;
    endDate: string;
  };
  /** 유사 구간 Top 3 (전략별 성과 포함) */
  similarPeriods?: SimilarPeriod[];
  /** 전략별 점수 (Pro1, Pro2, Pro3) */
  strategyScores?: StrategyScore[];
  /** SOXL 전용: 전략 하향 적용 정보 */
  downgradeInfo?: DowngradeInfo;
}

/**
 * DB 추천 캐시에 JSON으로 저장되는 상세 필드
 * 상세가 필요한 화면 요청이 프로세스 재시작 후에도 DB 캐시에서 전체 추천을
 * 복원할 수 있게 한다. 차트 데이터는 표시 계층이 만들므로 저장하지 않는다.
 */
export interface RecommendationCacheDetail {
  /** 분석 구간 (기준일 기준 20 거래일) */
  analysisPeriod: {
    startDate: string;
    endDate: string;
  };
  /** 유사 구간 Top 3 (전략별 성과 포함) */
  similarPeriods: SimilarPeriod[];
  /** 전략별 점수 (Pro1, Pro2, Pro3) */
  strategyScores: StrategyScore[];
  /** SOXL 전용: 전략 하향 적용 정보 */
  downgradeInfo?: DowngradeInfo;
}

/** 추천 판별 결과: 추천 또는 추천 불가 사유 */
export type RecommendOutcome =
  | { ok: true; value: Recommendation }
  | { ok: false; reason: InsufficientReason };

/** 기술적 지표 벡터 (유사도 계산용, 5개 지표) */
export type MetricsVector = [number, number, number, number, number];

/** 과거 기술적 지표 데이터 (유사 구간 검색용) */
export interface HistoricalMetrics {
  /** 날짜 (YYYY-MM-DD) */
  date: string;
  /** 날짜 인덱스 (가격 배열에서의 위치) */
  dateIndex: number;
  /** 기술적 지표 */
  metrics: TechnicalMetrics;
}

// 재내보내기
export type { TechnicalMetrics, Strategy };
