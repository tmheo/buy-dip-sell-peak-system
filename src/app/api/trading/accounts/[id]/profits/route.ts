/**
 * 수익 현황 API (SPEC-TRADING-002)
 * GET /api/trading/accounts/[id]/profits - 수익 현황 조회
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTradingAccountById, groupProfitsByMonth } from "@/database/trading";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/trading/accounts/[id]/profits
 * 수익 현황 조회 (월별 그룹화)
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify account ownership
  const account = getTradingAccountById(id, session.user.id);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Get profit status grouped by month
  const profitStatus = groupProfitsByMonth(id);

  return NextResponse.json(profitStatus);
}
