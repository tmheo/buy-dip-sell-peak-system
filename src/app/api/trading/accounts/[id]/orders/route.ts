/**
 * 당일 주문표 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id]/orders - 당일 주문표 조회
 * POST /api/trading/accounts/[id]/orders - 주문 체결 처리
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getTradingAccountById,
  getTierHoldings,
  getDailyOrders,
  generateDailyOrders,
  processOrderExecution,
  deleteDailyOrders,
  processPreviousDayExecution,
} from "@/database/trading";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/trading/accounts/[id]/orders
 * 당일 주문표 조회
 * Query params:
 *   - date: 조회할 날짜 (YYYY-MM-DD, 기본값: 오늘)
 *   - regenerate: true면 기존 주문 삭제 후 재생성
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
  const regenerate = url.searchParams.get("regenerate") === "true";
  const date = dateParam || new Date().toISOString().split("T")[0];

  // 날짜 형식 검증
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }

  // [REQ-001] 이전 거래일 미체결 주문 체결 처리
  // 오늘 주문 조회 전에 이전 거래일의 미체결 주문을 먼저 체결 처리
  const executedPreviousOrders = processPreviousDayExecution(id, date, account.ticker);

  // regenerate 옵션이면 기존 주문 삭제
  if (regenerate) {
    deleteDailyOrders(id, date);
  }

  // 기존 주문 조회 (체결 처리로 업데이트된 holdings 기반)
  let orders = getDailyOrders(id, date);

  // 계좌 설정 변경 감지: 미체결 주문이 있고, 계좌가 주문 생성 이후 수정되었으면 재생성
  if (orders.length > 0) {
    const hasExecutedOrder = orders.some((order) => order.executed);
    const oldestOrderCreatedAt = orders.reduce(
      (min, order) => (order.createdAt < min ? order.createdAt : min),
      orders[0].createdAt
    );

    // 체결된 주문이 없고, 계좌가 주문 생성 이후 수정되었으면 재생성
    if (!hasExecutedOrder && account.updatedAt > oldestOrderCreatedAt) {
      deleteDailyOrders(id, date);
      orders = [];
    }
  }

  // 주문이 없으면 자동 생성
  if (orders.length === 0) {
    const holdings = getTierHoldings(id);
    orders = generateDailyOrders(
      id,
      date,
      account.ticker,
      account.strategy,
      account.seedCapital,
      holdings
    );
  }

  return NextResponse.json({
    date,
    orders,
    executedPreviousOrders, // [REQ-001] 이전 거래일 체결 결과
  });
}

/**
 * POST /api/trading/accounts/[id]/orders
 * 주문 체결 처리 (종가 기준)
 * Body:
 *   - date: 체결 처리할 날짜 (YYYY-MM-DD)
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  // Body 파싱
  const body = await request.json();
  const date = body.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }

  // 주문 체결 처리
  const results = processOrderExecution(id, date, account.ticker);

  return NextResponse.json({
    date,
    results,
  });
}
