/**
 * Cron 엔드포인트: 활성 계좌 일일 마감 처리
 * GET /api/cron/process-daily-orders
 *
 * 어느 계좌를 얼마나 처리할지에 대한 스케줄러 정책(활성 계좌 판정, 시간 예산,
 * 계좌별 실패 격리, 시간 초과 시 이월)은 src/trading의 processDailyClose가 소유한다.
 * 이 라우트는 인증, 파라미터 파싱, 응답 매핑만 한다.
 *
 * 가격 데이터가 선행되어야 하므로 update-prices cron 직후 실행됩니다.
 *
 * Query params:
 *   - accountId: 지정 시 활동 여부와 무관하게 해당 계좌만 처리
 *     (최초 catch-up 시 특정 계좌 집중 처리용)
 *
 * 인증: Authorization: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from "next/server";

import { requireCronAuth } from "@/lib/api-utils";
import { processDailyClose } from "@/trading";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/cron/process-daily-orders */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = requireCronAuth(request);
  if (authError) {
    return authError;
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  const outcome = await processDailyClose({ accountId });

  if (outcome.status === "account-not-found") {
    return NextResponse.json({ error: `Account not found: ${outcome.accountId}` }, { status: 404 });
  }

  return NextResponse.json(
    {
      success: outcome.failedCount === 0,
      processedAt: new Date().toISOString(),
      accountCount: outcome.accountCount,
      processedCount: outcome.processedCount,
      skippedCount: outcome.skippedCount,
      results: outcome.results,
    },
    { status: 200 }
  );
}
