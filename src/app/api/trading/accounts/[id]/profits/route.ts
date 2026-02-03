/**
 * 수익 현황 API (SPEC-TRADING-002)
 * GET /api/trading/accounts/[id]/profits - 수익 현황 조회
 */

import { NextResponse } from "next/server";
import {
  getAuthUserId,
  unauthorizedResponse,
  notFoundResponse,
  type RouteParams,
} from "@/lib/api-utils";
import { getTradingAccountById, groupProfitsByMonth } from "@/database/trading";

/**
 * GET /api/trading/accounts/[id]/profits
 * 수익 현황 조회 (월별 그룹화)
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  // Verify account ownership
  const account = await getTradingAccountById(id, userId);
  if (!account) {
    return notFoundResponse("Account");
  }

  // Get profit status grouped by month
  const profitStatus = await groupProfitsByMonth(id);

  return NextResponse.json(profitStatus);
}
