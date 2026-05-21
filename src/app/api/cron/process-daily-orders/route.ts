/**
 * Cron 엔드포인트: 전체 계좌 일일 마감 처리
 * GET /api/cron/process-daily-orders
 *
 * 모든 트레이딩 계좌에 대해 사이클 시작일부터 어제까지의
 * 주문 생성 및 체결 처리를 수행하여 holdings/수익 기록을 갱신합니다.
 *
 * 가격 데이터가 선행되어야 하므로 update-prices cron 직후 실행됩니다.
 * processHistoricalOrders는 이미 체결된 주문을 스킵하므로 중복 호출에 안전합니다.
 *
 * 인증: Authorization: Bearer ${CRON_SECRET}
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getAllTradingAccounts, processHistoricalOrders } from "@/database/trading";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/cron/process-daily-orders */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // 인증 검증 (타이밍 공격 방지를 위한 timingSafeEqual 사용)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET 환경 변수 미설정");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${cronSecret}`;

  if (
    !authHeader ||
    authHeader.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedToken))
  ) {
    console.warn("Cron 인증 실패: 잘못된 토큰");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("=== 일일 마감 처리 시작 ===");
  const startTime = Date.now();
  const today = new Date().toISOString().split("T")[0];

  const accounts = await getAllTradingAccounts();
  const results: Array<{ accountId: string; executed: number; error?: string }> = [];

  // 한 계좌의 실패가 다른 계좌 처리를 막지 않도록 개별 try/catch
  for (const account of accounts) {
    try {
      const executed = await processHistoricalOrders(
        account.id,
        account.cycleStartDate,
        today,
        account.ticker,
        account.strategy,
        account.seedCapital
      );
      results.push({ accountId: account.id, executed: executed.length });
    } catch (error) {
      console.error(`[${account.id}] 마감 처리 실패:`, error);
      results.push({
        accountId: account.id,
        executed: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const elapsed = Date.now() - startTime;
  const failed = results.filter((r) => r.error).length;
  console.log(
    `=== 일일 마감 처리 완료 (${elapsed}ms, 계좌 ${accounts.length}개, 실패 ${failed}개) ===`
  );

  return NextResponse.json(
    {
      success: failed === 0,
      processedAt: new Date().toISOString(),
      accountCount: accounts.length,
      results,
    },
    { status: 200 }
  );
}
