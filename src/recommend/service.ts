/**
 * RecommendationService (이슈 #56)
 * 추천 파이프라인의 단일 소유자. 순수 계산 코어(core.ts)에 DB 로드 껍데기와
 * 추천 캐시(메모리·DB) 소유권을 더한다.
 *
 * 실패 정책 한 벌:
 * - recommend는 Recommendation | InsufficientData(사유) 판별 결과를 반환한다.
 * - DB 지표(daily_metrics)가 단일 소스다. 부족하면 InsufficientData이며,
 *   런타임 지표 재계산 폴백은 없다 (운영 문제를 가리지 않는다).
 * - recommendOrDefault는 부족 시 기본 전략 Pro2 + 사유를 반환한다.
 *   "부족하면 Pro2"는 추천 백테스트의 재현 의미이므로 서비스의 문서화된 정책이다.
 *
 * 캐시 정책: 커스텀 similarityConfig가 오면 메모리·DB 캐시를 조회도 저장도 하지
 * 않아, 기본 설정의 추천 결과와 섞이는 일이 구조적으로 불가능하다.
 */
import type { DailyPrice } from "@/types";
import type { Strategy } from "@/types/trading";
import type { TechnicalMetrics } from "@/backtest/types";
import { getPriceRange, getLatestDate } from "@/database/prices";
import { getMetricsRange } from "@/database/metrics";
import {
  getCachedRecommendation,
  cacheRecommendation,
  toRecommendationCacheMetrics,
} from "@/database/recommend-cache";

import { computeRecommendation } from "./core";
import { getStrategyTierRatios } from "./score";
import type {
  HistoricalMetrics,
  InsufficientReasonCode,
  Recommendation,
  RecommendOutcome,
  SimilarityConfig,
} from "./types";

/** 기본 전략 (CONTEXT.md): 추천을 계산할 수 없을 때 대신 쓰는 전략 */
export const DEFAULT_STRATEGY: Strategy = "Pro2";

/** 유사 구간 검색용 과거 데이터 시작일 (SOXL/TQQQ 모두 2010년 시작) */
const PRICE_HISTORY_START = "2010-01-01";

/** recommend 옵션 */
export interface RecommendOptions {
  /** 전체 가격 데이터 (핫 루프용). 없으면 서비스가 DB에서 로드한다 */
  prices?: DailyPrice[];
  /** 커스텀 유사도 설정. 지정하면 메모리·DB 추천 캐시를 전부 우회한다 */
  similarityConfig?: SimilarityConfig;
  /** 계산 결과의 DB 캐시 저장 여부 (기본값: true) */
  persistCache?: boolean;
}

/** 인메모리 추천 캐시 (ticker:기준일 → 추천) */
const memoryCache = new Map<string, Recommendation>();

/**
 * 추천 메모리 캐시 초기화
 * 새로운 백테스트 세션이나 일괄 계산 시작 시 호출
 */
export function clearRecommendationCache(): void {
  memoryCache.clear();
}

/** null 허용 지표 행 (DB 지표·추천 캐시 공용) */
interface NullableMetricsRow {
  goldenCross?: number | null;
  isGoldenCross?: boolean | null;
  maSlope?: number | null;
  disparity?: number | null;
  rsi14?: number | null;
  roc12?: number | null;
  volatility20?: number | null;
}

/** null 허용 지표 행을 TechnicalMetrics로 변환 (누락 값은 중립값) */
function toTechnicalMetrics(row: NullableMetricsRow): TechnicalMetrics {
  return {
    goldenCross: row.goldenCross ?? 0,
    isGoldenCross: row.isGoldenCross ?? false,
    maSlope: row.maSlope ?? 0,
    disparity: row.disparity ?? 0,
    rsi14: row.rsi14 ?? 50,
    roc12: row.roc12 ?? 0,
    volatility20: row.volatility20 ?? 0,
  };
}

/** 추천 불가 사유 코드별 기본 전략 사용 사유 */
const DEFAULT_REASON_BY_CODE: Record<InsufficientReasonCode, string> = {
  PRICE_DATA_NOT_FOUND: "데이터 부족으로 기본 전략 사용",
  INSUFFICIENT_PRICE_HISTORY: "데이터 부족으로 기본 전략 사용",
  METRICS_CALCULATION_FAILED: "지표 계산 실패로 기본 전략 사용",
  INSUFFICIENT_HISTORICAL_METRICS: "유사 구간 부족으로 기본 전략 사용",
  INSUFFICIENT_SIMILAR_PERIODS: "성과 구간 부족으로 기본 전략 사용",
};

/** DB에서 전체 가격 데이터 로드 (2010년 이후 최신까지) */
async function loadAllPrices(ticker: "SOXL" | "TQQQ"): Promise<DailyPrice[]> {
  const latestDate = await getLatestDate(ticker);
  if (!latestDate) return [];
  return getPriceRange(ticker, PRICE_HISTORY_START, latestDate);
}

