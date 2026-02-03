/**
 * 추천 캐시 CRUD 함수 (Drizzle ORM for PostgreSQL)
 * - getCachedRecommendation: 캐시된 추천 조회
 * - cacheRecommendation: 추천 결과 캐시 저장
 * - bulkSaveRecommendations: 추천 결과 일괄 저장
 * - getRecommendationCacheCount: 캐시 카운트 조회
 * - toRecommendationCacheMetrics: 기술적 지표를 캐시 형식으로 변환
 */

import { eq, and, count } from "drizzle-orm";
import { db } from "./db-drizzle";
import { recommendationCache } from "./schema/index";
import type { RecommendationCache, NewRecommendationCache } from "./schema/index";

// Re-export 타입
export type { RecommendationCache, NewRecommendationCache };

/** TechnicalMetrics 인터페이스 (backtest/types.ts와 호환) */
interface TechnicalMetricsLike {
  rsi14?: number;
  isGoldenCross?: boolean;
  maSlope?: number;
  disparity?: number;
  roc12?: number;
  volatility20?: number;
  goldenCross?: number;
}

/** 캐시 저장용 지표 필드 타입 */
export type RecommendationCacheMetrics = Pick<
  NewRecommendationCache,
  "rsi14" | "isGoldenCross" | "maSlope" | "disparity" | "roc12" | "volatility20" | "goldenCross"
>;

/**
 * TechnicalMetrics를 NewRecommendationCache 형식으로 변환
 * @param metrics - 기술적 지표 객체
 * @returns 캐시 저장에 적합한 플랫 구조의 지표
 */
export function toRecommendationCacheMetrics(
  metrics: TechnicalMetricsLike
): RecommendationCacheMetrics {
  return {
    rsi14: metrics.rsi14 ?? null,
    isGoldenCross: metrics.isGoldenCross ?? false,
    maSlope: metrics.maSlope ?? null,
    disparity: metrics.disparity ?? null,
    roc12: metrics.roc12 ?? null,
    volatility20: metrics.volatility20 ?? null,
    goldenCross: metrics.goldenCross ?? null,
  };
}

/**
 * 캐시에서 특정 날짜의 추천 조회
 * @param ticker - 조회할 티커
 * @param date - 조회할 날짜 (YYYY-MM-DD)
 * @returns 캐시된 추천 데이터 또는 null
 */
export async function getCachedRecommendation(
  ticker: string,
  date: string
): Promise<RecommendationCache | null> {
  const rows = await db
    .select()
    .from(recommendationCache)
    .where(and(eq(recommendationCache.ticker, ticker), eq(recommendationCache.date, date)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * 추천 결과를 캐시에 저장 (UPSERT)
 * ticker + date 복합 키 기준으로 기존 데이터 갱신
 * @param data - 저장할 추천 데이터
 */
export async function cacheRecommendation(data: NewRecommendationCache): Promise<void> {
  await db
    .insert(recommendationCache)
    .values(data)
    .onConflictDoUpdate({
      target: [recommendationCache.ticker, recommendationCache.date],
      set: {
        strategy: data.strategy,
        reason: data.reason,
        rsi14: data.rsi14,
        isGoldenCross: data.isGoldenCross,
        maSlope: data.maSlope,
        disparity: data.disparity,
        roc12: data.roc12,
        volatility20: data.volatility20,
        goldenCross: data.goldenCross,
      },
    });
}

/**
 * 여러 추천 결과를 캐시에 일괄 저장 (UPSERT)
 * @param items - 저장할 추천 데이터 배열
 * @returns 저장된 항목 수
 */
export async function bulkSaveRecommendations(items: NewRecommendationCache[]): Promise<number> {
  if (items.length === 0) return 0;

  // 각 항목을 개별 UPSERT 처리
  // PostgreSQL의 ON CONFLICT DO UPDATE는 단일 values에서만 동작하므로 순차 처리
  for (const item of items) {
    await cacheRecommendation(item);
  }

  return items.length;
}

/**
 * 특정 티커의 캐시된 추천 데이터 수 조회
 * @param ticker - 조회할 티커 (기본값: SOXL)
 * @returns 레코드 수
 */
export async function getRecommendationCacheCount(ticker: string = "SOXL"): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(recommendationCache)
    .where(eq(recommendationCache.ticker, ticker));

  return Number(rows[0]?.count ?? 0);
}
