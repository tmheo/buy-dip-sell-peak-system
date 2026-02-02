/**
 * 추천 캐시 CRUD 함수 (Drizzle ORM for PostgreSQL)
 * - getCachedRecommendation: 캐시된 추천 조회
 * - cacheRecommendation: 추천 결과 캐시 저장
 * - bulkSaveRecommendations: 추천 결과 일괄 저장
 */

import { eq, and } from "drizzle-orm";
import { db } from "./db-drizzle";
import { recommendationCache } from "./schema/index";
import type { RecommendationCache, NewRecommendationCache } from "./schema/index";

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

  return rows.length > 0 ? rows[0] : null;
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

  // PostgreSQL은 단일 INSERT로 여러 값을 처리하고
  // ON CONFLICT DO UPDATE로 UPSERT 처리
  // 대량 데이터의 경우 청크 단위로 처리
  const CHUNK_SIZE = 1000;
  let savedCount = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);

    // 각 항목을 개별 UPSERT 처리 (PostgreSQL ON CONFLICT 제약)
    for (const item of chunk) {
      await db
        .insert(recommendationCache)
        .values(item)
        .onConflictDoUpdate({
          target: [recommendationCache.ticker, recommendationCache.date],
          set: {
            strategy: item.strategy,
            reason: item.reason,
            rsi14: item.rsi14,
            isGoldenCross: item.isGoldenCross,
            maSlope: item.maSlope,
            disparity: item.disparity,
            roc12: item.roc12,
            volatility20: item.volatility20,
            goldenCross: item.goldenCross,
          },
        });
      savedCount++;
    }
  }

  return savedCount;
}
