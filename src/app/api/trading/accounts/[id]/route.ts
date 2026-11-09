/**
 * 트레이딩 계좌 상세 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id] - 특정 계좌 상세 (holdings, 예수금 내역 포함)
 * PUT /api/trading/accounts/[id] - 계좌 설정 수정 (사이클 미진행 시만)
 * DELETE /api/trading/accounts/[id] - 계좌 삭제
 */

import { NextResponse } from "next/server";
import {
  getAuthUserId,
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
  type RouteParams,
} from "@/lib/api-utils";
import {
  getTradingAccountWithHoldings,
  updateTradingAccount,
  deleteTradingAccount,
  markAccountViewed,
} from "@/database/trading";
import { UpdateTradingAccountSchema } from "@/lib/validations/trading";
import { getTodayTradingDate } from "@/lib/date";
import { cashBreakdown } from "@/strategy";
import { loadCycleState } from "@/trading";

/**
 * GET /api/trading/accounts/[id]
 * 특정 계좌 상세 조회 (holdings 포함)
 *
 * 예수금 내역(cashBreakdown)을 함께 돌려준다. 예수금은 이번 사이클 실현손익을 입력으로
 * 받는 파생값이라(ADR-0003) 화면이 보유 티어만으로 다시 계산하면 주문표와 어긋난다.
 * 주문표와 같은 사이클 상태(loadCycleState)에서 읽어 같은 규칙으로 계산한다.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { id } = await params;
  const account = await getTradingAccountWithHoldings(id, userId);

  if (!account) {
    return notFoundResponse("Account");
  }

  // 조회 시각 갱신(부가 동작): 실패해도 상세 조회 응답은 유지한다
  try {
    await markAccountViewed(id);
    account.lastViewedAt = new Date().toISOString();
  } catch (error) {
    console.warn(`[${id}] 조회 시각 갱신 실패:`, error);
  }

  const state = await loadCycleState(account, getTodayTradingDate());

  return NextResponse.json({ account, cashBreakdown: cashBreakdown(state) });
}

/**
 * PUT /api/trading/accounts/[id]
 * 계좌 설정 수정 (사이클 미진행 시만)
 */
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = UpdateTradingAccountSchema.safeParse(body);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten());
    }

    const account = await updateTradingAccount(id, userId, parsed.data);

    if (!account) {
      return notFoundResponse("Account");
    }

    return NextResponse.json({ account });
  } catch (error) {
    if (error instanceof Error && error.message.includes("cycle is in progress")) {
      return NextResponse.json(
        { error: "사이클 진행 중에는 계좌 설정을 수정할 수 없습니다" },
        { status: 400 }
      );
    }

    console.error("Failed to update trading account:", error);
    return serverErrorResponse();
  }
}

/**
 * DELETE /api/trading/accounts/[id]
 * 계좌 삭제
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { id } = await params;
  const deleted = await deleteTradingAccount(id, userId);

  if (!deleted) {
    return notFoundResponse("Account");
  }

  return NextResponse.json({ success: true });
}
