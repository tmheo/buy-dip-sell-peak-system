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
  hasNewerPriceSince,
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

  // [REQ-001] 사이클 시작일부터 어제까지의 마감 처리는
  // /api/cron/process-daily-orders 스케줄러가 담당한다.
  // 상세 화면 진입 시에는 조회/오늘 주문 생성만 수행하여 응답 속도를 확보한다.
  if (regenerate) {
    await deleteDailyOrders(id, date);
  }

  // 기존 주문 조회 (체결 처리로 업데이트된 holdings 기반)
  let orders = await getDailyOrders(id, date);

  // 미체결 주문이 있을 때, 아래 조건이면 재생성한다.
  //  1) 계좌 설정이 주문 생성 이후 수정됨
  //  2) 주문 생성 이후 더 최신 가격 데이터가 적재됨
  //     - 주문표는 화면 진입 시 지연 생성되므로, 일일 크론이 전일 종가를
  //       적재하기 전에 진입하면 그보다 이전 거래일 종가로 잘못 생성된다.
  //       이후 크론이 종가를 적재해도 자동으로 갱신되지 않는 문제를 복구한다.
  if (orders.length > 0) {
    const hasExecutedOrder = orders.some((order) => order.executed);
    const oldestOrderCreatedAt = orders.reduce(
      (min, order) => (order.createdAt < min ? order.createdAt : min),
      orders[0].createdAt
    );

    if (!hasExecutedOrder) {
      const accountChanged = account.updatedAt > oldestOrderCreatedAt;
      const stalePriceBasis =
        !accountChanged &&
        (await hasNewerPriceSince(account.ticker, date, new Date(oldestOrderCreatedAt)));

      if (accountChanged || stalePriceBasis) {
        await deleteDailyOrders(id, date);
        orders = [];
      }
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
