/**
 * 트레이딩 계좌 CRUD 함수 (PRD-TRADING-001)
 * Drizzle ORM for PostgreSQL
 */

import Decimal from "decimal.js";
import { eq, and, desc, asc, lte, sql } from "drizzle-orm";

import { db } from "./db-drizzle";
import {
  tradingAccounts,
  tierHoldings,
  dailyOrders,
  profitRecords,
  dailyPrices,
} from "./schema/index";
import type {
  TradingAccount as DrizzleTradingAccount,
  TierHolding as DrizzleTierHolding,
  DailyOrder as DrizzleDailyOrder,
  ProfitRecord as DrizzleProfitRecord,
} from "./schema/index";

import type {
  TradingAccount,
  TierHolding,
  DailyOrder,
  CreateTradingAccountRequest,
  UpdateTradingAccountRequest,
  TradingAccountWithHoldings,
  Ticker,
  Strategy,
  OrderType,
  OrderMethod,
  ProfitRecord,
  MonthlyProfitSummary,
  ProfitStatusResponse,
} from "@/types/trading";
import {
  TIER_COUNT,
  TIER_RATIOS,
  BUY_THRESHOLDS,
  SELL_THRESHOLDS,
  STOP_LOSS_DAYS,
} from "@/types/trading";

// 티어 관련 상수
const BASE_TIER_COUNT = 6;
const RESERVE_TIER_NUMBER = 7;

import {
  calculateBuyLimitPrice,
  calculateSellLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
  getPreviousTradingDate,
  calculateTradingDays,
  percentToThreshold,
} from "@/utils/trading-core";

// =====================================================
// Drizzle Row -> Application Type 변환 함수
// Drizzle은 Date/Timestamp를 Date 객체로, Application은 string으로 사용
// =====================================================

