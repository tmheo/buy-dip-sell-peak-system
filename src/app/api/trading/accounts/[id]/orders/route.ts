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
import { getTradingAccountById } from "@/database/trading";
import { getTodayTradingDate } from "@/lib/date";
import { getFreshDailyOrders, processOrderExecution } from "@/trading";

/**
 * GET /api/trading/accounts/[id]/orders
 * 당일 주문표 조회
 * Query params:
 *   - date: 조회할 날짜 (YYYY-MM-DD, 기본값: 오늘)
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
  const date = dateParam || getTodayTradingDate();

  // 날짜 형식 검증
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }

  // unaffordableBuy: 예수금으로 1주도 살 수 없어 매수 주문이 없는 날의 티어와 예수금 (#98)
  const { orders, unaffordableBuy } = await getFreshDailyOrders(account, date);

  return NextResponse.json({
    date,
    orders,
    unaffordableBuy,
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
  const results = await processOrderExecution(id, date);

  return NextResponse.json({
    date,
    results,
  });
}
