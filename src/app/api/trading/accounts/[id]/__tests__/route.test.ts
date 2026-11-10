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
 *
 * 응답의 보유 티어와 예수금 내역은 같은 시점의 것이어야 한다. 둘을 따로 읽으면 그 사이에
 * 커밋된 매도가 보유 티어에는 빠지고 예수금 내역에는 들어간다. 다른 인스턴스의 매도는
 * 테스트용 연결을 하나 더 열어 흉내 낸다 (cycle-state-snapshot.test.ts와 같은 방식).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { hasDb } from "@/test-utils/db";
import { settledSale } from "@/test-utils/settled-sale";
import { mockLoggedIn, mockLoggedOut } from "@/lib/__tests__/auth-mock";
import { db } from "@/database/db-drizzle";
import * as schema from "@/database/schema";
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
    // 계좌·티어 보유·수익 기록 CASCADE 삭제
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
      // 예수금 계산식: 시드 10,000 - 투자 중 1,000(티어 1) - 순실현손실 7,500 = 1,500
      cycleCapital: 10_000,
      investedAmount: 1_000,
      netRealizedLoss: 7_500,
      isCashReduced: true,
      // 할당 시드: 보유 중인 티어 1은 비율대로, 아직 안 산 티어는 앞 티어부터 차례로 산다고 친
      // 금액(#108) - 티어 2가 비율대로 1,500을 사면 남은 예수금이 없다
      tiers: [
        { tier: 1, amount: 1_000, nominalAmount: 1_000, isReduced: false },
        { tier: 2, amount: 1_500, nominalAmount: 1_500, isReduced: false },
        { tier: 3, amount: 0, nominalAmount: 2_000, isReduced: true },
        { tier: 4, amount: 0, nominalAmount: 2_500, isReduced: true },
        { tier: 5, amount: 0, nominalAmount: 2_000, isReduced: true },
        { tier: 6, amount: 0, nominalAmount: 1_000, isReduced: true },
        { tier: 7, amount: 0, nominalAmount: null, isReduced: false },
      ],
    });
  });

  it("평가금 계산에 쓸 저장된 가장 최근 종가와 그 날짜를 돌려줘야 한다 (#98)", async () => {
    mockLoggedIn(OWNER_ID);
    // CI 시험용 DB에는 시세가 없으므로 SOXL 상장(2010-03-11) 이전 날짜에 날짜와 종가가 다른
    // 합성 시세 두 행을 넣는다 - 한 행뿐이면 정렬 방향이 뒤집혀도 통과한다.
    // 실데이터가 있으면 그쪽이 더 최근이라 응답은 실데이터의 최근 종가와 같아야 한다.
    const synthetic = (date: string, price: number) => ({
      ticker: "SOXL" as const,
      date,
      open: price,
      high: price,
      low: price,
      close: price,
      adjClose: price,
      volume: 1000,
    });
    const inserted = await db
      .insert(schema.dailyPrices)
      .values([synthetic("2009-06-02", 11.11), synthetic("2009-06-03", 12.34)])
      .onConflictDoNothing()
      .returning({ id: schema.dailyPrices.id });
    const syntheticPriceIds = inserted.map((row) => row.id);

    try {
      const latest = await db.execute<{ date: string; adj_close: number }>(
        sql`select date::text as date, adj_close from daily_prices
            where ticker = 'SOXL' order by date desc limit 1`
      );

      const response = await get(accountId);

      const body = await response.json();
      expect(latest.length).toBe(1);
      expect(body.latestClose).toEqual({
        date: latest[0].date,
        adjClose: Number(latest[0].adj_close),
      });
    } finally {
      // 삽입이 건너뛰어진 행(같은 행이 이미 있음)은 기존 데이터라 보존한다
      if (syntheticPriceIds.length > 0) {
        await db
          .delete(schema.dailyPrices)
          .where(inArray(schema.dailyPrices.id, syntheticPriceIds));
      }
    }
  });

  it("읽는 도중 매도가 커밋돼도 보유 티어와 예수금 내역은 같은 시점의 것이어야 한다", async () => {
    // 티어 1($100 × 10주)만 보유한 계좌. 끼어드는 매도는 티어 1을 $50에 손절(-$500)하고
    // 보유가 비어 사이클을 완료한다 - 사이클 완료가 계좌 행을 갱신하므로, 커밋 전까지
    // 이 요청의 조회 시각 갱신은 그 행 잠금을 기다린다.
    const trading = await import("@/database/trading");
    const account = await trading.createTradingAccount(OWNER_ID, {
      name: "읽기 시점 테스트 계좌",
      ticker: "SOXL",
      seedCapital: 10_000,
      strategy: "Pro2",
      cycleStartDate: "2009-03-02",
    });
    await trading.updateTierHolding(account.id, 1, {
      buyPrice: 100,
      shares: 10,
      buyDate: "2009-03-02",
    });

    const otherClient = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
    const otherDb = drizzle(otherClient, { schema });
    try {
      const pidRows = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      const pid = pidRows[0].pid;
      mockLoggedIn(OWNER_ID);
      let responding: Promise<Response> | undefined;

      await otherDb.transaction(async (tx) => {
        await trading.completeCycleAndIncrement(account.id, tx);
        await trading.createProfitRecord(
          {
            accountId: account.id,
            ticker: "SOXL",
            strategy: "Pro2",
            cycleNumber: 1,
            sellDate: "2009-03-04",
            ...settledSale({
              tier: 1,
              buyDate: "2009-03-02",
              buyPrice: 100,
              shares: 10,
              sellDate: "2009-03-04",
              sellPrice: 50,
            }),
          },
          tx
        );
        await trading.updateTierHolding(
          account.id,
          1,
          { buyPrice: null, shares: 0, buyDate: null, sellTargetPrice: null },
          tx
        );

        responding = get(account.id);
        for (let attempt = 0; ; attempt++) {
          const waiting = await tx.execute(
            sql`select 1 from pg_locks where not granted and pid = ${pid}`
          );
          if (waiting.length > 0) break;
          if (attempt >= 100) throw new Error("요청이 계좌 행 잠금을 기다리지 않았다");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      });

      const response = await responding!;
      expect(response.status).toBe(200);
      const body = await response.json();
      // 매도 전 시점: 티어 1을 보유 중이고 이번 사이클 손실은 아직 없다
      const tier1 = body.account.holdings.find((holding: { tier: number }) => holding.tier === 1);
      expect(tier1.shares).toBe(10);
      expect(body.cashBreakdown.netRealizedLoss).toBe(0);
      expect(body.cashBreakdown.availableCash).toBe(9_000);
      expect(body.cashBreakdown.investedAmount).toBe(1_000);
    } finally {
      await otherClient.end();
    }
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

/**
 * PUT /api/trading/accounts/[id] 테스트 (#112)
 *
 * 종목은 계좌를 만든 뒤 바꿀 수 없다 - 종목을 바꾸면 체결 전 오늘 주문표가 새 종목으로
 * 다시 만들어져 체결된다. 운용 시작일은 첫 일일 마감 전에만 바꿀 수 있다 - 그 뒤에는
 * 일일 마감이 이 값을 읽지 않아 화면 표시만 달라진다.
 */
describe.skipIf(!hasDb)("PUT /api/trading/accounts/[id]", () => {
  const PUT_OWNER_ID = randomUUID();
  let route: typeof import("../route");
  let trading: typeof import("@/database/trading");

  function put(id: string, body: unknown): Promise<Response> {
    return route.PUT(
      new Request(`http://localhost/api/trading/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  async function createAccount(options: { closed: boolean }): Promise<string> {
    const account = await trading.createTradingAccount(PUT_OWNER_ID, {
      name: "설정 수정 테스트 계좌",
      ticker: "SOXL",
      seedCapital: 10_000,
      strategy: "Pro1",
      cycleStartDate: "2025-01-02",
    });
    if (options.closed) {
      await trading.updateAccountLastProcessedDate(account.id, "2025-01-03");
    }
    return account.id;
  }

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: PUT_OWNER_ID, email: `test-${PUT_OWNER_ID}@test.com` })
      .onConflictDoNothing();
    trading = await import("@/database/trading");
    route = await import("../route");
  });

  afterAll(async () => {
    // 계좌·티어 보유 CASCADE 삭제
    await db.delete(users).where(eq(users.id, PUT_OWNER_ID));
  });

  it("종목이 든 요청은 400을 돌려주고 계좌의 종목을 바꾸지 않아야 한다", async () => {
    mockLoggedIn(PUT_OWNER_ID);
    const id = await createAccount({ closed: false });

    const response = await put(id, { ticker: "TQQQ", strategy: "Pro2" });

    expect(response.status).toBe(400);
    const after = await trading.getTradingAccountById(id, PUT_OWNER_ID);
    expect(after!.ticker).toBe("SOXL");
    expect(after!.strategy).toBe("Pro1");
  });

  it("보유 티어가 있는 동안에는 400과 한국어 오류를 돌려주고 계좌를 바꾸지 않아야 한다", async () => {
    mockLoggedIn(PUT_OWNER_ID);
    const id = await createAccount({ closed: false });
    await trading.updateTierHolding(id, 1, { buyPrice: 100, shares: 10, buyDate: "2025-01-02" });

    const response = await put(id, { strategy: "Pro2" });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("사이클 진행 중에는 계좌 설정을 수정할 수 없습니다");
    const after = await trading.getTradingAccountById(id, PUT_OWNER_ID);
    expect(after!.strategy).toBe("Pro1");
  });

  it("첫 일일 마감 전에는 운용 시작일을 바꿀 수 있어야 한다", async () => {
    mockLoggedIn(PUT_OWNER_ID);
    const id = await createAccount({ closed: false });

    const response = await put(id, { cycleStartDate: "2025-02-03" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account.cycleStartDate).toBe("2025-02-03");
  });

  it("첫 일일 마감 뒤에 운용 시작일을 다른 날짜로 바꾸면 400과 한국어 오류를 돌려줘야 한다", async () => {
    mockLoggedIn(PUT_OWNER_ID);
    const id = await createAccount({ closed: true });

    const response = await put(id, { strategy: "Pro2", cycleStartDate: "2025-02-03" });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("첫 일일 마감 뒤에는 운용 시작일을 바꿀 수 없습니다");
    const after = await trading.getTradingAccountById(id, PUT_OWNER_ID);
    expect(after!.cycleStartDate).toBe("2025-01-02");
    expect(after!.strategy).toBe("Pro1");
  });

  it("첫 일일 마감 뒤에도 지금과 같은 운용 시작일을 함께 보내면 저장되어야 한다", async () => {
    mockLoggedIn(PUT_OWNER_ID);
    const id = await createAccount({ closed: true });

    const response = await put(id, {
      seedCapital: 10_000,
      strategy: "Pro2",
      cycleStartDate: "2025-01-02",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account.strategy).toBe("Pro2");
  });
});
