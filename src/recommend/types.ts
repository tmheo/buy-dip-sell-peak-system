/**
 * 전략 추천 시스템 타입 정의
 */
import type { TechnicalMetrics, StrategyName } from "@/backtest/types";

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
  strategy: StrategyName;
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
  strategy: StrategyName;
  /** 티어별 투자 비율 (6개 티어) */
  tierRatios: [number, number, number, number, number, number];
  /** 추천 이유 */
  reason: string;
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
export type { TechnicalMetrics, StrategyName };
