/**
 * 수익 기록 CRUD 함수 (SPEC-TRADING-002)
 */

import Decimal from "decimal.js";
import { eq, desc } from "drizzle-orm";

import { db } from "../db-drizzle";
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
