/**
 * 티어별 보유 현황 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id]/holdings - 티어별 보유 현황
 */

import { NextResponse } from "next/server";
import {
  getAuthUserId,
  unauthorizedResponse,
  notFoundResponse,
  type RouteParams,
} from "@/lib/api-utils";
import { getTradingAccountById, getTierHoldings, getTotalShares } from "@/database/trading";

/**
 * GET /api/trading/accounts/[id]/holdings
 * 티어별 보유 현황 조회
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  // 본인 계좌 확인
  const account = await getTradingAccountById(id, userId);
  if (!account) {
    return notFoundResponse("Account");
  }

  const holdings = await getTierHoldings(id);
  const totalShares = await getTotalShares(id);

  return NextResponse.json({
    holdings,
    totalShares,
    isCycleInProgress: totalShares > 0,
  });
}
