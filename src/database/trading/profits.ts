/**
 * 수익 기록 CRUD 함수 (SPEC-TRADING-002)
 */

import Decimal from "decimal.js";
import { and, asc, eq, sum } from "drizzle-orm";

import { db, type DbExecutor } from "../db-drizzle";
import { profitRecords } from "../schema/index";

import type {
  ProfitRecord,
  Ticker,
  Strategy,
  MonthlyProfitSummary,
  ProfitStatusResponse,
} from "@/types/trading";

import type { Execution, TierHolding as StrategyTierHolding } from "@/strategy";

import { mapDrizzleProfitRecord } from "./mappers";

export interface ProfitAggregate {
  totalTrades: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalProfit: number;
  averageProfitRate: number;
}

/**
 * 수익 기록 한 건의 출처: 보유 티어 하나와 그 티어를 판 settle의 매도 체결
 */
export interface SettledSale {
  accountId: string;
  ticker: Ticker;
  strategy: Strategy;
  // 체결 시점(사이클 완료 처리 전)의 계좌 사이클 번호
  cycleNumber: number;
  // 매도 체결일
  sellDate: string;
  // 판 보유 티어 (settle에 넘긴 상태의 것)
  holding: Pick<StrategyTierHolding, "tier" | "buyDate" | "buyPrice" | "shares">;
  // settle이 낸 매도 체결
  execution: Execution;
}

/**
 * 수익 기록 생성
 * 매도 체결 시 호출되어 수익 기록을 저장한다.
 * 매도가·매도금액·손익은 체결 판정(src/strategy의 settle)이 낸 체결을 그대로 남긴다 -
 * 예수금 계산이 보는 실현손익과 기록이 어긋나지 않게 하려는 것이다 (#97).
 * 매수금액은 보유 티어의 매수가 × 수량이다(가격이 소수 둘째 자리라 정확히 떨어진다).
 */
export async function createProfitRecord(
  sale: SettledSale,
  executor: DbExecutor = db
): Promise<ProfitRecord> {
  const { holding, execution } = sale;
  if (execution.order.type !== "SELL") {
    throw new Error(`Tier ${execution.order.tier} execution is not a sell`);
  }
  if (execution.order.tier !== holding.tier) {
    throw new Error(
      `Sell execution for tier ${execution.order.tier} does not match holding tier ${holding.tier}`
    );
  }
  // 매도는 티어를 통째로 없애므로 체결 수량은 보유 수량과 같다. 다르면 매수금액(보유 수량)과
  // 매도금액·손익(체결 수량)이 서로 다른 주식을 가리킨다.
  if (execution.order.shares !== holding.shares) {
    throw new Error(
      `Sell execution for tier ${holding.tier} has ${execution.order.shares} shares but holding has ${holding.shares}`
    );
  }
  if (execution.profit === undefined) {
    throw new Error(`Sell execution for tier ${holding.tier} has no profit`);
  }

  const buyAmount = new Decimal(holding.buyPrice).mul(holding.shares);

  // 수익률 계산: 손익 / 매수금액 * 100
  const profitRate = new Decimal(execution.profit)
    .div(buyAmount)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  const result = await executor
    .insert(profitRecords)
    .values({
      accountId: sale.accountId,
      cycleNumber: sale.cycleNumber,
      tier: holding.tier,
      ticker: sale.ticker,
      strategy: sale.strategy,
      buyDate: holding.buyDate,
      buyPrice: holding.buyPrice,
      buyQuantity: holding.shares,
      sellDate: sale.sellDate,
      sellPrice: execution.price,
      buyAmount: buyAmount.toNumber(),
      sellAmount: execution.amount,
      profit: execution.profit,
      profitRate,
    })
    .returning();

  return mapDrizzleProfitRecord(result[0]);
}

/**
 * 한 사이클의 실현손익 합계
 * 그 계좌에서 cycle_number가 주어진 사이클 번호인 수익 기록의 손익을 더한다.
 * 계좌의 지금 사이클 번호를 넘기면 이번 사이클 실현손익이 된다 (ADR-0003).
 * 매도 기록이 없으면 0이다.
 *
 * 운용 시작일(cycle_start_date) 이후 매도로 구분하지 않는다 - 이 값은 첫 사이클의 시작일이라
 * 사이클이 완료돼도 바뀌지 않아 앞선 사이클의 손익이 섞인다 (#97).
 */
export async function getCycleRealizedPnl(
  accountId: string,
  cycleNumber: number,
  executor: DbExecutor = db
): Promise<number> {
  const rows = await executor
    .select({ total: sum(profitRecords.profit) })
    .from(profitRecords)
    .where(and(eq(profitRecords.accountId, accountId), eq(profitRecords.cycleNumber, cycleNumber)));

  // numeric 합계는 문자열로 오고, 기록이 없으면 NULL이다
  return rows[0]?.total == null ? 0 : Number(rows[0].total);
}

/**
 * 계좌의 모든 수익 기록 조회
 */
export async function getProfitRecords(accountId: string): Promise<ProfitRecord[]> {
  const rows = await db
    .select()
    .from(profitRecords)
    .where(eq(profitRecords.accountId, accountId))
    .orderBy(asc(profitRecords.sellDate), asc(profitRecords.buyDate));

  return rows.map(mapDrizzleProfitRecord);
}

/**
 * 수익 기록들의 합계 계산 (Decimal.js 정밀도)
 */
export function aggregateProfits(records: ProfitRecord[]): ProfitAggregate {
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
