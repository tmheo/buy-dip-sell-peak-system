/**
 * 당일 주문표 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id]/orders - 당일 주문표 조회
 * POST /api/trading/accounts/[id]/orders - 주문 체결 처리
 */

import { NextResponse } from "next/server";
import {
  getAuthUserId,
  unauthorizedResponse,
  notFoundResponse,
  type RouteParams,
} from "@/lib/api-utils";
import {
  getTradingAccountById,
  getTierHoldings,
  getDailyOrders,
  generateDailyOrders,
  processOrderExecution,
  deleteDailyOrders,
  processHistoricalOrders,
} from "@/database/trading";

/**
 * GET /api/trading/accounts/[id]/orders
 * 당일 주문표 조회
 * Query params:
 *   - date: 조회할 날짜 (YYYY-MM-DD, 기본값: 오늘)
 *   - regenerate: true면 기존 주문 삭제 후 재생성
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  // 날짜 파라미터 파싱
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const regenerate = url.searchParams.get("regenerate") === "true";
  const date = dateParam || new Date().toISOString().split("T")[0];

  // 날짜 형식 검증
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }

  // [REQ-001] 사이클 시작일부터 어제까지의 모든 주문 처리
  // - 각 거래일에 대해 주문 생성 및 체결 조건 확인
  // - 체결 결과에 따라 holdings 업데이트
  const executedPreviousOrders = await processHistoricalOrders(
    id,
    account.cycleStartDate,
    date,
    account.ticker,
    account.strategy,
    account.seedCapital
  );

  // 이전 거래일 체결이 발생했으면 오늘 주문 재생성 필요 (holdings가 변경됨)
  // regenerate 옵션이 있어도 마찬가지로 삭제
  if (executedPreviousOrders.length > 0 || regenerate) {
    await deleteDailyOrders(id, date);
  }

  // 기존 주문 조회 (체결 처리로 업데이트된 holdings 기반)
  let orders = await getDailyOrders(id, date);

  // 계좌 설정 변경 감지: 미체결 주문이 있고, 계좌가 주문 생성 이후 수정되었으면 재생성
  if (orders.length > 0) {
    const hasExecutedOrder = orders.some((order) => order.executed);
    const oldestOrderCreatedAt = orders.reduce(
      (min, order) => (order.createdAt < min ? order.createdAt : min),
      orders[0].createdAt
    );

    // 체결된 주문이 없고, 계좌가 주문 생성 이후 수정되었으면 재생성
    if (!hasExecutedOrder && account.updatedAt > oldestOrderCreatedAt) {
      await deleteDailyOrders(id, date);
      orders = [];
    }
  }

  // 주문이 없으면 자동 생성
  if (orders.length === 0) {
    const holdings = await getTierHoldings(id);
    orders = await generateDailyOrders(
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

  // Body 파싱
  const body = await request.json();
  const date = body.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }

  // 주문 체결 처리
  const results = await processOrderExecution(id, date, account.ticker);

  return NextResponse.json({
    date,
    results,
  });
}
