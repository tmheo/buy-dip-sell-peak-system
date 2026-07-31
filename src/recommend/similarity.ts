/**
 * 유사도 계산 모듈
 * 지수 감쇠 기반 유사도 계산
 */
import Decimal from "decimal.js";

import type { TechnicalMetrics } from "@/backtest/types";

import type {
  MetricsVector,
  HistoricalMetrics,
  SimilarPeriod,
  MetricWeights,
  MetricTolerances,
  SimilarityConfig,
} from "./types";

/** 분석 구간 길이 (거래일 기준) */
export const ANALYSIS_PERIOD_DAYS = 20;

/** 성과 확인 구간 길이 (거래일 기준) */
export const PERFORMANCE_PERIOD_DAYS = 20;

/** 최소 과거 간격 (기준일로부터 최소 40일 이전) */
export const MIN_PAST_GAP_DAYS = 40;

/**
 * 지표별 가중치: [기울기, 이격도, RSI, ROC, 변동성]
 * SPEC-PERF-001 5개년 Fine-tuning 결과 (2021-2025, SOXL)
 * - 이전: [0.214, 0.3175, 0.156, 0.266, 0.0465]
 * - Fine-tuning 후: +5.09% 통합점수 개선, 평균수익률 68.99% → 70.89%
 */
export const METRIC_WEIGHTS: MetricWeights = [0.3997, 0.0189, 0.3317, 0.0317, 0.218];

/**
 * 지표별 허용 오차 (지수 감쇠 민감도): [기울기, 이격도, RSI, ROC, 변동성]
 * SPEC-PERF-001 5개년 Fine-tuning 결과 (2021-2025, SOXL)
 * - 이전: [14.38, 87.57, 7.03, 78.67, 70.27]
 */
export const METRIC_TOLERANCES: MetricTolerances = [17.65, 75.8, 11.81, 20.17, 48.11];

/** 기본 유사도 설정 (5개년 미세 조정을 거친 가중치·허용오차) */
export const DEFAULT_SIMILARITY_CONFIG: SimilarityConfig = {
  weights: METRIC_WEIGHTS,
  tolerances: METRIC_TOLERANCES,
};

/**
 * 지수 감쇠 기반 유사도 계산
 * 공식: 유사도 = sum(weight_i * 100 * exp(-diff_i / tolerance_i))
 *
 * @param vectorA - 첫 번째 메트릭 벡터 (5개 지표)
 * @param vectorB - 두 번째 메트릭 벡터 (5개 지표)
 * @param config - 가중치·허용오차 (기본값: DEFAULT_SIMILARITY_CONFIG)
 * @returns 유사도 점수 (0-100 범위)
 */
