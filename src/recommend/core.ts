/**
 * 추천 파이프라인 순수 계산 코어 (이슈 #56)
 * 가격·지표 배열 → 추천. DB 접근 없이 실패 정책과 구간 폐기 정책을 구현한다.
 *
 * 실패 정책: 데이터가 부족하면 InsufficientData 사유를 반환한다. 지표 재계산 폴백은 없다.
 * 구간 폐기: 유사 구간 안에서 전략 하나라도 백테스트가 실패하면 그 구간 전체를 폐기하고,
 * 폐기로 3개 미만이 되면 InsufficientData다 (0점 유지 방식 폐지).
 */
import type { DailyPrice } from "@/types";
import type { Strategy } from "@/types/trading";
import { BacktestEngine } from "@/backtest/engine";
import { calculateTechnicalMetrics } from "@/backtest/metrics";
import {
  applySOXLDowngrade,
  checkDivergenceCondition,
  formatDowngradeReason,
} from "@/backtest/downgrade";
import type { TechnicalMetrics } from "@/backtest/types";

import {
  ANALYSIS_PERIOD_DAYS,
  PERFORMANCE_PERIOD_DAYS,
  MIN_PAST_GAP_DAYS,
  findSimilarPeriodsWithDates,
} from "./similarity";
import {
  calculateAllStrategyScores,
  getRecommendedStrategy,
  getStrategyTierRatios,
  generateRecommendReason,
} from "./score";
import type {
  DowngradeInfo,
  HistoricalMetrics,
  InsufficientReason,
  InsufficientReasonCode,
  PeriodBacktestResult,
  Recommendation,
  RecommendOutcome,
  SimilarPeriod,
  SimilarityConfig,
} from "./types";

/** 기술적 지표 계산에 필요한 최소 과거 일수 (60 거래일) 기준 최소 인덱스 */
const MIN_METRICS_INDEX = 59;

/** 유사 구간 백테스트에서 지표 계산용으로 앞에 붙이는 과거 일수 */
const LOOKBACK_DAYS = 90;

/** 유사 구간 백테스트에 공급하는 사이클 자본 (고정값) */
const BACKTEST_CYCLE_CAPITAL = 10000000;

/** 추천에 필요한 최소 유사 구간 수 */
const MIN_SIMILAR_PERIODS = 3;

/** 순수 계산 코어 입력: 가격·지표 배열 */
export interface RecommendComputeInput {
  ticker: "SOXL" | "TQQQ";
  /** 기준일 (YYYY-MM-DD) */
  referenceDate: string;
  /** 전체 가격 데이터 (2010년 이후, 날짜 오름차순) */
  prices: DailyPrice[];
  /** DB 지표(daily_metrics)에서 로드된 과거 기술적 지표 (단일 소스) */
  historicalMetrics: HistoricalMetrics[];
  /** 커스텀 유사도 설정 (기본값: DEFAULT_SIMILARITY_CONFIG) */
  similarityConfig?: SimilarityConfig;
}

function insufficient(
  code: InsufficientReasonCode,
  message: string,
  referenceMetrics?: TechnicalMetrics
): { ok: false; reason: InsufficientReason } {
  return { ok: false, reason: { code, message, referenceMetrics } };
}

/**
 * 가격·지표 배열로부터 추천을 계산한다
 * 10단계 파이프라인: 기준일 지표 → 유사 구간 3개 검색 → 구간별 전략 백테스트 →
 * 점수 집계 → 추천 → SOXL 하향 조정
 */
