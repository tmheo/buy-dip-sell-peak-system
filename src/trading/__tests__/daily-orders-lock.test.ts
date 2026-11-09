/**
 * 같은 계좌·날짜의 주문표 교체와 체결이 서로 끼어들지 못하는지 검증한다 (#96, PR #99 리뷰)
 *
 * 교체(replaceDailyOrders)는 "체결된 주문이 없다"를 확인한 뒤 지우고 새로 넣는다.
 * 그 사이에 다른 요청의 체결이 주문을 선점하고 커밋하면, 교체가 체결된 행을 지우고
 * 새 미체결 행을 넣어 같은 주문이 다시 체결되고 보유와 수익 기록이 두 번 반영된다.
 * 빈 주문표를 동시에 만드는 두 요청은 둘 다 넣어 주문이 겹친다.
 *
 * 앱의 연결은 인스턴스당 하나라 한 프로세스 안에서는 끼어들 수 없다. 그래서 테스트용
 * 연결을 하나 더 열어 다른 인스턴스의 요청을 흉내 낸다. 그 연결의 트랜잭션이 잠금을
 * 쥔 동안 앱 연결이 같은 잠금을 기다리는지 pg_locks로 확인한 뒤 그 트랜잭션을 마친다.
 *
 * 합성 시계열 (TQQQ 상장 이전 날짜라 실제 시세와 겹치지 않는다):
 * - 2009-10-12 $100, 2009-10-13 $99
 * - 10-13 주문표: 티어 1 LOC 매수 $99.99, 50주 → 종가 $99에 체결
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hasDb } from "@/test-utils/db";
import { db, type DbExecutor } from "@/database/db-drizzle";
import * as schema from "@/database/schema";
import { users } from "@/database/schema/auth";
import { dailyOrders, dailyPrices } from "@/database/schema/index";
import type { TradingAccount } from "@/types/trading";

const TEST_USER_ID = randomUUID();
const TICKER = "TQQQ";
const SERIES = [
  { date: "2009-10-12", adjClose: 100 },
  { date: "2009-10-13", adjClose: 99 },
];
const DATE = "2009-10-13";
const FRESH_BUY = {
  tier: 1,
  type: "BUY",
  orderMethod: "LOC",
  limitPrice: 99.99,
  shares: 50,
} as const;

async function deleteSeriesPriceRows(): Promise<void> {
  await db
    .delete(dailyPrices)
    .where(
      and(
        eq(dailyPrices.ticker, TICKER),
        gte(dailyPrices.date, SERIES[0].date),
        lte(dailyPrices.date, SERIES[SERIES.length - 1].date)
      )
    );
}

/** 앱 연결의 백엔드 프로세스 id (pg_locks에서 그 연결을 찾는 데 쓴다) */
async function appConnectionPid(): Promise<number> {
  const rows = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  return rows[0].pid;
}

/** pid 연결이 권고 잠금을 기다리기 시작할 때까지 기다린다 */
async function waitUntilWaitingForLock(tx: DbExecutor, pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await tx.execute(
      sql`select 1 from pg_locks where locktype = 'advisory' and not granted and pid = ${pid}`
    );
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("앱 연결이 같은 계좌·날짜의 주문표 잠금을 기다리지 않았다");
}

/** 성공이든 실패든 결과로 받는다 (기다리는 동안 처리되지 않은 거부로 잡히지 않게 한다) */
function settled<T>(promise: Promise<T>): Promise<{ value?: T; error?: Error }> {
  return promise.then(
    (value) => ({ value }),
    (error: Error) => ({ error })
  );
}