function mapDrizzleTradingAccount(row: DrizzleTradingAccount): TradingAccount {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    ticker: row.ticker as Ticker,
    seedCapital: row.seedCapital,
    strategy: row.strategy as Strategy,
    cycleStartDate: row.cycleStartDate,
    cycleNumber: row.cycleNumber,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function mapDrizzleTierHolding(row: DrizzleTierHolding): TierHolding {
  return {
    id: row.id,
    accountId: row.accountId,
    tier: row.tier,
    buyPrice: row.buyPrice,
    shares: row.shares,
    buyDate: row.buyDate,
    sellTargetPrice: row.sellTargetPrice,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function mapDrizzleDailyOrder(row: DrizzleDailyOrder): DailyOrder {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    tier: row.tier,
    type: row.type as OrderType,
    orderMethod: row.orderMethod as OrderMethod,
    limitPrice: row.limitPrice,
    shares: row.shares,
    executed: row.executed,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function mapDrizzleProfitRecord(row: DrizzleProfitRecord): ProfitRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    tier: row.tier,
    ticker: row.ticker as Ticker,
    strategy: row.strategy as Strategy,
    buyDate: row.buyDate,
    buyPrice: row.buyPrice,
    buyQuantity: row.buyQuantity,
    sellDate: row.sellDate,
    sellPrice: row.sellPrice,
    buyAmount: row.buyAmount,
    sellAmount: row.sellAmount,
    profit: row.profit,
    profitRate: row.profitRate,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

// =====================================================
// TradingAccount CRUD
// =====================================================

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

// =====================================================
// TierHolding CRUD
// =====================================================

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

  return result[0]?.total ?? 0;
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

// =====================================================
// DailyOrder CRUD
// =====================================================

/**
 * 당일 주문표 조회
 */
export async function getDailyOrders(accountId: string, date: string): Promise<DailyOrder[]> {
  const rows = await db
    .select()
    .from(dailyOrders)
    .where(and(eq(dailyOrders.accountId, accountId), eq(dailyOrders.date, date)))
    .orderBy(asc(dailyOrders.tier), asc(dailyOrders.type));

  return rows.map(mapDrizzleDailyOrder);
}

/**
 * 주문 생성
 */
export async function createDailyOrder(
  accountId: string,
  data: {
    date: string;
    tier: number;
    type: OrderType;
    orderMethod: OrderMethod;
    limitPrice: number;
    shares: number;
  }
): Promise<DailyOrder> {
  const result = await db
    .insert(dailyOrders)
    .values({
      accountId,
      date: data.date,
      tier: data.tier,
      type: data.type,
      orderMethod: data.orderMethod,
      limitPrice: data.limitPrice,
      shares: data.shares,
      executed: false,
    })
    .returning();

  return mapDrizzleDailyOrder(result[0]);
}

/**
 * 주문 실행 상태 업데이트
 */
export async function updateOrderExecuted(orderId: string, executed: boolean): Promise<boolean> {
  const result = await db
    .update(dailyOrders)
    .set({ executed, updatedAt: new Date() })
    .where(eq(dailyOrders.id, orderId))
    .returning();

  return result.length > 0;
}

/**
 * 특정 날짜의 종가 조회
 */
export async function getClosingPrice(ticker: Ticker, date: string): Promise<number | null> {
  const rows = await db
    .select({ adjClose: dailyPrices.adjClose })
    .from(dailyPrices)
    .where(and(eq(dailyPrices.ticker, ticker), lte(dailyPrices.date, date)))
    .orderBy(desc(dailyPrices.date))
    .limit(1);

  return rows[0]?.adjClose ?? null;
}

/**
 * 당일 주문 삭제 (재생성 용)
 */
export async function deleteDailyOrders(accountId: string, date: string): Promise<void> {
  await db
    .delete(dailyOrders)
    .where(and(eq(dailyOrders.accountId, accountId), eq(dailyOrders.date, date)));
}

/**
 * 당일 주문 자동 생성
 * - 티어 고정 방식: 가장 낮은 빈 티어에만 매수 주문 (한 번에 하나의 티어만)
 * - 보유 티어: 매도 주문 생성
 */
export async function generateDailyOrders(
  accountId: string,
  date: string,
  ticker: Ticker,
  strategy: Strategy,
  seedCapital: number,
  holdings: TierHolding[]
): Promise<DailyOrder[]> {
  // 전일 종가 조회 (주문 생성일 기준 이전 거래일)
  const prevDate = getPreviousTradingDate(date);
  const closePrice = await getClosingPrice(ticker, prevDate);

  if (!closePrice) {
    return []; // 가격 데이터 없으면 주문 생성 불가
  }

  const buyThreshold = percentToThreshold(BUY_THRESHOLDS[strategy]);
  const sellThreshold = percentToThreshold(SELL_THRESHOLDS[strategy]);
  const tierRatios = TIER_RATIOS[strategy];

  const orders: DailyOrder[] = [];

  // 기존 주문 삭제
  await deleteDailyOrders(accountId, date);

  const stopLossDay = STOP_LOSS_DAYS[strategy];

  // 1. 보유 중인 티어들의 매도 주문 생성 (손절 또는 일반 매도)
  for (const holding of holdings) {
    if (holding.shares > 0 && holding.buyPrice && holding.buyDate) {
      // 보유일 계산 (거래일 기준)
      const holdingDays = calculateTradingDays(holding.buyDate, date);

      if (holdingDays >= stopLossDay) {
        // 손절일 도달: MOC 주문 (시장가, 무조건 체결)
        const order = await createDailyOrder(accountId, {
          date,
          tier: holding.tier,
          type: "SELL" as OrderType,
          orderMethod: "MOC" as OrderMethod,
          limitPrice: closePrice, // MOC는 시장가이므로 종가로 설정
          shares: holding.shares,
        });
        orders.push(order);
      } else {
        // 일반 매도: LOC 주문 (지정가)
        const sellPrice = calculateSellLimitPrice(holding.buyPrice, sellThreshold);
        const order = await createDailyOrder(accountId, {
          date,
          tier: holding.tier,
          type: "SELL" as OrderType,
          orderMethod: "LOC" as OrderMethod,
          limitPrice: sellPrice,
          shares: holding.shares,
        });
        orders.push(order);
      }
    }
  }

  // 2. 다음 매수할 티어 찾기 (티어 고정 방식: 가장 낮은 빈 티어)
  const nextBuyTier = getNextBuyTier(holdings);

  if (nextBuyTier !== null) {
    const tierIndex = nextBuyTier - 1;
    // Decimal로 티어 비율 및 할당 금액 계산
    const tierRatio = new Decimal(tierRatios[tierIndex]).div(100);
    const allocatedSeed = new Decimal(seedCapital).mul(tierRatio).toNumber();

    if (allocatedSeed > 0) {
      const buyPrice = calculateBuyLimitPrice(closePrice, buyThreshold);
      const shares = calculateBuyQuantity(allocatedSeed, buyPrice);

      if (shares > 0) {
        const order = await createDailyOrder(accountId, {
          date,
          tier: nextBuyTier,
          type: "BUY" as OrderType,
          orderMethod: "LOC" as OrderMethod,
          limitPrice: buyPrice,
          shares,
        });
        orders.push(order);
      }
    }
  }

  return orders;
}

/**
 * 다음 매수할 티어 번호 반환 (티어 고정 방식)
 * 티어 1-6 중 가장 낮은 빈 티어를 반환
 * 티어 1-6이 모두 활성화되고 예수금이 있으면 티어 7(예비) 반환
 */
function getNextBuyTier(holdings: TierHolding[]): number | null {
  const activeTiers = new Set(holdings.filter((h) => h.shares > 0).map((h) => h.tier));

  // 티어 1-6 중 가장 낮은 빈 티어 찾기
  for (let i = 1; i <= BASE_TIER_COUNT; i++) {
    if (!activeTiers.has(i)) {
      return i;
    }
  }

  // 티어 1-6 모두 보유 중이면 예비 티어(7) 반환
  if (!activeTiers.has(RESERVE_TIER_NUMBER)) {
    return RESERVE_TIER_NUMBER;
  }

  return null; // 모든 티어 보유 중
}

// =====================================================
// 주문 체결 처리
// =====================================================

export interface ExecutionResult {
  orderId: string;
  tier: number;
  type: "BUY" | "SELL";
  executed: boolean;
  limitPrice: number;
  closePrice: number;
  shares: number;
}

/**
 * 당일 주문 체결 처리
 * - 종가 기준으로 체결 여부 판정
 * - 체결된 주문은 tier_holdings 업데이트
 * - LOC 매수: 종가 <= 지정가 → 체결 (종가로 매수)
 * - LOC 매도: 종가 >= 지정가 → 체결 (종가로 매도)
 *
 * @param accountId - 계좌 ID
 * @param date - 체결 처리할 날짜
 * @param ticker - 종목
 * @returns 체결 결과 목록
 */
export async function processOrderExecution(
  accountId: string,
  date: string,
  ticker: Ticker
): Promise<ExecutionResult[]> {
  // 당일 종가 조회
  const closePrice = await getClosingPrice(ticker, date);
  if (!closePrice) {
    return []; // 종가 데이터 없으면 체결 처리 불가
  }

  // 당일 주문 조회
  const orders = await getDailyOrders(accountId, date);
  const results: ExecutionResult[] = [];
  // 이번에 새로 체결된 매도 여부 추적 (이미 체결된 주문은 제외)
  let hasNewSellExecution = false;

  for (const order of orders) {
    // 이미 체결된 주문은 스킵 (결과에만 포함, 사이클 완료 체크에서 제외)
    if (order.executed) {
      results.push({
        orderId: order.id,
        tier: order.tier,
        type: order.type,
        executed: true,
        limitPrice: order.limitPrice,
        closePrice,
        shares: order.shares,
      });
      continue;
    }

    let shouldExecute = false;

    if (order.orderMethod === "MOC") {
      // MOC 주문: 무조건 체결 (손절용)
      shouldExecute = true;
    } else if (order.type === "BUY") {
      shouldExecute = shouldExecuteBuy(closePrice, order.limitPrice);
    } else {
      shouldExecute = shouldExecuteSell(closePrice, order.limitPrice);
    }

    if (shouldExecute) {
      // 주문 체결 처리
      await updateOrderExecuted(order.id, true);

      if (order.type === "BUY") {
        // 매수 체결: 티어에 보유 정보 추가
        const sellThreshold = percentToThreshold(
          SELL_THRESHOLDS[await getAccountStrategy(accountId)]
        );
        const sellTargetPrice = calculateSellLimitPrice(closePrice, sellThreshold);

        await updateTierHolding(accountId, order.tier, {
          buyPrice: closePrice,
          shares: order.shares,
          buyDate: date,
          sellTargetPrice,
        });
      } else {
        // 매도 체결: 수익 기록 생성 후 티어 보유 정보 초기화
        // 티어 초기화 전에 현재 보유 정보로 수익 기록 생성
        const holdings = await getTierHoldings(accountId);
        const tierHolding = holdings.find((h) => h.tier === order.tier);

        if (tierHolding && tierHolding.buyPrice && tierHolding.buyDate && tierHolding.shares > 0) {
          const strategy = await getAccountStrategy(accountId);
          await createProfitRecord({
            accountId,
            tier: order.tier,
            ticker,
            strategy,
            buyDate: tierHolding.buyDate,
            buyPrice: tierHolding.buyPrice,
            buyQuantity: tierHolding.shares,
            sellDate: date,
            sellPrice: closePrice,
          });
        }

        // 티어 보유 정보 초기화
        await updateTierHolding(accountId, order.tier, {
          buyPrice: null,
          shares: 0,
          buyDate: null,
          sellTargetPrice: null,
        });

        // 이번에 새로 체결된 매도 표시
        hasNewSellExecution = true;
      }
    }

    results.push({
      orderId: order.id,
      tier: order.tier,
      type: order.type,
      executed: shouldExecute,
      limitPrice: order.limitPrice,
      closePrice,
      shares: order.shares,
    });
  }

  // 이번에 새로 체결된 매도가 있으면 사이클 완료 여부 확인
  // (이미 체결된 주문은 제외하여 중복 사이클 증가 방지)
  if (hasNewSellExecution) {
    const remainingShares = await getTotalShares(accountId);
    if (remainingShares === 0) {
      // 모든 티어가 비었으면 사이클 완료
      await completeCycleAndIncrement(accountId);
    }
  }

  return results;
}

/**
 * 계좌의 전략 조회 (내부 헬퍼)
 */
async function getAccountStrategy(accountId: string): Promise<Strategy> {
  const rows = await db
    .select({ strategy: tradingAccounts.strategy })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.id, accountId))
    .limit(1);

  if (!rows[0]) {
    throw new Error(`Account not found: ${accountId}`);
  }
  return rows[0].strategy as Strategy;
}

/**
 * 사이클 완료 시 cycleNumber 증가
 * 모든 티어가 비었을 때 호출되어 다음 사이클을 준비
 *
 * @param accountId - 계좌 ID
 * @returns 업데이트된 cycleNumber, 계좌가 없으면 null
 */
export async function completeCycleAndIncrement(accountId: string): Promise<number | null> {
  // 1. 현재 cycle_number 조회
  const rows = await db
    .select({ cycleNumber: tradingAccounts.cycleNumber })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.id, accountId))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  // 2. cycle_number 증가
  const newCycleNumber = rows[0].cycleNumber + 1;
  await db
    .update(tradingAccounts)
    .set({ cycleNumber: newCycleNumber, updatedAt: new Date() })
    .where(eq(tradingAccounts.id, accountId));

  return newCycleNumber;
}

