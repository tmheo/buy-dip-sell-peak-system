/**
 * 일일 주문 CRUD 및 주문 생성 함수
 */

import Decimal from "decimal.js";
import { eq, and, desc, asc, lte } from "drizzle-orm";

import { db } from "../db-drizzle";
import { dailyOrders, dailyPrices } from "../schema/index";

import type {
  DailyOrder,
  TierHolding,
  Ticker,
  Strategy,
  OrderType,
  OrderMethod,
} from "@/types/trading";
import { TIER_RATIOS, BUY_THRESHOLDS, SELL_THRESHOLDS, STOP_LOSS_DAYS } from "@/types/trading";

import {
  calculateBuyLimitPrice,
  calculateSellLimitPrice,
  calculateBuyQuantity,
  getPreviousTradingDate,
  calculateTradingDays,
  percentToThreshold,
} from "@/utils/trading-core";

import { mapDrizzleDailyOrder } from "./mappers";
import { BASE_TIER_COUNT, RESERVE_TIER_NUMBER } from "./tier-holdings";

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
 * 다음 매수할 티어 번호 반환 (티어 고정 방식)
 * 티어 1-6 중 가장 낮은 빈 티어를 반환
 * 티어 1-6이 모두 활성화되고 예수금이 있으면 티어 7(예비) 반환
 */
export function getNextBuyTier(holdings: TierHolding[]): number | null {
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

/**
 * 당일 주문 자동 생성
 * - 티어 고정 방식: 가장 낮은 빈 티어에만 매수 주문 (한 번에 하나의 티어만)
 * - 보유 티어: 매도 주문 생성
 * - 트랜잭션으로 삭제/생성 원자성 보장
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
  const stopLossDay = STOP_LOSS_DAYS[strategy];

  // 트랜잭션으로 삭제 + 생성 원자성 보장
  const orders = await db.transaction(async (tx) => {
    const createdOrders: DailyOrder[] = [];

    // 기존 주문 삭제
    await tx
      .delete(dailyOrders)
      .where(and(eq(dailyOrders.accountId, accountId), eq(dailyOrders.date, date)));

    // 1. 보유 중인 티어들의 매도 주문 생성 (손절 또는 일반 매도)
    for (const holding of holdings) {
      if (holding.shares > 0 && holding.buyPrice && holding.buyDate) {
        // 보유일 계산 (거래일 기준, 매수일 포함)
        const holdingDays = calculateTradingDays(holding.buyDate, date);

        if (holdingDays > stopLossDay) {
          // 손절일 도달: MOC 주문 (시장가, 무조건 체결)
          const result = await tx
            .insert(dailyOrders)
            .values({
              accountId,
              date,
              tier: holding.tier,
              type: "SELL" as OrderType,
              orderMethod: "MOC" as OrderMethod,
              limitPrice: closePrice, // MOC는 시장가이므로 종가로 설정
              shares: holding.shares,
              executed: false,
            })
            .returning();
          createdOrders.push(mapDrizzleDailyOrder(result[0]));
        } else {
          // 일반 매도: LOC 주문 (지정가)
          const sellPrice = calculateSellLimitPrice(holding.buyPrice, sellThreshold);
          const result = await tx
            .insert(dailyOrders)
            .values({
              accountId,
              date,
              tier: holding.tier,
              type: "SELL" as OrderType,
              orderMethod: "LOC" as OrderMethod,
              limitPrice: sellPrice,
              shares: holding.shares,
              executed: false,
            })
            .returning();
          createdOrders.push(mapDrizzleDailyOrder(result[0]));
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
          const result = await tx
            .insert(dailyOrders)
            .values({
              accountId,
              date,
              tier: nextBuyTier,
              type: "BUY" as OrderType,
              orderMethod: "LOC" as OrderMethod,
              limitPrice: buyPrice,
              shares,
              executed: false,
            })
            .returning();
          createdOrders.push(mapDrizzleDailyOrder(result[0]));
        }
      }
    }

    return createdOrders;
  });

  return orders;
}
