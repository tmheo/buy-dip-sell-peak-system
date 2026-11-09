/**
 * GET /api/trading/accounts/[id] 테스트 (#97, ADR-0003)
 *
 * 계좌 상세 화면의 예수금은 화면이 직접 계산하지 않고 이 응답의 값을 쓴다.
 * 화면이 `시드 - 투자 중`으로 계산하면 이번 사이클 순실현손실이 빠지지 않아,
 * 주문표는 덜 사는데 화면 예수금은 그대로인 어긋남이 생긴다.
 *
 * 시나리오 (SOXL, Pro2, 시드 $10,000, 사이클 1):
 * - 티어 1 보유: $100 × 10주 = $1,000
 * - 이번 사이클 매도 기록: $100 × 100주를 $25에 매도, -$7,500
 *   (예수금이 비율대로의 티어 금액보다 작아지도록 손실을 크게 잡았다)
 * - 계좌 현금 = 10,000 - 1,000 - 7,500 = $1,500, 예수금 = min(9,000, 1,500) = $1,500
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { hasDb } from "@/test-utils/db";
import { settledSale } from "@/test-utils/settled-sale";
import { mockLoggedIn, mockLoggedOut } from "@/lib/__tests__/auth-mock";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";

const OWNER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();

describe.skipIf(!hasDb)("GET /api/trading/accounts/[id]", () => {
  let route: typeof import("../route");
  let accountId: string;

  function get(id: string): Promise<Response> {
    return route.GET(new Request(`http://localhost/api/trading/accounts/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  beforeAll(async () => {
    await db
      .insert(users)
      .values([
        { id: OWNER_ID, email: `test-${OWNER_ID}@test.com` },
        { id: OTHER_USER_ID, email: `test-${OTHER_USER_ID}@test.com` },
      ])
      .onConflictDoNothing();

    const trading = await import("@/database/trading");
    route = await import("../route");

    const account = await trading.createTradingAccount(OWNER_ID, {
      name: "예수금 응답 테스트 계좌",
      ticker: "SOXL",
      seedCapital: 10_000,
      strategy: "Pro2",
      cycleStartDate: "2009-03-02",
    });
    accountId = account.id;

    await trading.updateTierHolding(accountId, 1, {
      buyPrice: 100,
      shares: 10,
      buyDate: "2009-03-02",
    });
    // 매수 $100 × 100주를 $25에 손절: 손익 -7,500
    await trading.createProfitRecord({
      accountId,
      ticker: "SOXL",
      strategy: "Pro2",
      cycleNumber: 1,
      sellDate: "2009-03-04",
      ...settledSale({
        tier: 2,
        buyDate: "2009-03-02",
        buyPrice: 100,
        shares: 100,
        sellDate: "2009-03-04",
        sellPrice: 25,
      }),
    });
  });

  afterAll(async () => {
    // 계좌·홀딩·수익 기록 CASCADE 삭제
    await db.delete(users).where(eq(users.id, OWNER_ID));
    await db.delete(users).where(eq(users.id, OTHER_USER_ID));
  });

  it("이번 사이클 순실현손실을 뺀 예수금과 그 내역을 함께 돌려줘야 한다", async () => {
    mockLoggedIn(OWNER_ID);

    const response = await get(accountId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account.id).toBe(accountId);
    expect(body.cashBreakdown).toEqual({
      availableCash: 1_500,
      accountCash: 1_500,
      netRealizedLoss: 7_500,
      // 아직 안 산 기본 티어: 실제 금액 min(10,000 × 비율, 1,500)과 비율대로의 금액
      baseTiers: [
        { tier: 2, amount: 1_500, nominalAmount: 1_500 },
        { tier: 3, amount: 1_500, nominalAmount: 2_000 },
        { tier: 4, amount: 1_500, nominalAmount: 2_500 },
        { tier: 5, amount: 1_500, nominalAmount: 2_000 },
        { tier: 6, amount: 1_000, nominalAmount: 1_000 },
      ],
      reserveTierAmount: 1_500,
    });
  });

  it("다른 사용자의 계좌는 404를 돌려줘야 한다", async () => {
    mockLoggedIn(OTHER_USER_ID);

    const response = await get(accountId);

    expect(response.status).toBe(404);
  });

  it("로그인하지 않은 요청은 401을 돌려줘야 한다", async () => {
    mockLoggedOut();

    const response = await get(accountId);

    expect(response.status).toBe(401);
  });
});