/**
 * 이전 거래일 미체결 주문 체결 처리
 * REQ-001: 오늘 주문 조회 시 이전 거래일 미체결 주문 자동 체결
 * CON-001: 종가 데이터가 없으면 체결하지 않음
 * CON-002: 이미 체결된 주문은 다시 체결하지 않음 (processOrderExecution에서 처리)
 *
 * @param accountId - 계좌 ID
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param ticker - 종목
 * @returns 체결 결과 목록
 */
export async function processPreviousDayExecution(
  accountId: string,
  currentDate: string,
  ticker: Ticker
): Promise<ExecutionResult[]> {
  // 1. 이전 거래일 계산 (주말 제외)
  const prevDate = getPreviousTradingDate(currentDate);

  // 2. 이전 거래일 종가 확인 (CON-001 준수: 종가 없으면 체결 불가)
  const closePrice = await getClosingPrice(ticker, prevDate);
  if (!closePrice) {
    return [];
  }

  // 3. 이전 거래일 미체결 주문 조회
  const orders = await getDailyOrders(accountId, prevDate);
  const hasUnexecutedOrders = orders.some((o) => !o.executed);

  if (!hasUnexecutedOrders) {
    return [];
  }

  // 4. 체결 처리 (기존 함수 재사용, CON-002 준수: 이미 체결된 주문은 스킵됨)
  return await processOrderExecution(accountId, prevDate, ticker);
}

