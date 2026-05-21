/**
 * Cron 엔드포인트: 전체 계좌 일일 마감 처리
 * GET /api/cron/process-daily-orders
 *
 * 모든 트레이딩 계좌에 대해 미처리 거래일(lastProcessedDate 이후)의
 * 주문 생성 및 체결 처리를 수행하여 holdings/수익 기록을 갱신합니다.
 *
 * 가격 데이터가 선행되어야 하므로 update-prices cron 직후 실행됩니다.
 * processHistoricalOrders는 증분 처리되며 거래일 단위로 진행 상태를
 * 영속화하므로, 시간 예산 초과로 중단되어도 다음 실행이 이어받습니다.
 *
 * Query params:
 *   - accountId: 지정 시 해당 계좌만 처리 (최초 catch-up 시 특정 계좌 집중 처리용)
 *
 * 인증: Authorization: Bearer ${CRON_SECRET}
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getAllTradingAccounts, processHistoricalOrders } from "@/database/trading";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 처리 시간 예산 (ms). Vercel 함수 제한(maxDuration 60초)보다 짧게 잡아
 * FUNCTION_INVOCATION_TIMEOUT(504) 대신 정상 응답으로 종료하고,
 * 남은 작업은 다음 실행이 이어받도록 한다.
 */
const TIME_BUDGET_MS = 50_000;

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

  const accountIdFilter = request.nextUrl.searchParams.get("accountId");

  console.log(
    accountIdFilter
      ? `=== 일일 마감 처리 시작 (계좌 ${accountIdFilter} 한정) ===`
      : "=== 일일 마감 처리 시작 ==="
  );
  const startTime = Date.now();
  const deadline = startTime + TIME_BUDGET_MS;
  const today = new Date().toISOString().split("T")[0];

  let accounts = await getAllTradingAccounts();
  if (accountIdFilter) {
    accounts = accounts.filter((account) => account.id === accountIdFilter);
  }
  const results: Array<{ accountId: string; executed: number; error?: string }> = [];
  let skipped = 0;

  // 한 계좌의 실패가 다른 계좌 처리를 막지 않도록 개별 try/catch
  for (const account of accounts) {
    // 시간 예산 초과 시 남은 계좌는 다음 실행으로 미룬다 (lastProcessedDate로 자가 복구)
    if (Date.now() >= deadline) {
      skipped = accounts.length - results.length;
      break;
    }

    try {
      const executed = await processHistoricalOrders(
        account.id,
        account.cycleStartDate,
        account.lastProcessedDate,
        today,
        account.ticker,
        account.strategy,
        account.seedCapital,
        deadline
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
    `=== 일일 마감 처리 완료 (${elapsed}ms, 계좌 ${accounts.length}개, ` +
      `처리 ${results.length}개, 미처리 ${skipped}개, 실패 ${failed}개) ===`
  );

  return NextResponse.json(
    {
      success: failed === 0,
      processedAt: new Date().toISOString(),
      accountCount: accounts.length,
      processedCount: results.length,
      skippedCount: skipped,
      results,
    },
    { status: 200 }
  );
}
