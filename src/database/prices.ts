/**
 * 가격 데이터 CRUD 함수 (Drizzle ORM for PostgreSQL)
 * - insertDailyPrices: 일봉 데이터 일괄 삽입
 * - getLatestDate: 가장 최근 날짜 조회
 * - getPriceRange: 날짜 범위 조회
 * - getPriceByDate: 특정 날짜 조회
 * - getAllPricesByTicker: 티커별 전체 조회
 * - getLatestPrices: 최근 N일 조회
 */

import { eq, and, between, desc, asc } from "drizzle-orm";
import { db } from "./db-drizzle";
import { dailyPrices } from "./schema/index";
import type { DailyPrice, NewDailyPrice } from "./schema/index";

/**
 * 여러 가격 데이터 일괄 삽입 (중복 무시)
 * @param data - 삽입할 가격 데이터 배열
 */
export async function insertDailyPrices(data: NewDailyPrice[]): Promise<void> {
  if (data.length === 0) return;

  // onConflictDoNothing: ticker + date 유니크 인덱스 충돌 시 무시
  await db.insert(dailyPrices).values(data).onConflictDoNothing();
}

/**
 * 가장 최근 저장된 날짜 조회
 * @param ticker - 조회할 티커 (기본값: SOXL)
 * @returns 가장 최근 날짜 (YYYY-MM-DD) 또는 null
 */
export async function getLatestDate(ticker: string = "SOXL"): Promise<string | null> {
  const rows = await db
    .select({ date: dailyPrices.date })
    .from(dailyPrices)
    .where(eq(dailyPrices.ticker, ticker))
    .orderBy(desc(dailyPrices.date))
    .limit(1);

  return rows.length > 0 ? rows[0].date : null;
}

/**
 * 날짜 범위로 가격 데이터 조회
 * @param ticker - 조회할 티커
 * @param startDate - 시작 날짜 (YYYY-MM-DD)
 * @param endDate - 종료 날짜 (YYYY-MM-DD)
 * @returns 가격 데이터 배열 (날짜 오름차순)
 */
export async function getPriceRange(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<DailyPrice[]> {
  const rows = await db
    .select()
    .from(dailyPrices)
    .where(and(eq(dailyPrices.ticker, ticker), between(dailyPrices.date, startDate, endDate)))
    .orderBy(asc(dailyPrices.date));

  return rows;
}

/**
 * 특정 날짜의 가격 데이터 조회
 * @param ticker - 조회할 티커
 * @param date - 조회할 날짜 (YYYY-MM-DD)
 * @returns 가격 데이터 또는 null
 */
export async function getPriceByDate(ticker: string, date: string): Promise<DailyPrice | null> {
  const rows = await db
    .select()
    .from(dailyPrices)
    .where(and(eq(dailyPrices.ticker, ticker), eq(dailyPrices.date, date)))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * 특정 티커의 모든 가격 데이터 조회
 * @param ticker - 조회할 티커 (기본값: SOXL)
 * @returns 가격 데이터 배열 (날짜 오름차순)
 */
export async function getAllPricesByTicker(ticker: string = "SOXL"): Promise<DailyPrice[]> {
  const rows = await db
    .select()
    .from(dailyPrices)
    .where(eq(dailyPrices.ticker, ticker))
    .orderBy(asc(dailyPrices.date));

  return rows;
}

/**
 * 최근 N일 가격 데이터 조회 (날짜 내림차순)
 * @param ticker - 조회할 티커
 * @param limit - 조회할 일수
 * @returns 날짜와 수정종가 배열
 */
export async function getLatestPrices(
  ticker: string,
  limit: number
): Promise<{ date: string; adjClose: number }[]> {
  const rows = await db
    .select({
      date: dailyPrices.date,
      adjClose: dailyPrices.adjClose,
    })
    .from(dailyPrices)
    .where(eq(dailyPrices.ticker, ticker))
    .orderBy(desc(dailyPrices.date))
    .limit(limit);

  return rows;
}