/**
 * 사이클 시작일부터 어제까지의 모든 주문을 순차적으로 처리
 * - 각 거래일에 대해 주문이 없으면 생성하고, 체결 조건을 확인하여 처리
 * - 체결 결과에 따라 holdings가 업데이트되므로 순차 처리 필수
 *
 * @param accountId - 계좌 ID
 * @param cycleStartDate - 사이클 시작일 (YYYY-MM-DD)
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param ticker - 종목
 * @param strategy - 전략
 * @param seedCapital - 시드 캐피털
 * @returns 전체 체결 결과 목록
 */
export async function processHistoricalOrders(
  accountId: string,
  cycleStartDate: string,
  currentDate: string,
  ticker: Ticker,
  strategy: Strategy,
  seedCapital: number
): Promise<ExecutionResult[]> {
  const allResults: ExecutionResult[] = [];

  // 사이클 시작일부터 어제까지의 모든 거래일 순회
  let processingDate = cycleStartDate;
  const yesterday = getPreviousTradingDate(currentDate);

  // 종료 조건: processingDate > yesterday
  while (processingDate <= yesterday) {
    // 1. 해당 날짜의 종가 확인
    const closePrice = await getClosingPrice(ticker, processingDate);

    if (closePrice) {
      // 2. 해당 날짜의 주문 조회
      let orders = await getDailyOrders(accountId, processingDate);

      // 3. 주문이 없으면 생성 (현재 holdings 상태 기준)
      if (orders.length === 0) {
        const holdings = await getTierHoldings(accountId);
        orders = await generateDailyOrders(
          accountId,
          processingDate,
          ticker,
          strategy,
          seedCapital,
          holdings
        );
      }

      // 4. 미체결 주문이 있으면 체결 처리
      const hasUnexecutedOrders = orders.some((o) => !o.executed);
      if (hasUnexecutedOrders) {
        const results = await processOrderExecution(accountId, processingDate, ticker);
        allResults.push(...results);
      }
    }

    // 5. 다음 거래일로 이동
    processingDate = getNextTradingDate(processingDate);
  }

  return allResults;
}