export function computeRecommendation(input: RecommendComputeInput): RecommendOutcome {
  const { ticker, referenceDate, prices, historicalMetrics, similarityConfig } = input;

  // 1. 기준일 인덱스
  const referenceDateIndex = prices.findIndex((p) => p.date === referenceDate);
  if (referenceDateIndex === -1) {
    return insufficient("PRICE_DATA_NOT_FOUND", `${referenceDate}의 가격 데이터가 없습니다`);
  }
  if (referenceDateIndex < MIN_METRICS_INDEX) {
    return insufficient(
      "INSUFFICIENT_PRICE_HISTORY",
      "기준일 이전 최소 60 거래일의 가격 데이터가 필요합니다"
    );
  }

  // 2. 기준일 기술적 지표
  const adjClosePrices = prices.map((p) => p.adjClose);
  const referenceMetrics = calculateTechnicalMetrics(adjClosePrices, referenceDateIndex);
  if (!referenceMetrics) {
    return insufficient("METRICS_CALCULATION_FAILED", "기준일 기술적 지표를 계산할 수 없습니다");
  }

  // 3. 유사 구간 검색 범위 (기준일로부터 최소 40일 이전)
  const maxHistoricalIndex = referenceDateIndex - MIN_PAST_GAP_DAYS;
  if (maxHistoricalIndex < MIN_METRICS_INDEX) {
    return insufficient(
      "INSUFFICIENT_PRICE_HISTORY",
      "유사 구간 검색에 필요한 과거 데이터가 부족합니다",
      referenceMetrics
    );
  }

  const searchableMetrics = historicalMetrics.filter((m) => m.dateIndex <= maxHistoricalIndex);
  if (searchableMetrics.length < MIN_SIMILAR_PERIODS) {
    return insufficient(
      "INSUFFICIENT_HISTORICAL_METRICS",
      "DB 지표(daily_metrics)가 부족해 유사 구간을 검색할 수 없습니다",
      referenceMetrics
    );
  }

  // 4. 유사 구간 Top 3 검색 (정배열/역배열 필터)
  const similarPeriodsRaw = findSimilarPeriodsWithDates(
    referenceMetrics,
    searchableMetrics,
    MIN_SIMILAR_PERIODS,
    {
      filterGoldenCross: referenceMetrics.isGoldenCross,
      similarityConfig,
    }
  );

  // 5. 유사 구간별 성과 확인 구간 백테스트 (전략 하나라도 실패하면 구간 전체 폐기)
  const strategies: Strategy[] = ["Pro1", "Pro2", "Pro3"];
  const similarPeriods: SimilarPeriod[] = [];

  for (const period of similarPeriodsRaw) {
    const performanceStartIndex = period.endDateIndex + 1;
    const performanceEndIndex = performanceStartIndex + PERFORMANCE_PERIOD_DAYS - 1;
    if (performanceEndIndex >= prices.length) continue;

    const performanceStartDate = prices[performanceStartIndex].date;
    const performanceEndDate = prices[performanceEndIndex].date;
    const analysisStartIdx = Math.max(0, period.endDateIndex - ANALYSIS_PERIOD_DAYS + 1);

    const backtestLookbackIndex = Math.max(0, performanceStartIndex - LOOKBACK_DAYS);
    const backtestPrices = prices.slice(backtestLookbackIndex, performanceEndIndex + 1);
    const backtestStartIdx = performanceStartIndex - backtestLookbackIndex;

    const backtestResults = {} as Record<Strategy, PeriodBacktestResult>;
    let discarded = false;

    for (const strategy of strategies) {
      try {
        const engine = new BacktestEngine(strategy);
        const result = engine.run(
          {
            ticker,
            strategy,
            startDate: performanceStartDate,
            endDate: performanceEndDate,
            initialCapital: BACKTEST_CYCLE_CAPITAL,
          },
          backtestPrices,
          backtestStartIdx
        );
        backtestResults[strategy] = { returnRate: result.returnRate, mdd: result.mdd };
      } catch {
        discarded = true;
        break;
      }
    }

    if (discarded) continue;

    similarPeriods.push({
      startDate: prices[analysisStartIdx].date,
      endDate: period.endDate,
      similarity: period.similarity,
      performanceStartDate,
      performanceEndDate,
      metrics: period.metrics,
      backtestResults,
    });
  }

  if (similarPeriods.length < MIN_SIMILAR_PERIODS) {
    return insufficient(
      "INSUFFICIENT_SIMILAR_PERIODS",
      `성과 확인이 가능한 유사 구간이 ${similarPeriods.length}개뿐입니다 (최소 ${MIN_SIMILAR_PERIODS}개)`,
      referenceMetrics
    );
  }

  // 6. 다이버전스 판정은 여기서 한 번만 계산해 점수 계산과 하향 규칙에 전달한다
  const isDivergenceCondition =
    ticker === "SOXL" &&
    checkDivergenceCondition(referenceMetrics, adjClosePrices, referenceDateIndex);

  // 7. 전략 점수 계산 및 추천 (정배열 시 Pro1 제외, 다이버전스 발동 시 무시)
  const strategyScores = calculateAllStrategyScores(
    similarPeriods,
    referenceMetrics.isGoldenCross,
    {
      skipPro1Exclusion: isDivergenceCondition,
    }
  );
  let strategy = getRecommendedStrategy(strategyScores);

  // 8. SOXL 전용 하향 규칙
  let downgradeInfo: DowngradeInfo = {
    applied: false,
    reasons: [],
    skipPro1Exclusion: isDivergenceCondition,
  };
  let reason: string;
  if (ticker === "SOXL") {
    const downgradeResult = applySOXLDowngrade(strategy, referenceMetrics, isDivergenceCondition);
    strategy = downgradeResult.strategy;
    downgradeInfo = {
      applied: downgradeResult.applied,
      originalStrategy: downgradeResult.originalStrategy,
      downgradedStrategy: downgradeResult.applied ? downgradeResult.strategy : undefined,
      reasons: downgradeResult.reasons,
      skipPro1Exclusion: isDivergenceCondition,
    };
    reason = formatDowngradeReason(
      generateRecommendReason(strategy, strategyScores),
      downgradeResult
    );
  } else {
    reason = generateRecommendReason(strategy, strategyScores);
  }

  const analysisStartIndex = Math.max(0, referenceDateIndex - ANALYSIS_PERIOD_DAYS + 1);
  const value: Recommendation = {
    referenceDate,
    strategy,
    reason,
    metrics: referenceMetrics,
    tierRatios: getStrategyTierRatios(strategy),
    analysisPeriod: {
      startDate: prices[analysisStartIndex].date,
      endDate: referenceDate,
    },
    similarPeriods,
    strategyScores,
    downgradeInfo,
  };

  return { ok: true, value };
}
