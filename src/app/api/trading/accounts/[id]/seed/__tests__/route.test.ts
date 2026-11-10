/**
 * PUT /api/trading/accounts/[id]/seed 테스트 (ADR-0004, ADR-0005, ADR-0006, #116, #117)
 *
 * 바꾼 시드는 바꾼 날(서버의 UTC 날짜)의 다음 거래일 주문표부터 쓰인다. 응답은 바꾼 뒤의
 * 시드 상태(seed)다. 서버가 최소 $2,000, 최대 10억, 센트 단위를 검사한다.
 * 사이클 중에도 받는다. 사이클을 끝낼 수 있는 감액(depends, ends)은 본문에 confirmCycleEnd: true가
 * 없으면 409로 거절하고 서버가 새로 계산한 분류와 감액 경계를 돌려준다 - 오래 열려 있던 화면이
 * 사용자에게 다시 묻게 하려는 것이다.
 *
 * 오늘은 2026-11-13(금)으로 정해 적용일이 2026-11-16(월)이 되게 한다.
 * 사이클 중 감액은 직전 종가가 있어야 오늘 매수를 알 수 있으므로, SOXL 상장(2010-03-11) 이전인
 * 2009-12-04(금)를 오늘로 하고 그 직전 거래일 2009-12-03(목)에 합성 종가 $100을 넣는다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { hasDb } from "@/test-utils/db";
import { mockLoggedIn, mockLoggedOut } from "@/lib/__tests__/auth-mock";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { dailyPrices } from "@/database/schema/index";

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

  it("바꾼 시드를 다음 거래일부터 쓰도록 남기고 바꾼 뒤의 시드 상태를 돌려줘야 한다", async () => {
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

  it("확인 칸이 불리언이 아니면 400을 돌려줘야 한다", async () => {
    mockLoggedIn(OWNER_ID);
    const id = await createAccount();

    expect((await put(id, { seedCapital: 3_000, confirmCycleEnd: "yes" })).status).toBe(400);
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

/**
 * 사이클 중 감액의 확인 흐름 (ADR-0006, #117)
 *
 * 계좌: Pro1(티어 2 비율 10%), 시드 $20,000, 티어 1을 $100 × 100주 = $10,000 보유.
 * - 직전 마감 예수금 = 20,000 - 10,000 = $10,000
 * - 오늘 주문표의 매수: 티어 2를 지정가 floor(100 × 0.9999, 2) = $99.99로
 *   floor(2,000 ÷ 99.99) = 20주 = $1,999.80 → 체결된다고 치면 예수금 $8,000.20
 * 그래서 감액 $8,000.20까지는 keep, 그보다 크고 $10,000까지는 depends, 그보다 크면 ends다.
 */
describe.skipIf(!hasDb)("PUT /api/trading/accounts/[id]/seed - 사이클 중 감액", () => {
  const CYCLE_OWNER_ID = randomUUID();
  const CYCLE_TODAY = "2009-12-04";
  const LIMITS = { closedCash: 10_000, cashIfTodayBuyFills: 8_000.2 };
  let route: typeof import("../route");
  let trading: typeof import("@/database/trading");
  const syntheticPriceIds: number[] = [];

  function put(id: string, body: unknown): Promise<Response> {
    return route.PUT(
      new Request(`http://localhost/api/trading/accounts/${id}/seed`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  async function createAccountInCycle(): Promise<string> {
    const account = await trading.createTradingAccount(
      CYCLE_OWNER_ID,
      {
        name: "사이클 중 시드 변경 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 20_000,
        strategy: "Pro1",
        cycleStartDate: "2009-12-01",
      },
      "2009-12-01"
    );
    await trading.updateTierHolding(account.id, 1, {
      buyPrice: 100,
      shares: 100,
      buyDate: "2009-12-02",
    });
    return account.id;
  }

  /** 다음 거래일(2009-12-07, 월)부터 쓰일 시드 */
  async function nextSeed(id: string): Promise<number> {
    return trading.getSeedCapitalOn(id, "2009-12-07");
  }

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: CYCLE_OWNER_ID, email: `test-${CYCLE_OWNER_ID}@test.com` })
      .onConflictDoNothing();
    const inserted = await db
      .insert(dailyPrices)
      .values({
        ticker: "SOXL",
        date: "2009-12-03",
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        adjClose: 100,
        volume: 1000,
      })
      .onConflictDoNothing()
      .returning({ id: dailyPrices.id });
    syntheticPriceIds.push(...inserted.map((row) => row.id));
    trading = await import("@/database/trading");
    route = await import("../route");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, CYCLE_OWNER_ID));
    if (syntheticPriceIds.length > 0) {
      await db.delete(dailyPrices).where(inArray(dailyPrices.id, syntheticPriceIds));
    }
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${CYCLE_TODAY}T12:00:00Z`));
    mockLoggedIn(CYCLE_OWNER_ID);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["증액", 25_000],
    ["오늘 매수가 체결돼도 예수금 이내인 감액", 11_999.8],
  ])("%s은 확인 없이 받아야 한다", async (_label, seedCapital) => {
    const id = await createAccountInCycle();

    const response = await put(id, { seedCapital });

    expect(response.status).toBe(200);
    expect((await response.json()).seed.pending).toEqual({
      seedCapital,
      effectiveDate: "2009-12-07",
    });
    expect(await nextSeed(id)).toBe(seedCapital);
  });

  it.each([
    ["오늘 매수가 체결돼야만 예수금을 넘는 감액", 11_999.79, "depends"],
    ["직전 마감 예수금과 같은 감액", 10_000, "depends"],
    ["직전 마감 예수금보다 큰 감액", 9_999.99, "ends"],
  ])(
    "%s은 확인이 없으면 409로 분류와 감액 경계를 돌려주고 시드를 바꾸지 않아야 한다",
    async (_label, seedCapital, classification) => {
      const id = await createAccountInCycle();

      const response = await put(id, { seedCapital });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toMatchObject({ classification, seedCutLimits: LIMITS });
      expect(typeof body.error).toBe("string");
      expect(await nextSeed(id)).toBe(20_000);
    }
  );

  it("확인 칸이 false여도 409로 다시 물어야 한다", async () => {
    const id = await createAccountInCycle();

    const response = await put(id, { seedCapital: 2_000, confirmCycleEnd: false });

    expect(response.status).toBe(409);
    expect(await nextSeed(id)).toBe(20_000);
  });

  it("확인하고 다시 보내면 사이클을 끝내는 감액도 받아야 한다", async () => {
    const id = await createAccountInCycle();
    expect((await put(id, { seedCapital: 2_000 })).status).toBe(409);

    const response = await put(id, { seedCapital: 2_000, confirmCycleEnd: true });

    expect(response.status).toBe(200);
    expect((await response.json()).seed).toEqual({
      current: 20_000,
      pending: { seedCapital: 2_000, effectiveDate: "2009-12-07" },
      appliedToday: null,
    });
    expect(await nextSeed(id)).toBe(2_000);
  });

  it("다른 사용자의 계좌는 분류하기 전에 404를 돌려줘야 한다", async () => {
    const id = await createAccountInCycle();
    mockLoggedIn(randomUUID());

    const response = await put(id, { seedCapital: 2_000 });

    expect(response.status).toBe(404);
  });
});
