/**
 * 시드 변경 API (ADR-0004, ADR-0005, ADR-0006, #116, #117)
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
import { getTodayTradingDate } from "@/lib/date";
import { ChangeSeedCapitalSchema } from "@/lib/validations/trading";
import type { CycleEndingSeedChange } from "@/strategy";
import { changeSeed } from "@/trading";

/** 확인이 필요한 감액의 409 문구 */
const CONFIRMATION_MESSAGES: Record<CycleEndingSeedChange, string> = {
  ends: "이 감액은 적용일에 보유 티어를 모두 팔아 사이클을 끝냅니다. 확인한 뒤 다시 보내 주세요",
  depends: "오늘 매수가 체결되면 이 감액은 적용일에 사이클을 끝냅니다. 확인한 뒤 다시 보내 주세요",
};

/**
 * PUT /api/trading/accounts/[id]/seed
 * 본문 { seedCapital, confirmedClassification? }. 응답은 바꾼 뒤의 시드 상태 { seed }.
 *
 * 바꾼 날은 서버의 UTC 날짜이고, 적용일은 그다음 거래일이다 - 바꾼 날의 주문표는 사용자가
 * 이미 증권사에 냈을 수 있어 옛 시드로 체결한다. 지금 시드를 보내면 적용 전 변경을 되돌린다.
 *
 * 사이클 중에도 받는다 (ADR-0004). 사이클 중 감액은 서버가 감액 경계를 새로 계산해 분류한다.
 * 사이클을 끝낼 수 있는 감액인데 사용자가 확인한 분류(confirmedClassification)가 그보다 약하면
 * (확인하지 않았거나, 오늘 매수에 달림을 확인했는데 지금은 사이클 끝이면) 409
 * { error, classification, seedCutLimits, effectiveDate }로 거절한다 - 오래 열려 있던 화면이
 * 사용자에게 지금의 분류로 다시 묻게 하려는 것이다. 확인한 것보다 덜 끝나는 분류이면 받는다.
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

    const outcome = await changeSeed(
      id,
      userId,
      parsed.data.seedCapital,
      getTodayTradingDate(),
      parsed.data.confirmedClassification ?? null
    );
    if (!outcome) {
      return notFoundResponse("Account");
    }

    if (outcome.status === "needsConfirmation") {
      const { classification, seedCutLimits, effectiveDate } = outcome;
      return NextResponse.json(
        {
          error: CONFIRMATION_MESSAGES[classification],
          classification,
          seedCutLimits,
          effectiveDate,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ seed: outcome.seed });
  } catch (error) {
    console.error("Failed to change seed capital:", error);
    return serverErrorResponse();
  }
}