describe.skipIf(!hasDb)("주문표 교체와 체결의 직렬화", () => {
  let tradingModule: typeof import("@/database/trading");
  let trading: typeof import("..");
  let otherClient: postgres.Sql;
  let otherDb: ReturnType<typeof drizzle<typeof schema>>;
  let account: TradingAccount;

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` })
      .onConflictDoNothing();

    // 이전 실행이 정리 전에 중단됐어도 유니크 위반 없이 다시 실행되게 한다
    await deleteSeriesPriceRows();
    await db.insert(dailyPrices).values(
      SERIES.map((bar) => ({
        ticker: TICKER,
        date: bar.date,
        open: bar.adjClose,
        high: bar.adjClose,
        low: bar.adjClose,
        close: bar.adjClose,
        adjClose: bar.adjClose,
        volume: 1000,
      }))
    );

    otherClient = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
    otherDb = drizzle(otherClient, { schema });

    tradingModule = await import("@/database/trading");
    trading = await import("..");
  });

  afterAll(async () => {
    await otherClient.end();
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·주문·홀딩 CASCADE 삭제
    await deleteSeriesPriceRows();
  });

  beforeEach(async () => {
    account = await tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "직렬화 테스트 계좌",
      ticker: TICKER,
      seedCapital: 100_000,
      strategy: "Pro1",
      cycleStartDate: DATE,
    });
  });

  it("교체는 같은 날짜의 체결이 끝나기를 기다리고, 그 사이 체결된 주문표는 지우지 않는다", async () => {
    const stored = await tradingModule.createDailyOrder(account.id, { date: DATE, ...FRESH_BUY });
    const pid = await appConnectionPid();

    let replacing: ReturnType<typeof settled<unknown>> | undefined;
    await otherDb.transaction(async (tx) => {
      // 다른 인스턴스의 체결: 잠금을 쥐고 주문을 선점한다
      await tradingModule.lockDailyOrders(account.id, DATE, tx);
      expect(await tradingModule.updateOrderExecuted(stored.id, true, tx)).toBe(true);

      replacing = settled(tradingModule.replaceDailyOrders(account.id, DATE, [FRESH_BUY]));
      await waitUntilWaitingForLock(tx, pid);
    });

    const { error } = await replacing!;
    expect(error?.message).toMatch(/executed orders exist/);
    const orders = await tradingModule.getDailyOrders(account.id, DATE);
    expect(orders.map(({ id, executed }) => ({ id, executed }))).toEqual([
      { id: stored.id, executed: true },
    ]);
  });

  it("빈 주문표를 동시에 만드는 두 요청은 주문을 겹쳐 넣지 않는다", async () => {
    const pid = await appConnectionPid();

    let replacing: ReturnType<typeof settled<unknown>> | undefined;
    await otherDb.transaction(async (tx) => {
      // 다른 인스턴스의 교체: 잠금을 쥐고 빈 주문표에 주문을 넣는다
      await tradingModule.lockDailyOrders(account.id, DATE, tx);
      await tx.insert(dailyOrders).values({ accountId: account.id, date: DATE, ...FRESH_BUY });

      replacing = settled(tradingModule.replaceDailyOrders(account.id, DATE, [FRESH_BUY]));
      await waitUntilWaitingForLock(tx, pid);
    });

    const { error } = await replacing!;
    expect(error).toBeUndefined();
    const orders = await tradingModule.getDailyOrders(account.id, DATE);
    expect(orders).toHaveLength(1);
  });

  it("체결은 같은 날짜의 교체가 끝나기를 기다리고, 교체된 주문은 선점에 실패해 롤백한다", async () => {
    const stored = await tradingModule.createDailyOrder(account.id, { date: DATE, ...FRESH_BUY });
    const pid = await appConnectionPid();

    let settling: ReturnType<typeof settled<unknown>> | undefined;
    await otherDb.transaction(async (tx) => {
      // 다른 인스턴스의 교체: 잠금을 쥔 뒤, 체결이 잠금을 기다리는 동안 지우고 새로 넣는다
      await tradingModule.lockDailyOrders(account.id, DATE, tx);

      settling = settled(trading.processOrderExecution(account.id, DATE));
      await waitUntilWaitingForLock(tx, pid);

      await tx.delete(dailyOrders).where(eq(dailyOrders.id, stored.id));
      await tx.insert(dailyOrders).values({ accountId: account.id, date: DATE, ...FRESH_BUY });
    });

    const { error } = await settling!;
    expect(error?.message).toMatch(/Order already executed concurrently/);
    const tier1 = (await tradingModule.getTierHoldings(account.id)).find((h) => h.tier === 1);
    expect(tier1?.shares).toBe(0);

    // 다음 실행이 새로 넣은 주문표를 한 번만 체결한다
    const results = await trading.processOrderExecution(account.id, DATE);
    expect(results).toEqual([expect.objectContaining({ tier: 1, type: "BUY", executed: true })]);
    const healed = (await tradingModule.getTierHoldings(account.id)).find((h) => h.tier === 1);
    expect(healed).toMatchObject({ buyPrice: 99, shares: 50, buyDate: DATE });
  });
});
