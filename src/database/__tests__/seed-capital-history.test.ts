/**
 * 시드 이력 저장 테스트 (ADR-0005, #116)
 *
 * 계좌를 만들 때 첫 줄을 쓰고, 시드 변경은 다음 거래일을 적용일로 한 줄을 쓴다.
 * 오늘은 서버의 UTC 날짜지만, 테스트는 날짜를 정해 넘긴다.
 *
 * 화면용 읽기(getSeedStatus)의 "오늘 처음 적용됐나"는 가격 행 기준 직전 거래일로 판정하므로,
 * 그 경우는 TQQQ 상장(2010-02-11) 이전 날짜에 합성 시세를 넣어 본다 - CI DB에는 시세가 없다.
 * 날짜: 2009-06-05는 금요일, 2009-06-08은 월요일이다.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hasDb } from "@/test-utils/db";
import { db, type DbExecutor } from "../db-drizzle";
import * as schema from "../schema";
import { users } from "../schema/auth";
import { dailyPrices } from "../schema/index";
import type { CreateTradingAccountRequest } from "@/types/trading";

const TEST_USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();

const REQUEST: CreateTradingAccountRequest = {
  name: "시드 이력 테스트 계좌",
  ticker: "TQQQ",
  seedCapital: 10_000,
  strategy: "Pro2",
  cycleStartDate: "2009-06-01",
};

/** pid 연결이 어떤 잠금이든 기다리기 시작할 때까지 기다린다 */
async function waitUntilWaitingForLock(executor: DbExecutor, pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await executor.execute(
      sql`select 1 from pg_locks where not granted and pid = ${pid}`
    );
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("이 서버의 연결이 잠금을 기다리지 않았다");
}

