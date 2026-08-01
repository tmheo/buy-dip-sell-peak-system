/**
 * Cron 엔드포인트: 일일 가격/지표 동기화
 * GET /api/cron/update-prices
 *
 * Vercel Cron 또는 외부 스케줄러에서 호출하여 SOXL, TQQQ의 가격 시계열을
 * 원천(Yahoo Finance) 스냅샷 전체와 정합시키고 지표를 재계산합니다(ADR-0002).
 * 분할 가드 발동·티커 실패가 하나라도 있으면 비 2xx로 응답해
 * 스케줄러(GitHub Actions) 알림을 유발합니다.
 *
 * 페치 재시도는 동기화 서비스 내부에 있고, DB 쓰기는 재시도하지 않습니다 -
 * 미러링은 멱등이라 실패한 날은 알림 후 다음 실행에서 자가 치유됩니다.
 *
 * 인증: Authorization: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from "next/server";

import { requireCronAuth } from "@/lib/api-utils";
import { syncTickerPrices } from "@/services/priceSyncService";
import type { TickerSyncSummary } from "@/services/priceSyncService";
import type { SupportedTicker } from "@/services/dataFetcher";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 대상 티커 목록 */
const TICKERS: SupportedTicker[] = ["SOXL", "TQQQ"];

/** 티커별 동기화 결과 (응답 JSON에 그대로 직렬화) */
type TickerSyncResult =
  | TickerSyncSummary
  | { status: "error"; ticker: SupportedTicker; message: string };

/**
 * 단일 티커 동기화. 실패해도 던지지 않고 결과로 기록해
 * 다른 티커의 동기화가 계속되게 합니다.
 */
async function syncTickerSafely(ticker: SupportedTicker): Promise<TickerSyncResult> {
  try {
    return await syncTickerPrices(ticker);
  } catch (error) {
    console.error(`[${ticker}] 동기화 실패:`, error);
    return {
      status: "error",
      ticker,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** GET /api/cron/update-prices */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = requireCronAuth(request);
  if (authError) {
    return authError;
  }

  console.log("=== 일일 가격/지표 동기화 시작 ===");
  const startTime = Date.now();

  const results: TickerSyncResult[] = [];

  // 각 티커에 대해 순차적으로 동기화 (Yahoo Finance Rate Limit 방지)
  for (const ticker of TICKERS) {
    console.log(`--- ${ticker} 동기화 시작 ---`);
    results.push(await syncTickerSafely(ticker));
    console.log(`--- ${ticker} 동기화 완료 ---`);
  }

  const success = results.every((r) => r.status === "synced");
  const elapsed = Date.now() - startTime;
  console.log(`=== 동기화 ${success ? "완료" : "실패"} (${elapsed}ms) ===`);

  return NextResponse.json(
    {
      success,
      updatedAt: new Date().toISOString(),
      results,
    },
    { status: success ? 200 : 500 }
  );
}