/**
 * 다음 거래일 계산 (주말 제외)
 */
function getNextTradingDate(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setDate(d.getDate() + 1);

  // 주말이면 월요일로 이동
  const dayOfWeek = d.getUTCDay();
  if (dayOfWeek === 0) {
    // Sunday -> Monday
    d.setDate(d.getDate() + 1);
  } else if (dayOfWeek === 6) {
    // Saturday -> Monday
    d.setDate(d.getDate() + 2);
  }

  return d.toISOString().split("T")[0];
}

// =====================================================
// Profit Records CRUD (SPEC-TRADING-002)
// =====================================================

/**
 * 수익 기록 생성
 * 매도 체결 시 호출되어 수익 기록을 저장
 * Decimal.js로 정밀한 금융 계산 수행
 */
export async function createProfitRecord(data: {
  accountId: string;
  tier: number;
  ticker: Ticker;
  strategy: Strategy;
  buyDate: string;
  buyPrice: number;
  buyQuantity: number;
  sellDate: string;
  sellPrice: number;
}): Promise<ProfitRecord> {
  // Decimal.js로 정밀한 금융 계산
  const buyAmount = new Decimal(data.buyPrice)
    .mul(data.buyQuantity)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  const sellAmount = new Decimal(data.sellPrice)
    .mul(data.buyQuantity)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  const profit = new Decimal(sellAmount)
    .minus(buyAmount)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // 수익률 계산: (매도금액 - 매수금액) / 매수금액 * 100
  const profitRate = new Decimal(profit)
    .div(buyAmount)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  const result = await db
    .insert(profitRecords)
    .values({
      accountId: data.accountId,
      tier: data.tier,
      ticker: data.ticker,
      strategy: data.strategy,
      buyDate: data.buyDate,
      buyPrice: data.buyPrice,
      buyQuantity: data.buyQuantity,
      sellDate: data.sellDate,
      sellPrice: data.sellPrice,
      buyAmount,
      sellAmount,
      profit,
      profitRate,
    })
    .returning();

  return mapDrizzleProfitRecord(result[0]);
}

