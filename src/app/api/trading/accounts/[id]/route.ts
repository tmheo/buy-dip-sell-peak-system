/**
 * 트레이딩 계좌 상세 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id] - 특정 계좌 상세 (holdings, 시드 상태, 예수금 내역, 가장 최근 종가, 사이클 중 감액 경계, 시드 감액 정산 포함)
 * PUT /api/trading/accounts/[id] - 계좌 설정 수정 (사이클 미진행 시만, 종목과 시드는 받지 않는다)
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
  getSeedStatus,
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
import { loadCycleStateWithSeedCutLimits, loadSeedCutSettlement } from "@/trading";

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
 *
 * 계좌에는 시드 상태(account.seed: 오늘의 시드, 적용 전 변경, 오늘 처음 적용된 시드)를 붙인다
 * (ADR-0005). 예수금 내역과 같은 시점에서 읽는다.
 *
 * 사이클 중이면 오늘 시드를 줄일 때의 감액 경계(seedCutLimits: 직전 마감 예수금, 오늘 매수가
 * 체결된다고 쳤을 때의 예수금)를 함께 돌려준다 (ADR-0006). 사이클 사이에는 null이다.
 * 시드 변경 API가 같은 함수로 경계를 다시 계산해 확인이 필요한 감액인지 가린다.
 *
 * 지금 사이클이 시드 감액으로 끝난 사이클 바로 다음 사이클인 동안 그 정산(seedCutSettlement:
 * 옛 시드, 끝난 사이클 실현손익, 새 시드, 출금할 금액)을 함께 돌려준다 (#118). 아니면 null이다.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { id } = await params;
  // 보유 티어와 예수금 내역은 한 시점에서 읽는다 - 따로 읽으면 그 사이에 커밋된 매도가
  // 보유 티어에는 빠지고 예수금 내역에는 들어간다
  const today = getTodayTradingDate();
  const detail = await runInReadSnapshot(async (snapshot) => {
    const account = await getTradingAccountWithHoldings(id, userId, snapshot);
    if (!account) return null;
    const [{ state, seedCutLimits }, latestClose, seed, seedCutSettlement] = await Promise.all([
      loadCycleStateWithSeedCutLimits(account, today, snapshot),
      getLatestClose(account.ticker, snapshot),
      getSeedStatus(account, today, snapshot),
      loadSeedCutSettlement(account, snapshot),
    ]);
    return { account: { ...account, seed }, state, latestClose, seedCutLimits, seedCutSettlement };
  });

  if (!detail) {
    return notFoundResponse("Account");
  }
  const { account, state, latestClose, seedCutLimits, seedCutSettlement } = detail;

  // 조회 시각 갱신(부가 동작): 실패해도 상세 조회 응답은 유지한다
  try {
    await markAccountViewed(id);
    account.lastViewedAt = new Date().toISOString();
  } catch (error) {
    console.warn(`[${id}] 조회 시각 갱신 실패:`, error);
  }

  return NextResponse.json({
    account,
    cashBreakdown: cashBreakdown(state),
    latestClose,
    seedCutLimits,
    seedCutSettlement,
  });
}

/**
 * PUT /api/trading/accounts/[id]
 * 계좌 설정 수정 (사이클 미진행 시만)
 *
 * 종목(ticker)이 들어 있으면 검증 오류로 거절한다 - 종목은 계좌를 만들 때 정한다.
 * 시드(seedCapital)도 거절한다 - 시드는 PUT /api/trading/accounts/[id]/seed로 바꾼다 (ADR-0005).
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
