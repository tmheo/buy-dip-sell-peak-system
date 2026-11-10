/**
 * 시드 변경 API (ADR-0005, #116)
 * PUT /api/trading/accounts/[id]/seed - 시드를 바꾼다. 새 시드는 다음 거래일 주문표부터 쓰인다.
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
import { changeSeedCapital, CycleInProgressError } from "@/database/trading";
import { getTodayTradingDate } from "@/lib/date";
import { ChangeSeedCapitalSchema } from "@/lib/validations/trading";

/**
 * PUT /api/trading/accounts/[id]/seed
 * 본문 { seedCapital }. 응답은 바꾼 뒤의 시드 상태 { seed }.
 *
 * 바꾼 날은 서버의 UTC 날짜이고, 적용일은 그다음 거래일이다 - 바꾼 날의 주문표는 사용자가
 * 이미 증권사에 냈을 수 있어 옛 시드로 체결한다. 지금 시드를 보내면 적용 전 변경을 되돌린다.
 * 사이클 중 변경(ADR-0004)은 #117에서 연다. 그때까지는 보유 티어가 있으면 400이다.
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
    const parsed = ChangeSeedCapitalSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten());
    }

    const seed = await changeSeedCapital(
      id,
      userId,
      parsed.data.seedCapital,
      getTodayTradingDate()
    );
    if (!seed) {
      return notFoundResponse("Account");
    }

    return NextResponse.json({ seed });
  } catch (error) {
    if (error instanceof CycleInProgressError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to change seed capital:", error);
    return serverErrorResponse();
  }
}
