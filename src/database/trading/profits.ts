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

import { mapDrizzleProfitRecord } from "./mappers";

export interface ProfitAggregate {
  totalTrades: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalProfit: number;
  averageProfitRate: number;
}

/**
 * 수익 기록 생성
 * 매도 체결 시 호출되어 수익 기록을 저장한다.
 * 매도금액과 손익은 체결 판정(src/strategy의 settle)이 계산한 값을 그대로 받는다 -
 * 예수금 계산이 보는 실현손익과 기록이 어긋나지 않게 하려는 것이다 (#97).
 * 매수금액은 보유 티어의 매수가 × 수량이다(가격이 소수 둘째 자리라 정확히 떨어진다).
 *
 * @param data.cycleNumber - 체결 시점(사이클 완료 처리 전)의 계좌 사이클 번호
 * @param data.sellAmount - 매도 체결 금액 (settle의 execution.amount)
 * @param data.profit - 실현 손익 (settle의 execution.profit)
 */
export async function createProfitRecord(
  data: {
    accountId: string;
    cycleNumber: number;
    tier: number;
    ticker: Ticker;
    strategy: Strategy;
    buyDate: string;
    buyPrice: number;
    buyQuantity: number;
    sellDate: string;
    sellPrice: number;
    sellAmount: number;
    profit: number;
  },
  executor: DbExecutor = db
): Promise<ProfitRecord> {
  const buyAmount = new Decimal(data.buyPrice).mul(data.buyQuantity);

  // 수익률 계산: 손익 / 매수금액 * 100
  const profitRate = new Decimal(data.profit)
    .div(buyAmount)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  const result = await executor
    .insert(profitRecords)
    .values({
      accountId: data.accountId,
      cycleNumber: data.cycleNumber,
      tier: data.tier,
      ticker: data.ticker,
      strategy: data.strategy,
      buyDate: data.buyDate,
      buyPrice: data.buyPrice,
      buyQuantity: data.buyQuantity,
      sellDate: data.sellDate,
      sellPrice: data.sellPrice,
      buyAmount: buyAmount.toNumber(),
      sellAmount: data.sellAmount,
      profit: data.profit,
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
 * 사이클 시작일 이후 매도로 구분하지 않는다 - 사이클이 완료돼도 cycle_start_date는
 * 바뀌지 않아 앞선 사이클의 손익이 섞인다 (#97).
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
