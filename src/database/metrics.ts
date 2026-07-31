/**
 * 기술적 지표 CRUD 함수 (Drizzle ORM for PostgreSQL)
 * - upsertMetrics: 지표 데이터 일괄 upsert
 * - getMetricsByDate: 특정 날짜 지표 조회
 * - getMetricsRange: 날짜 범위 지표 조회
 * - getLatestMetricDate: 가장 최근 지표 날짜 조회
 */

import { eq, and, between, desc, asc, count, sql } from "drizzle-orm";
import { db } from "./db-drizzle";
import { dailyMetrics } from "./schema/index";
import type { DailyMetric, NewDailyMetric } from "./schema/index";

// PostgreSQL 프로토콜의 파라미터 상한(65535)과 Vercel 함수 시간 제한을 고려한 배치 크기
const UPSERT_CHUNK_SIZE = 500;

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

/**
 * 특정 티커의 저장된 지표 데이터 수 조회
 * @param ticker - 조회할 티커 (기본값: SOXL)
 * @returns 레코드 수
 */
export async function getMetricsCount(ticker: string = "SOXL"): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.ticker, ticker));

  // PostgreSQL COUNT 결과가 문자열로 반환될 수 있으므로 숫자로 변환
  return Number(rows[0]?.count ?? 0);
}

/**
 * 기술적 지표 일괄 UPSERT (기존 데이터 갱신)
 * 매일 전체 구간을 재계산해 upsert하므로(ADR-0002) 행 단위가 아닌 배치로 실행한다.
 * @param data - 삽입/갱신할 지표 데이터 배열
 */
export async function upsertMetrics(data: NewDailyMetric[]): Promise<void> {
  for (let i = 0; i < data.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = data.slice(i, i + UPSERT_CHUNK_SIZE);
    await db
      .insert(dailyMetrics)
      .values(chunk)
      .onConflictDoUpdate({
        target: [dailyMetrics.ticker, dailyMetrics.date],
        set: {
          ma20: sql`excluded.ma20`,
          ma60: sql`excluded.ma60`,
          maSlope: sql`excluded.ma_slope`,
          disparity: sql`excluded.disparity`,
          rsi14: sql`excluded.rsi14`,
          roc12: sql`excluded.roc12`,
          volatility20: sql`excluded.volatility20`,
          goldenCross: sql`excluded.golden_cross`,
          isGoldenCross: sql`excluded.is_golden_cross`,
        },
      });
  }
}
