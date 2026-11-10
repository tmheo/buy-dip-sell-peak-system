/**
 * 트레이딩 계좌 상세 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id] - 특정 계좌 상세 (holdings, 예수금 내역, 가장 최근 종가 포함)
 * PUT /api/trading/accounts/[id] - 계좌 설정 수정 (사이클 미진행 시만, 종목은 받지 않는다)
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
  getLatestClose,
  updateTradingAccount,
  CycleInProgressError,
  TradingStartDateLockedError,
  deleteTradingAccount,
  markAccountViewed,
  runInReadSnapshot,
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
 *
 * 평가금(가장 최근 종가 × 보유 수량)에 쓸 저장된 가장 최근 종가와 그 날짜(latestClose)도
 * 함께 돌려준다 (#98). 실시간 시세가 아니다. 가격 행이 없으면 null이다.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { id } = await params;
  // 보유 티어와 예수금 내역은 한 시점에서 읽는다 - 따로 읽으면 그 사이에 커밋된 매도가
  // 보유 티어에는 빠지고 예수금 내역에는 들어간다
  const detail = await runInReadSnapshot(async (snapshot) => {
    const account = await getTradingAccountWithHoldings(id, userId, snapshot);
    if (!account) return null;
    const [state, latestClose] = await Promise.all([
      loadCycleState(account, getTodayTradingDate(), snapshot),
      getLatestClose(account.ticker, snapshot),
    ]);
    return { account, state, latestClose };
  });

  if (!detail) {
    return notFoundResponse("Account");
  }
  const { account, state, latestClose } = detail;

  // 조회 시각 갱신(부가 동작): 실패해도 상세 조회 응답은 유지한다
  try {
    await markAccountViewed(id);
    account.lastViewedAt = new Date().toISOString();
  } catch (error) {
    console.warn(`[${id}] 조회 시각 갱신 실패:`, error);
  }

  return NextResponse.json({ account, cashBreakdown: cashBreakdown(state), latestClose });
}

/**
 * PUT /api/trading/accounts/[id]
 * 계좌 설정 수정 (사이클 미진행 시만)
 *
 * 종목(ticker)이 들어 있으면 검증 오류로 거절한다 - 종목은 계좌를 만들 때 정한다.
 * 운용 시작일은 첫 일일 마감 전에만 다른 날짜로 바꿀 수 있다 (#112).
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
    if (error instanceof CycleInProgressError || error instanceof TradingStartDateLockedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
