/**
 * 티어 홀딩 CRUD 함수
 */

import { eq, and, asc, sql } from "drizzle-orm";

import { db } from "../db-drizzle";
import { tierHoldings } from "../schema/index";

import type { TierHolding } from "@/types/trading";
import { mapDrizzleTierHolding } from "./mappers";

// 티어 관련 상수
export const BASE_TIER_COUNT = 6;
export const RESERVE_TIER_NUMBER = 7;

/**
 * 티어별 보유 현황 조회
 */
export async function getTierHoldings(accountId: string): Promise<TierHolding[]> {
  const rows = await db
    .select()
    .from(tierHoldings)
    .where(eq(tierHoldings.accountId, accountId))
    .orderBy(asc(tierHoldings.tier));

  return rows.map(mapDrizzleTierHolding);
}

/**
 * 총 보유 수량 조회
 */
export async function getTotalShares(accountId: string): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${tierHoldings.shares}), 0)` })
    .from(tierHoldings)
    .where(eq(tierHoldings.accountId, accountId));

  // PostgreSQL SUM 결과가 문자열로 반환될 수 있으므로 숫자로 변환
  return Number(result[0]?.total ?? 0);
}

/**
 * 티어 홀딩 업데이트
 */
export async function updateTierHolding(
  accountId: string,
  tier: number,
  data: {
    buyPrice?: number | null;
    shares?: number;
    buyDate?: string | null;
    sellTargetPrice?: number | null;
  }
): Promise<TierHolding | null> {
  // 업데이트할 필드가 있는지 확인
  const hasUpdates =
    data.buyPrice !== undefined ||
    data.shares !== undefined ||
    data.buyDate !== undefined ||
    data.sellTargetPrice !== undefined;

  if (!hasUpdates) {
    return null;
  }

  // 업데이트 객체 구성
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.buyPrice !== undefined) updateData.buyPrice = data.buyPrice;
  if (data.shares !== undefined) updateData.shares = data.shares;
  if (data.buyDate !== undefined) updateData.buyDate = data.buyDate;
  if (data.sellTargetPrice !== undefined) updateData.sellTargetPrice = data.sellTargetPrice;

  await db
    .update(tierHoldings)
    .set(updateData as typeof tierHoldings.$inferInsert)
    .where(and(eq(tierHoldings.accountId, accountId), eq(tierHoldings.tier, tier)));

  const rows = await db
    .select()
    .from(tierHoldings)
    .where(and(eq(tierHoldings.accountId, accountId), eq(tierHoldings.tier, tier)))
    .limit(1);

  return rows[0] ? mapDrizzleTierHolding(rows[0]) : null;
}
