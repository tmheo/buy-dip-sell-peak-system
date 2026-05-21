/**
 * 트레이딩 계좌 API (PRD-TRADING-001)
 * GET /api/trading/accounts - 사용자의 모든 계좌 목록
 * POST /api/trading/accounts - 새 계좌 생성
 */

import { NextResponse } from "next/server";
import {
  getAuthUserId,
  unauthorizedResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api-utils";
import {
  createTradingAccount,
  getTradingAccountsByUserId,
  getTierHoldings,
  getTotalShares,
  processHistoricalOrders,
} from "@/database/trading";
import { CreateTradingAccountSchema } from "@/lib/validations/trading";

/**
 * GET /api/trading/accounts
 * 사용자의 모든 계좌 목록 조회
 */
export async function GET(): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const accounts = await getTradingAccountsByUserId(userId);
  const accountsWithHoldings = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      holdings: await getTierHoldings(account.id),
      totalShares: await getTotalShares(account.id),
    }))
  );
  return NextResponse.json({ accounts: accountsWithHoldings });
}

/**
 * POST /api/trading/accounts
 * 새 계좌 생성
 */
export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const parsed = CreateTradingAccountSchema.safeParse(body);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten());
    }

    const account = await createTradingAccount(userId, parsed.data);

    // 사이클 시작일이 과거인 경우, 다음 마감 처리 cron 실행 전까지의 공백을 메우기 위해
    // 생성 직후 일회성으로 과거 거래일 마감 처리를 수행한다.
    // 실패하더라도 계좌 생성 자체는 성공으로 응답한다 (cron이 자동으로 따라잡음).
    try {
      const today = new Date().toISOString().split("T")[0];
      await processHistoricalOrders(
        account.id,
        account.cycleStartDate,
        today,
        account.ticker,
        account.strategy,
        account.seedCapital
      );
    } catch (error) {
      console.error(`[${account.id}] 계좌 생성 후 초기 마감 처리 실패:`, error);
    }

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Failed to create trading account:", error);
    return serverErrorResponse();
  }
}
