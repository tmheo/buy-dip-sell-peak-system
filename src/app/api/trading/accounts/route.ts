/**
 * 트레이딩 계좌 API (PRD-TRADING-001)
 * GET /api/trading/accounts - 사용자의 모든 계좌 목록
 * POST /api/trading/accounts - 새 계좌 생성
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
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
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await getTradingAccountsByUserId(session.user.id);
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
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = CreateTradingAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const account = await createTradingAccount(session.user.id, parsed.data);
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Failed to create trading account:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
