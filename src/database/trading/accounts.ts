/**
 * 트레이딩 계좌 CRUD 함수 (PRD-TRADING-001)
 */

import { eq, and, desc } from "drizzle-orm";

import { db } from "../db-drizzle";
import { tradingAccounts, tierHoldings } from "../schema/index";

import type {
  TradingAccount,
  CreateTradingAccountRequest,
  UpdateTradingAccountRequest,
  TradingAccountWithHoldings,
} from "@/types/trading";
import { TIER_COUNT } from "@/types/trading";

import { mapDrizzleTradingAccount } from "./mappers";
import { getTierHoldings, getTotalShares } from "./tier-holdings";

/**
 * 트레이딩 계좌 생성 (티어 홀딩 7개 자동 생성)
 */
export async function createTradingAccount(
  userId: string,
  request: CreateTradingAccountRequest
): Promise<TradingAccount> {
  return await db.transaction(async (tx) => {
    // 1. 계좌 생성
    const accountResult = await tx
      .insert(tradingAccounts)
      .values({
        userId,
        name: request.name,
        ticker: request.ticker,
        seedCapital: request.seedCapital,
        strategy: request.strategy,
        cycleStartDate: request.cycleStartDate,
        cycleNumber: 1,
      })
      .returning();

    const account = accountResult[0];

    // 2. 티어 홀딩 7개 자동 생성
    for (let tier = 1; tier <= TIER_COUNT; tier++) {
      await tx.insert(tierHoldings).values({
        accountId: account.id,
        tier,
        shares: 0,
      });
    }

    return mapDrizzleTradingAccount(account);
  });
}

/**
 * 사용자의 모든 계좌 조회
 */
export async function getTradingAccountsByUserId(userId: string): Promise<TradingAccount[]> {
  const rows = await db
    .select()
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, userId))
    .orderBy(desc(tradingAccounts.createdAt));

  return rows.map(mapDrizzleTradingAccount);
}

/**
 * 단일 계좌 조회 (본인 확인)
 */
export async function getTradingAccountById(
  id: string,
  userId: string
): Promise<TradingAccount | null> {
  const rows = await db
    .select()
    .from(tradingAccounts)
    .where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)))
    .limit(1);

  return rows[0] ? mapDrizzleTradingAccount(rows[0]) : null;
}

/**
 * 계좌 상세 조회 (holdings 포함)
 */
export async function getTradingAccountWithHoldings(
  id: string,
  userId: string
): Promise<TradingAccountWithHoldings | null> {
  const account = await getTradingAccountById(id, userId);
  if (!account) return null;

  const holdings = await getTierHoldings(id);
  const totalShares = await getTotalShares(id);

  return {
    ...account,
    holdings,
    totalShares,
    isCycleInProgress: totalShares > 0,
  };
}

/**
 * 계좌 수정 (사이클 미진행 시만)
 */
export async function updateTradingAccount(
  id: string,
  userId: string,
  data: UpdateTradingAccountRequest
): Promise<TradingAccount | null> {
  const account = await getTradingAccountById(id, userId);
  if (!account) return null;

  // 사이클 진행 중 확인
  const totalShares = await getTotalShares(id);
  if (totalShares > 0) {
    throw new Error("Cannot update account while cycle is in progress");
  }

  // 업데이트할 필드가 있는지 확인
  const hasUpdates =
    data.name !== undefined ||
    data.ticker !== undefined ||
    data.seedCapital !== undefined ||
    data.strategy !== undefined ||
    data.cycleStartDate !== undefined;

  if (!hasUpdates) {
    return account;
  }

  // 업데이트 객체 구성
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.ticker !== undefined) updateData.ticker = data.ticker;
  if (data.seedCapital !== undefined) updateData.seedCapital = data.seedCapital;
  if (data.strategy !== undefined) updateData.strategy = data.strategy;
  if (data.cycleStartDate !== undefined) updateData.cycleStartDate = data.cycleStartDate;

  await db
    .update(tradingAccounts)
    .set(updateData as typeof tradingAccounts.$inferInsert)
    .where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)));

  return await getTradingAccountById(id, userId);
}

/**
 * 계좌 삭제
 */
export async function deleteTradingAccount(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(tradingAccounts)
    .where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)))
    .returning();

  return result.length > 0;
}