/**
 * 계좌의 모든 수익 기록 조회
 */
export async function getProfitRecords(accountId: string): Promise<ProfitRecord[]> {
  const rows = await db
    .select()
    .from(profitRecords)
    .where(eq(profitRecords.accountId, accountId))
    .orderBy(desc(profitRecords.sellDate));

  return rows.map(mapDrizzleProfitRecord);
}

interface ProfitAggregate {
  totalTrades: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalProfit: number;
  averageProfitRate: number;
}

/**
 * 수익 기록들의 합계 계산 (Decimal.js 정밀도)
 */
function aggregateProfits(records: ProfitRecord[]): ProfitAggregate {
  let buyAmount = new Decimal(0);
  let sellAmount = new Decimal(0);
  let profit = new Decimal(0);

  for (const record of records) {
    buyAmount = buyAmount.plus(record.buyAmount);
    sellAmount = sellAmount.plus(record.sellAmount);
    profit = profit.plus(record.profit);
  }

  const averageProfitRate = buyAmount.isZero()
    ? 0
    : profit.div(buyAmount).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  return {
    totalTrades: records.length,
    totalBuyAmount: buyAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalSellAmount: sellAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalProfit: profit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    averageProfitRate,
  };
}

/**
 * 수익 기록을 월별로 그룹화하여 요약 생성
 */
export async function groupProfitsByMonth(accountId: string): Promise<ProfitStatusResponse> {
  const records = await getProfitRecords(accountId);

  // 월별로 그룹화
  const monthlyMap = new Map<string, ProfitRecord[]>();
  for (const record of records) {
    const yearMonth = record.sellDate.substring(0, 7);
    const monthRecords = monthlyMap.get(yearMonth) ?? [];
    monthRecords.push(record);
    monthlyMap.set(yearMonth, monthRecords);
  }

  // 월별 요약 생성 (과거 월 우선)
  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  const months: MonthlyProfitSummary[] = sortedMonths.map((yearMonth) => {
    const monthRecords = monthlyMap.get(yearMonth)!;
    const aggregate = aggregateProfits(monthRecords);
    return {
      yearMonth,
      records: monthRecords,
      ...aggregate,
    };
  });

  // 전체 총계 계산
  const grandTotal = aggregateProfits(records);

  return {
    accountId,
    months,
    grandTotal,
  };
}
