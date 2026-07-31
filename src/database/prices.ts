/**
 * 가격 데이터 CRUD 함수 (Drizzle ORM for PostgreSQL)
 * - upsertDailyPrices: 일봉 데이터 일괄 upsert
 * - getLatestDate: 가장 최근 날짜 조회
 * - getPriceRange: 날짜 범위 조회
 * - getPriceByDate: 특정 날짜 조회
 * - getAllPricesByTicker: 티커별 전체 조회
 * - getLatestPrices: 최근 N일 조회
 */

import { eq, and, between, desc, asc, count, sql } from "drizzle-orm";
import { db } from "./db-drizzle";
import { dailyPrices } from "./schema/index";
import type { DailyPrice, NewDailyPrice } from "./schema/index";

// PostgreSQL 프로토콜의 파라미터 상한(65535)과 Vercel 함수 시간 제한을 고려한 배치 크기
const UPSERT_CHUNK_SIZE = 500;

/**
 * 여러 가격 데이터 일괄 upsert (ADR-0002: 원천 스냅샷 미러링)
 * ticker + date 충돌 시 open/high/low/close/adjClose/volume을 갱신해
 * 배당 등 원천의 소급 조정이 기존 행에 반영되게 한다.
 * @param data - 삽입/갱신할 가격 데이터 배열
 */
export async function upsertDailyPrices(data: NewDailyPrice[]): Promise<void> {
  for (let i = 0; i < data.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = data.slice(i, i + UPSERT_CHUNK_SIZE);
    await db
      .insert(dailyPrices)
      .values(chunk)
      .onConflictDoUpdate({
        target: [dailyPrices.ticker, dailyPrices.date],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          adjClose: sql`excluded.adj_close`,
          volume: sql`excluded.volume`,
        },
      });
  }
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

  return rows[0]?.date ?? null;
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

  return rows[0] ?? null;
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

/**
 * 특정 티커의 저장된 데이터 수 조회
 * @param ticker - 조회할 티커 (기본값: SOXL)
 * @returns 레코드 수
 */
export async function getCount(ticker: string = "SOXL"): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(dailyPrices)
    .where(eq(dailyPrices.ticker, ticker));

  // PostgreSQL COUNT 결과가 문자열로 반환될 수 있으므로 숫자로 변환
  return Number(rows[0]?.count ?? 0);
}

/**
 * 전체 데이터 수 조회
 * @returns 전체 레코드 수
 */
export async function getTotalCount(): Promise<number> {
  const rows = await db.select({ count: count() }).from(dailyPrices);

  // PostgreSQL COUNT 결과가 문자열로 반환될 수 있으므로 숫자로 변환
  return Number(rows[0]?.count ?? 0);
}
