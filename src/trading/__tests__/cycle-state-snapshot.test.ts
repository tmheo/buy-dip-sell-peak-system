/**
 * 사이클 상태의 보유 티어와 이번 사이클 실현손익이 같은 시점을 보는지 검증한다 (#97, PR #100 리뷰)
 *
 * loadCycleState는 보유 티어와 수익 기록을 따로 읽는다. 두 읽기 사이에 다른 요청의 매도
 * (보유 티어 비우기 + 수익 기록 추가)가 커밋되면, 보유는 매도 전이고 실현손익은 매도 후가
 * 된다. 그러면 판 티어의 투자금과 그 손실이 함께 빠져 예수금이 손실만큼 더 줄고, 그 상태로
 * 만든 주문표도 덜 산다.
 *
 * 앱의 연결은 인스턴스당 하나라 한 프로세스 안에서는 끼어들 수 없다. 그래서 테스트용 연결을
 * 하나 더 열어 다른 인스턴스의 매도를 흉내 낸다. 그 연결의 트랜잭션이 수익 기록 테이블을
 * 잠근 채 매도를 써 두면, 앱 연결은 보유 티어를 읽은 뒤 수익 기록 읽기에서 멈춘다. 멈춘 것을
 * pg_locks로 확인한 뒤 매도를 커밋한다.
 *
 * 시나리오 (SOXL, Pro2, 시드 $10,000, 사이클 1):
 * - 티어 1 보유: $100 × 10주
 * - 끼어드는 매도: 티어 1을 $50에 손절, -$500
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hasDb } from "@/test-utils/db";
import { settledSale } from "@/test-utils/settled-sale";
import { db, type DbExecutor } from "@/database/db-drizzle";
import * as schema from "@/database/schema";
import { users } from "@/database/schema/auth";
import type { TradingAccount } from "@/types/trading";

const TEST_USER_ID = randomUUID();
const DATE = "2009-03-05";

/** 앱 연결의 백엔드 프로세스 id (pg_locks에서 그 연결을 찾는 데 쓴다) */
async function appConnectionPid(): Promise<number> {
  const rows = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  return rows[0].pid;
}

/** pid 연결이 수익 기록 테이블 잠금을 기다리기 시작할 때까지 기다린다 */
async function waitUntilWaitingForProfitRecords(tx: DbExecutor, pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await tx.execute(
      sql`select 1 from pg_locks
          where relation = 'profit_records'::regclass and not granted and pid = ${pid}`
    );
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("앱 연결이 수익 기록 테이블 잠금을 기다리지 않았다");
}

describe.skipIf(!hasDb)("loadCycleState의 읽기 시점 일치", () => {
  let tradingModule: typeof import("@/database/trading");
  let orders: typeof import("../orders");
  let otherClient: postgres.Sql;
  let otherDb: ReturnType<typeof drizzle<typeof schema>>;
  let account: TradingAccount;

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` })
      .onConflictDoNothing();

    otherClient = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
    otherDb = drizzle(otherClient, { schema });

    tradingModule = await import("@/database/trading");
    orders = await import("../orders");
  });

  afterAll(async () => {
    await otherClient.end();
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·홀딩·수익 기록 CASCADE 삭제
  });

  beforeEach(async () => {
    account = await tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "읽기 시점 테스트 계좌",
      ticker: "SOXL",
      seedCapital: 10_000,
      strategy: "Pro2",
      cycleStartDate: "2009-03-02",
    });
    await tradingModule.updateTierHolding(account.id, 1, {
      buyPrice: 100,
      shares: 10,
      buyDate: "2009-03-02",
    });
  });

  it("두 읽기 사이에 매도가 커밋돼도 보유 티어와 실현손익은 같은 시점의 것이어야 한다", async () => {
    const pid = await appConnectionPid();
    let loading: Promise<Awaited<ReturnType<typeof orders.loadCycleState>>> | undefined;

    await otherDb.transaction(async (tx) => {
      await tx.execute(sql`lock table profit_records in access exclusive mode`);
      await tradingModule.createProfitRecord(
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
      await tradingModule.updateTierHolding(
        account.id,
        1,
        { buyPrice: null, shares: 0, buyDate: null, sellTargetPrice: null },
        tx
      );

      loading = orders.loadCycleState(account, DATE);
      await waitUntilWaitingForProfitRecords(tx, pid);
    });

    const state = await loading!;
    // 매도 전 시점: 티어 1을 보유 중이고 이번 사이클 손익은 아직 없다
    expect(state.holdings.map((holding) => holding.tier)).toEqual([1]);
    expect(state.realizedPnl).toBe(0);
  });
});
