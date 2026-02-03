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
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Failed to create trading account:", error);
    return serverErrorResponse();
  }
}
