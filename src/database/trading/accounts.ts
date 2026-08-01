/**
 * 트레이딩 계좌 CRUD 함수 (PRD-TRADING-001)
 */

import { eq, and, desc, gte } from "drizzle-orm";

import { db, type DbExecutor } from "../db-drizzle";
import { tradingAccounts, tierHoldings } from "../schema/index";

import type {
  TradingAccount,
  CreateTradingAccountRequest,
  UpdateTradingAccountRequest,
  TradingAccountWithHoldings,
} from "@/types/trading";
import { MAX_TIER_NUMBER, MIN_TIER_NUMBER } from "@/strategy";

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
        // 생성자가 곧 조회하므로 활성 상태로 시작 (스케줄러 처리 대상에 포함)
        lastViewedAt: new Date(),
      })
      .returning();

    const account = accountResult[0];

    // 2. 티어 홀딩 7개(예비 티어 포함) 자동 생성
    for (let tier = MIN_TIER_NUMBER; tier <= MAX_TIER_NUMBER; tier++) {
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
 * 모든 사용자의 모든 계좌 조회 (스케줄러 전용)
 * 일일 마감 처리 cron에서 특정 계좌 지정 처리 시 사용
 */
export async function getAllTradingAccounts(): Promise<TradingAccount[]> {
  const rows = await db.select().from(tradingAccounts);
  return rows.map(mapDrizzleTradingAccount);
}

/**
 * 최근 조회된 활성 계좌 조회 (스케줄러 전용)
 * lastViewedAt이 since 이후인 계좌만 반환한다.
 * 한 번도 조회되지 않은 계좌(lastViewedAt = NULL)는 제외된다.
 *
 * @param since - 이 시각 이후 조회된 계좌만 포함
 */
export async function getActiveTradingAccounts(since: Date): Promise<TradingAccount[]> {
  const rows = await db
    .select()
    .from(tradingAccounts)
    .where(gte(tradingAccounts.lastViewedAt, since));
  return rows.map(mapDrizzleTradingAccount);
}

/**
 * 계좌 조회 시각 갱신
 * 계좌 상세 화면을 열 때 호출하여 활성 계좌로 표시한다.
 * (updatedAt은 갱신하지 않는다 — 주문 라우트의 설정 변경 감지에 영향 방지)
 */
export async function markAccountViewed(id: string): Promise<void> {
  await db
    .update(tradingAccounts)
    .set({ lastViewedAt: new Date() })
    .where(eq(tradingAccounts.id, id));
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
 * 소유자 확인 없이 계좌를 id로 조회 (내부 처리 전용)
 * 마감 처리·체결 처리처럼 이미 소유자 확인을 마쳤거나 스케줄러가 부르는 경로에서 쓴다.
 * 사용자 요청 경로는 반드시 getTradingAccountById를 써서 소유자를 확인한다.
 */
export async function getTradingAccountByIdWithoutOwnerCheck(
  id: string
): Promise<TradingAccount | null> {
  const rows = await db.select().from(tradingAccounts).where(eq(tradingAccounts.id, id)).limit(1);

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

/**
 * 사이클 완료 시 cycleNumber 증가
 * 모든 티어가 비었을 때 호출되어 다음 사이클을 준비
 *
 * @param accountId - 계좌 ID
 * @param executor - 쿼리 실행자 (트랜잭션 컨텍스트 전달용)
 * @returns 업데이트된 cycleNumber, 계좌가 없으면 null
 */
export async function completeCycleAndIncrement(
  accountId: string,
  executor: DbExecutor = db
): Promise<number | null> {
  // 1. 현재 cycle_number 조회
  const rows = await executor
    .select({ cycleNumber: tradingAccounts.cycleNumber })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.id, accountId))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  // 2. cycle_number 증가
  const newCycleNumber = rows[0].cycleNumber + 1;
  await executor
    .update(tradingAccounts)
    .set({ cycleNumber: newCycleNumber, updatedAt: new Date() })
    .where(eq(tradingAccounts.id, accountId));

  return newCycleNumber;
}

/**
 * 마감 처리 완료 거래일을 계좌에 기록
 * 다음 스케줄러 실행이 이 날짜 다음부터 이어받아 증분 처리한다.
 * (updatedAt은 갱신하지 않는다 - 주문 라우트의 설정 변경 감지에 영향을 주지 않기 위함)
 */
export async function updateAccountLastProcessedDate(
  accountId: string,
  date: string
): Promise<void> {
  await db
    .update(tradingAccounts)
    .set({ lastProcessedDate: date })
    .where(eq(tradingAccounts.id, accountId));
}
