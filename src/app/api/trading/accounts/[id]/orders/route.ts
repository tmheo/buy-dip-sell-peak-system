/**
 * 당일 주문표 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id]/orders - 당일 주문표
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTradingAccountById, getDailyOrders } from "@/database/trading";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/trading/accounts/[id]/orders
 * 당일 주문표 조회
 * Query params:
 *   - date: 조회할 날짜 (YYYY-MM-DD, 기본값: 오늘)
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 본인 계좌 확인
  const account = getTradingAccountById(id, session.user.id);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // 날짜 파라미터 파싱
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam || new Date().toISOString().split("T")[0];

  // 날짜 형식 검증
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }

  const orders = getDailyOrders(id, date);

  return NextResponse.json({
    date,
    orders,
  });
}
