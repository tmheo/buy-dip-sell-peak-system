/**
 * PUT /api/trading/accounts/[id]/seed 테스트 (ADR-0005, #116)
 *
 * 바꾼 시드는 바꾼 날(서버의 UTC 날짜)의 다음 평일 주문표부터 쓰인다. 응답은 바꾼 뒤의
 * 시드 상태(seed)다. 서버가 최소 $2,000, 최대 10억을 검사하고, 사이클 중 변경은 아직
 * 열지 않았으므로 보유 티어가 있으면 400이다.
 *
 * 오늘은 2026-11-13(금)으로 정해 적용일이 2026-11-16(월)이 되게 한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { hasDb } from "@/test-utils/db";
import { mockLoggedIn, mockLoggedOut } from "@/lib/__tests__/auth-mock";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";

const OWNER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const TODAY = "2026-11-13";

describe.skipIf(!hasDb)("PUT /api/trading/accounts/[id]/seed", () => {
  let route: typeof import("../route");
  let trading: typeof import("@/database/trading");

  function put(id: string, body: unknown): Promise<Response> {
    return route.PUT(
      new Request(`http://localhost/api/trading/accounts/${id}/seed`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  async function createAccount(): Promise<string> {
    const account = await trading.createTradingAccount(
      OWNER_ID,
      {
        name: "시드 변경 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10_000,
        strategy: "Pro1",
        cycleStartDate: "2026-11-02",
      },
      "2026-11-02"
    );
    return account.id;
  }

  async function seedOn(id: string, date: string): Promise<number> {
    return trading.getSeedCapitalOn(id, date);
  }

  beforeAll(async () => {
    await db
      .insert(users)
      .values([
        { id: OWNER_ID, email: `test-${OWNER_ID}@test.com` },
        { id: OTHER_USER_ID, email: `test-${OTHER_USER_ID}@test.com` },
      ])
      .onConflictDoNothing();
    trading = await import("@/database/trading");
    route = await import("../route");
  });

  afterAll(async () => {
    // 계좌·티어 보유·시드 이력 CASCADE 삭제
    await db.delete(users).where(eq(users.id, OWNER_ID));
    await db.delete(users).where(eq(users.id, OTHER_USER_ID));
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("바꾼 시드를 다음 평일부터 쓰도록 남기고 바꾼 뒤의 시드 상태를 돌려줘야 한다", async () => {
    mockLoggedIn(OWNER_ID);
    const id = await createAccount();

    const response = await put(id, { seedCapital: 3_000 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      seed: {
        current: 10_000,
        pending: { seedCapital: 3_000, effectiveDate: "2026-11-16" },
        appliedToday: null,
      },
    });
    expect(await seedOn(id, TODAY)).toBe(10_000);
    expect(await seedOn(id, "2026-11-16")).toBe(3_000);
  });

  it("지금 시드를 보내면 적용 전 변경을 되돌려야 한다", async () => {
    mockLoggedIn(OWNER_ID);
    const id = await createAccount();
    await put(id, { seedCapital: 3_000 });

    const response = await put(id, { seedCapital: 10_000 });

    expect(response.status).toBe(200);
    expect((await response.json()).seed).toEqual({
      current: 10_000,
      pending: null,
      appliedToday: null,
    });
  });

  it.each([
    [
      "최소 금액보다 작은 시드",
      { seedCapital: 1_999 },
      "시드 금액은 최소 $2,000 이상이어야 합니다",
    ],
    ["10억보다 큰 시드", { seedCapital: 1_000_000_001 }, "시드 금액은 10억 이하여야 합니다"],
    // 반올림해 받으면 지금 시드와 같은 값이 적용 전 변경으로 남는다
    [
      "센트보다 작은 단위가 있는 시드",
      { seedCapital: 10_000.001 },
      "시드 금액은 센트(소수 둘째 자리)까지만 입력할 수 있습니다",
    ],
  ])("%s는 400을 돌려주고 시드를 바꾸지 않아야 한다", async (_label, body, message) => {
    mockLoggedIn(OWNER_ID);
    const id = await createAccount();

    const response = await put(id, body);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.details.fieldErrors.seedCapital).toEqual([message]);
    expect(await trading.getSeedStatus({ id, ticker: "SOXL" }, TODAY)).toMatchObject({
      current: 10_000,
      pending: null,
    });
  });

  it("최소 금액 $2,000 그대로는 받아야 한다", async () => {
    mockLoggedIn(OWNER_ID);
    const id = await createAccount();

    const response = await put(id, { seedCapital: 2_000 });

    expect(response.status).toBe(200);
  });

  it("숫자가 아닌 시드나 JSON이 아닌 본문은 400을 돌려줘야 한다", async () => {
    mockLoggedIn(OWNER_ID);
    const id = await createAccount();

    expect((await put(id, { seedCapital: "3000" })).status).toBe(400);
    expect((await put(id, "not json")).status).toBe(400);
  });

  it("보유 티어가 있으면 400과 한국어 오류를 돌려주고 시드를 바꾸지 않아야 한다", async () => {
    mockLoggedIn(OWNER_ID);
    const id = await createAccount();
    await trading.updateTierHolding(id, 1, { buyPrice: 100, shares: 10, buyDate: "2026-11-02" });

    const response = await put(id, { seedCapital: 3_000 });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("사이클 진행 중에는 계좌 설정을 수정할 수 없습니다");
    expect(await seedOn(id, "2026-11-16")).toBe(10_000);
  });

  it("다른 사용자의 계좌는 404를 돌려주고 시드를 바꾸지 않아야 한다", async () => {
    const id = await createAccount();
    mockLoggedIn(OTHER_USER_ID);

    const response = await put(id, { seedCapital: 3_000 });

    expect(response.status).toBe(404);
    expect(await seedOn(id, "2026-11-16")).toBe(10_000);
  });

  it("로그인하지 않은 요청은 401을 돌려줘야 한다", async () => {
    const id = await createAccount();
    mockLoggedOut();

    const response = await put(id, { seedCapital: 3_000 });

    expect(response.status).toBe(401);
  });
});