export function calculateExponentialSimilarity(
  vectorA: number[],
  vectorB: number[],
  config: SimilarityConfig = DEFAULT_SIMILARITY_CONFIG
): number {
  const { weights, tolerances } = config;

  const expectedLen = weights.length;
  if (vectorA.length !== expectedLen || vectorB.length !== expectedLen) {
    throw new Error(`벡터 길이는 ${expectedLen}이어야 합니다`);
  }

  let totalSimilarity = new Decimal(0);

  for (let i = 0; i < vectorA.length; i++) {
    const diff = Math.abs(vectorA[i] - vectorB[i]);
    const tolerance = tolerances[i];
    const weight = weights[i];

    // sim_i = 100 * exp(-diff / tolerance)
    const simI = new Decimal(100).mul(new Decimal(-diff / tolerance).exp());
    totalSimilarity = totalSimilarity.add(new Decimal(weight).mul(simI));
  }

  // 소수점 2자리로 반올림
  return totalSimilarity.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** 유클리드 거리 기반 유사도 계산 (하위 호환성 유지, 0~1 범위 반환) */
export function calculateEuclideanSimilarity(
  vectorA: number[],
  vectorB: number[],
  config: SimilarityConfig = DEFAULT_SIMILARITY_CONFIG
): number {
  const similarity = calculateExponentialSimilarity(vectorA, vectorB, config);
  return new Decimal(similarity).div(100).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 기술적 지표를 벡터로 변환 (5개 지표)
 * 정배열(goldenCross)은 유사도 계산에서 제외 (Pro1 제외 판단에만 사용)
 */
export function createMetricsVector(metrics: TechnicalMetrics): MetricsVector {
  return [
    metrics.maSlope,
    metrics.disparity,
    metrics.rsi14,
    metrics.roc12,
    metrics.volatility20 * 100,
  ];
}

interface SimilaritySearchResult {
  historical: HistoricalMetrics;
  similarity: number;
}

/** 유사 구간 Top N 검색 */
export function findSimilarPeriods(
  referenceMetrics: TechnicalMetrics,
  allHistoricalMetrics: HistoricalMetrics[],
  topN: number = 3
): Omit<SimilarPeriod, "backtestResults">[] {
  // 기준 벡터 생성
  const referenceVector = createMetricsVector(referenceMetrics);

  // 모든 과거 구간과 유사도 계산
  const similarities: SimilaritySearchResult[] = [];

  for (const historical of allHistoricalMetrics) {
    const historicalVector = createMetricsVector(historical.metrics);
    const similarity = calculateEuclideanSimilarity(referenceVector, historicalVector);

    similarities.push({
      historical,
      similarity,
    });
  }

  // 유사도 내림차순 정렬
  similarities.sort((a, b) => b.similarity - a.similarity);

  // 상위 N개 선택 및 SimilarPeriod 형식으로 변환
  return similarities.slice(0, topN).map((result) => ({
    startDate: "", // 서비스 레이어에서 계산
    endDate: result.historical.date,
    similarity: result.similarity,
    performanceStartDate: "", // 서비스 레이어에서 계산
    performanceEndDate: "", // 서비스 레이어에서 계산
    metrics: result.historical.metrics,
  }));
}

/** 유사 구간 간 최소 간격 (연속 선택 방지) */
export const MIN_PERIOD_GAP_DAYS = 20;

/** 유사 구간 검색 옵션 */
export interface SimilarPeriodsOptions {
  /** 정배열/역배열 필터 (true: 정배열만, false: 역배열만, undefined: 필터 없음) */
  filterGoldenCross?: boolean;
  /** 유사도 가중치·허용오차 (기본값: DEFAULT_SIMILARITY_CONFIG) */
  similarityConfig?: SimilarityConfig;
}

/** 유사 구간 검색 결과 */
export interface SimilarPeriodWithDate {
  endDate: string;
  endDateIndex: number;
  similarity: number;
  metrics: TechnicalMetrics;
}

/** 유사 구간 검색 (날짜 정보 포함, 최소 간격 보장, 정배열/역배열 필터) */
export function findSimilarPeriodsWithDates(
  referenceMetrics: TechnicalMetrics,
  allHistoricalMetrics: HistoricalMetrics[],
  topN: number = 3,
  options: SimilarPeriodsOptions = {}
): SimilarPeriodWithDate[] {
  // 기준 벡터 생성
  const referenceVector = createMetricsVector(referenceMetrics);
  const similarityConfig = options.similarityConfig ?? DEFAULT_SIMILARITY_CONFIG;

  // 정배열/역배열 필터 적용
  let filteredMetrics = allHistoricalMetrics;
  if (options.filterGoldenCross !== undefined) {
    filteredMetrics = allHistoricalMetrics.filter(
      (h) => h.metrics.isGoldenCross === options.filterGoldenCross
    );
  }

  // 필터링된 과거 구간과 유사도 계산
  const similarities: Array<{
    historical: HistoricalMetrics;
    similarity: number;
  }> = [];

  for (const historical of filteredMetrics) {
    const historicalVector = createMetricsVector(historical.metrics);
    const similarity = calculateEuclideanSimilarity(
      referenceVector,
      historicalVector,
      similarityConfig
    );

    similarities.push({
      historical,
      similarity,
    });
  }

  // 유사도 내림차순 정렬
  similarities.sort((a, b) => b.similarity - a.similarity);

  // 최소 간격을 유지하면서 상위 N개 선택
  const selectedPeriods: SimilarPeriodWithDate[] = [];

  for (const result of similarities) {
    // 이미 선택된 구간들과의 간격 확인
    const isTooClose = selectedPeriods.some((selected) => {
      const gap = Math.abs(selected.endDateIndex - result.historical.dateIndex);
      return gap < MIN_PERIOD_GAP_DAYS;
    });

    if (!isTooClose) {
      selectedPeriods.push({
        endDate: result.historical.date,
        endDateIndex: result.historical.dateIndex,
        similarity: result.similarity,
        metrics: result.historical.metrics,
      });

      if (selectedPeriods.length >= topN) {
        break;
      }
    }
  }

  return selectedPeriods;
}
