/**
 * 트레이딩 계좌 상세 API (PRD-TRADING-001)
 * GET /api/trading/accounts/[id] - 특정 계좌 상세 (holdings 포함)
 * PUT /api/trading/accounts/[id] - 계좌 설정 수정 (사이클 미진행 시만)
 * DELETE /api/trading/accounts/[id] - 계좌 삭제
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getTradingAccountWithHoldings,
  updateTradingAccount,
  deleteTradingAccount,
} from "@/database/trading";
import { UpdateTradingAccountSchema } from "@/lib/validations/trading";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/trading/accounts/[id]
 * 특정 계좌 상세 조회 (holdings 포함)
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const account = getTradingAccountWithHoldings(id, session.user.id);

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}

/**
 * PUT /api/trading/accounts/[id]
 * 계좌 설정 수정 (사이클 미진행 시만)
 */
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateTradingAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const account = updateTradingAccount(id, session.user.id, parsed.data);

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/trading/accounts/[id]
 * 계좌 삭제
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = deleteTradingAccount(id, session.user.id);

  if (!deleted) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