describe.skipIf(!hasDb)("시드 이력 저장", () => {
  let trading: typeof import("../trading");
  let otherClient: postgres.Sql;
  let otherDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    await db
      .insert(users)
      .values([
        { id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` },
        { id: OTHER_USER_ID, email: `other-${OTHER_USER_ID}@test.com` },
      ])
      .onConflictDoNothing();
    otherClient = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
    otherDb = drizzle(otherClient, { schema });
    trading = await import("../trading");
  });

  afterAll(async () => {
    await otherClient.end();
    // 계좌·티어 보유·시드 이력 CASCADE 삭제
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
    await db.delete(users).where(eq(users.id, OTHER_USER_ID));
  });

  it("계좌를 만들면 만든 날을 적용일로 첫 시드가 남고, 첫 변경 전의 모든 날짜에 쓰인다", async () => {
    const account = await trading.createTradingAccount(TEST_USER_ID, REQUEST, "2009-06-03");

    expect(account).not.toHaveProperty("seedCapital");
    expect(await trading.getSeedStatus(account, "2009-06-03")).toEqual({
      current: 10_000,
      pending: null,
      appliedToday: null,
    });
    // 운용 시작일(2009-06-01)은 만든 날보다 앞이다
    expect(await trading.getSeedCapitalOn(account.id, "2009-06-01")).toBe(10_000);
  });

  it("바꾼 시드는 오늘이 아니라 다음 거래일부터 쓰인다", async () => {
    const account = await trading.createTradingAccount(TEST_USER_ID, REQUEST, "2009-06-01");

    const seed = await trading.changeSeedCapital(account.id, TEST_USER_ID, 3_000, "2009-06-05");

    expect(seed).toEqual({
      current: 10_000,
      pending: { seedCapital: 3_000, effectiveDate: "2009-06-08" },
      appliedToday: null,
    });
    expect(await trading.getSeedCapitalOn(account.id, "2009-06-05")).toBe(10_000);
    expect(await trading.getSeedCapitalOn(account.id, "2009-06-08")).toBe(3_000);
  });

  it("적용 전 변경을 다시 바꾸면 덮어쓰고, 지금 시드로 되돌리면 지운다", async () => {
    const account = await trading.createTradingAccount(TEST_USER_ID, REQUEST, "2009-06-01");
    await trading.changeSeedCapital(account.id, TEST_USER_ID, 3_000, "2009-06-02");

    const overwritten = await trading.changeSeedCapital(
      account.id,
      TEST_USER_ID,
      5_000,
      "2009-06-02"
    );
    expect(overwritten?.pending).toEqual({ seedCapital: 5_000, effectiveDate: "2009-06-03" });

    const reverted = await trading.changeSeedCapital(
      account.id,
      TEST_USER_ID,
      10_000,
      "2009-06-02"
    );
    expect(reverted).toEqual({ current: 10_000, pending: null, appliedToday: null });
    expect(await trading.getSeedCapitalOn(account.id, "2009-06-03")).toBe(10_000);
  });

  it("보유 티어가 있으면 시드를 바꾸지 않는다 - 사이클 중 변경(ADR-0004)은 #117에서 연다", async () => {
    const account = await trading.createTradingAccount(TEST_USER_ID, REQUEST, "2009-06-01");
    await trading.updateTierHolding(account.id, 1, {
      buyPrice: 100,
      shares: 10,
      buyDate: "2009-06-01",
    });

    await expect(
      trading.changeSeedCapital(account.id, TEST_USER_ID, 3_000, "2009-06-02")
    ).rejects.toBeInstanceOf(trading.CycleInProgressError);
    expect(await trading.getSeedCapitalOn(account.id, "2009-06-03")).toBe(10_000);
  });

  it("다른 사용자의 계좌는 바꾸지 않는다", async () => {
    const account = await trading.createTradingAccount(TEST_USER_ID, REQUEST, "2009-06-01");

    expect(
      await trading.changeSeedCapital(account.id, OTHER_USER_ID, 3_000, "2009-06-02")
    ).toBeNull();
    expect(await trading.getSeedCapitalOn(account.id, "2009-06-03")).toBe(10_000);
  });

  it("같은 계좌의 동시 변경은 차례로 처리되어 적용 전 줄을 하나만 남긴다", async () => {
    const account = await trading.createTradingAccount(TEST_USER_ID, REQUEST, "2009-06-01");
    const [{ pid }] = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    let appChange: ReturnType<typeof trading.changeSeedCapital> | undefined;

    // 다른 서버의 변경이 커밋 전인 동안 이 서버가 같은 계좌의 시드를 바꾼다
    await otherDb.transaction(async (tx) => {
      await trading.changeSeedCapital(account.id, TEST_USER_ID, 5_000, "2009-06-02", tx);
      appChange = trading.changeSeedCapital(account.id, TEST_USER_ID, 3_000, "2009-06-02");
      await waitUntilWaitingForLock(tx, pid);
    });

    // 나중에 끝난 변경이 먼저 커밋된 변경을 덮어쓴다
    expect((await appChange!)?.pending).toEqual({
      seedCapital: 3_000,
      effectiveDate: "2009-06-03",
    });
    expect(await trading.getSeedStatus(account, "2009-06-02")).toMatchObject({
      pending: { seedCapital: 3_000, effectiveDate: "2009-06-03" },
    });
  });

  describe("오늘 처음 적용된 시드 (getSeedStatus의 appliedToday)", () => {
    // 금요일(06-05)만 가격 행이 있고 월요일(06-08)은 휴장이라 가격 행이 없다
    const syntheticPriceIds: number[] = [];

    beforeAll(async () => {
      const inserted = await db
        .insert(dailyPrices)
        .values(
          ["2009-06-04", "2009-06-05", "2009-06-09"].map((date) => ({
            ticker: "TQQQ",
            date,
            open: 100,
            high: 100,
            low: 100,
            close: 100,
            adjClose: 100,
            volume: 1000,
          }))
        )
        .onConflictDoNothing()
        .returning({ id: dailyPrices.id });
      syntheticPriceIds.push(...inserted.map((row) => row.id));
    });

    afterAll(async () => {
      for (const id of syntheticPriceIds) {
        await db.delete(dailyPrices).where(eq(dailyPrices.id, id));
      }
    });

    it("적용일이 휴장일이면 그다음 거래일에 새 시드가 오늘 처음 적용됐다고 보인다", async () => {
      const account = await trading.createTradingAccount(TEST_USER_ID, REQUEST, "2009-06-01");
      // 목요일에 바꿔 적용일은 금요일
      await trading.changeSeedCapital(account.id, TEST_USER_ID, 3_000, "2009-06-04");
      // 금요일에 다시 바꿔 적용일은 월요일(휴장)
      await trading.changeSeedCapital(account.id, TEST_USER_ID, 8_000, "2009-06-05");

      expect((await trading.getSeedStatus(account, "2009-06-05")).appliedToday).toEqual({
        previous: 10_000,
        current: 3_000,
      });
      // 화요일의 직전 거래일(가격 행 기준)은 금요일이다
      expect((await trading.getSeedStatus(account, "2009-06-09")).appliedToday).toEqual({
        previous: 3_000,
        current: 8_000,
      });
      // 수요일의 직전 거래일은 화요일이고 그날도 새 시드였다
      expect((await trading.getSeedStatus(account, "2009-06-10")).appliedToday).toBeNull();
    });
  });
});
