/**
 * 주문 체결 처리 함수
 */

import { eq } from "drizzle-orm";

import { db } from "../db-drizzle";
import { tradingAccounts } from "../schema/index";

import type { Ticker, Strategy } from "@/types/trading";
import { SELL_THRESHOLDS } from "@/types/trading";

import {
  calculateSellLimitPrice,
  shouldExecuteBuy,
  shouldExecuteSell,
  getPreviousTradingDate,
  percentToThreshold,
} from "@/utils/trading-core";

import { getTierHoldings, getTotalShares, updateTierHolding } from "./tier-holdings";
import {
  getDailyOrders,
  getClosingPrice,
  updateOrderExecuted,
  generateDailyOrders,
} from "./orders";
import { createProfitRecord } from "./profits";

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
 * 계좌의 전략 조회 (내부 헬퍼)
 */
export async function getAccountStrategy(accountId: string): Promise<Strategy> {
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

      // 모든 상태 업데이트 이후 체결 표시
      await updateOrderExecuted(order.id, true);
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
 * 다음 거래일 계산 (주말 제외)
 */
export function getNextTradingDate(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setDate(d.getDate() + 1);

  // 주말이면 월요일로 이동
  const dayOfWeek = d.getUTCDay();
  if (dayOfWeek === 0) {
    d.setDate(d.getDate() + 1); // 일요일 -> 월요일
  } else if (dayOfWeek === 6) {
    d.setDate(d.getDate() + 2); // 토요일 -> 월요일
  }

  return d.toISOString().split("T")[0];
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
