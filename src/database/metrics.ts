/**
 * 기술적 지표 CRUD 함수 (Drizzle ORM for PostgreSQL)
 * - insertMetrics: 지표 데이터 일괄 삽입
 * - getMetricsByDate: 특정 날짜 지표 조회
 * - getMetricsRange: 날짜 범위 지표 조회
 * - getLatestMetricDate: 가장 최근 지표 날짜 조회
 */

import { eq, and, between, desc, asc } from "drizzle-orm";
import { db } from "./db-drizzle";
import { dailyMetrics } from "./schema/index";
import type { DailyMetric, NewDailyMetric } from "./schema/index";

/**
 * 여러 기술적 지표 데이터 일괄 삽입 (중복 무시)
 * @param data - 삽입할 지표 데이터 배열
 */
export async function insertMetrics(data: NewDailyMetric[]): Promise<void> {
  if (data.length === 0) return;

  // onConflictDoNothing: ticker + date 유니크 인덱스 충돌 시 무시
  await db.insert(dailyMetrics).values(data).onConflictDoNothing();
}

/**
 * 특정 날짜의 기술적 지표 조회
 * @param ticker - 조회할 티커
 * @param date - 조회할 날짜 (YYYY-MM-DD)
 * @returns 지표 데이터 또는 null
 */
export async function getMetricsByDate(ticker: string, date: string): Promise<DailyMetric | null> {
  const rows = await db
    .select()
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.ticker, ticker), eq(dailyMetrics.date, date)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * 날짜 범위로 기술적 지표 조회
 * @param ticker - 조회할 티커
 * @param startDate - 시작 날짜 (YYYY-MM-DD)
 * @param endDate - 종료 날짜 (YYYY-MM-DD)
 * @returns 지표 데이터 배열 (날짜 오름차순)
 */
export async function getMetricsRange(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<DailyMetric[]> {
  const rows = await db
    .select()
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.ticker, ticker), between(dailyMetrics.date, startDate, endDate)))
    .orderBy(asc(dailyMetrics.date));

  return rows;
}

/**
 * 가장 최근 저장된 지표 날짜 조회
 * @param ticker - 조회할 티커 (기본값: SOXL)
 * @returns 가장 최근 날짜 (YYYY-MM-DD) 또는 null
 */
export async function getLatestMetricDate(ticker: string = "SOXL"): Promise<string | null> {
  const rows = await db
    .select({ date: dailyMetrics.date })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.ticker, ticker))
    .orderBy(desc(dailyMetrics.date))
    .limit(1);

  return rows[0]?.date ?? null;
}
