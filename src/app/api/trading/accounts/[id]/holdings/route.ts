/**
 * 티어별 보유 현황 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id]/holdings - 티어별 보유 현황
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTradingAccountById, getTierHoldings, getTotalShares } from "@/database/trading";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/trading/accounts/[id]/holdings
 * 티어별 보유 현황 조회
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 본인 계좌 확인
  const account = await getTradingAccountById(id, session.user.id);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const holdings = await getTierHoldings(id);
  const totalShares = await getTotalShares(id);

  return NextResponse.json({
    holdings,
    totalShares,
    isCycleInProgress: totalShares > 0,
  });
}