/**
 * DB 지표(daily_metrics)를 HistoricalMetrics 배열로 로드
 * 지표가 하나라도 비어 있는 행은 제외한다 (재계산 폴백 없음)
 */
async function loadHistoricalMetrics(
  ticker: "SOXL" | "TQQQ",
  referenceDate: string,
  dateToIndexMap: Map<string, number>
): Promise<HistoricalMetrics[]> {
  const rows = await getMetricsRange(ticker, PRICE_HISTORY_START, referenceDate);
  const historicalMetrics: HistoricalMetrics[] = [];

  for (const row of rows) {
    const dateIndex = dateToIndexMap.get(row.date);
    if (dateIndex === undefined) continue;
    if (
      row.maSlope === null ||
      row.disparity === null ||
      row.rsi14 === null ||
      row.roc12 === null ||
      row.volatility20 === null
    ) {
      continue;
    }

    historicalMetrics.push({
      date: row.date,
      dateIndex,
      metrics: toTechnicalMetrics(row),
    });
  }

  return historicalMetrics;
}

/** DB 캐시 행을 요약 Recommendation으로 변환 */
function fromCachedRecommendation(
  referenceDate: string,
  cached: NonNullable<Awaited<ReturnType<typeof getCachedRecommendation>>>
): Recommendation {
  const strategy = cached.strategy as Strategy;
  return {
    referenceDate,
    strategy,
    reason: cached.reason ?? "캐시된 추천",
    metrics: toTechnicalMetrics(cached),
    tierRatios: getStrategyTierRatios(strategy),
  };
}

/**
 * 기준일에 대한 전략 추천
 *
 * @param ticker - 종목 티커
 * @param referenceDate - 기준일 (YYYY-MM-DD)
 * @param opts - 옵션 (가격 데이터·커스텀 유사도 설정·캐시 저장 여부)
 * @returns 추천 또는 추천 불가(InsufficientData) 사유
 */
export async function recommend(
  ticker: "SOXL" | "TQQQ",
  referenceDate: string,
  opts: RecommendOptions = {}
): Promise<RecommendOutcome> {
  const { prices, similarityConfig, persistCache = true } = opts;
  // 커스텀 유사도 설정이면 추천 캐시(메모리·DB)를 조회도 저장도 하지 않는다
  const useCache = similarityConfig === undefined;
  const cacheKey = `${ticker}:${referenceDate}`;

  if (useCache) {
    const memoryCached = memoryCache.get(cacheKey);
    if (memoryCached) {
      return { ok: true, value: memoryCached };
    }

    const dbCached = await getCachedRecommendation(ticker, referenceDate);
    if (dbCached) {
      const value = fromCachedRecommendation(referenceDate, dbCached);
      memoryCache.set(cacheKey, value);
      return { ok: true, value };
    }
  }

  const allPrices = prices ?? (await loadAllPrices(ticker));

  const dateToIndexMap = new Map<string, number>();
  for (let i = 0; i < allPrices.length; i++) {
    dateToIndexMap.set(allPrices[i].date, i);
  }

  // 기준일이 가격 데이터에 없으면 지표 로드가 무의미하다 (코어가 사유를 판정한다)
  const historicalMetrics = dateToIndexMap.has(referenceDate)
    ? await loadHistoricalMetrics(ticker, referenceDate, dateToIndexMap)
    : [];

  const outcome = computeRecommendation({
    ticker,
    referenceDate,
    prices: allPrices,
    historicalMetrics,
    similarityConfig,
  });

  if (outcome.ok && useCache) {
    memoryCache.set(cacheKey, outcome.value);
    if (persistCache) {
      await cacheRecommendation({
        ticker,
        date: referenceDate,
        strategy: outcome.value.strategy,
        reason: outcome.value.reason,
        ...toRecommendationCacheMetrics(outcome.value.metrics),
      });
    }
  }

  return outcome;
}

/**
 * 기준일에 대한 전략 추천 (추천 백테스트용)
 * 추천을 계산할 수 없으면 기본 전략(Pro2)과 사유를 반환한다.
 * 추천 불가였던 날의 사용자는 기본 전략을 썼다고 본다 (재현 의미).
 */
export async function recommendOrDefault(
  ticker: "SOXL" | "TQQQ",
  referenceDate: string,
  opts: RecommendOptions = {}
): Promise<Recommendation> {
  const outcome = await recommend(ticker, referenceDate, opts);
  if (outcome.ok) {
    return outcome.value;
  }

  return {
    referenceDate,
    strategy: DEFAULT_STRATEGY,
    reason: DEFAULT_REASON_BY_CODE[outcome.reason.code],
    metrics: outcome.reason.referenceMetrics ?? toTechnicalMetrics({}),
    tierRatios: getStrategyTierRatios(DEFAULT_STRATEGY),
  };
}
