/**
 * 주문표·체결이 그날의 시드로 사이클 자본을 정하는지 검증한다 (ADR-0005, #116)
 *
 * 바꾼 시드는 바꾼 날의 다음 평일 주문표부터 쓰인다. 사용자는 바꾼 날의 주문표를 이미
 * 증권사에 냈을 수 있으므로, 그 주문표는 신선도 판정에서도 다시 만들어지면 안 되고,
 * 밀린 지난 날짜를 따라잡을 때도 날짜마다 그날의 시드로 처리해야 한다.
 *
 * 합성 시세 (TQQQ, 상장 2010-02-11 이전이라 실제 시세와 겹치지 않는다):
 * - 2009-08-31(월) $100, 2009-09-01(화) $99, 2009-09-02(수) $98
 * 계좌: Pro1(티어 1 5%, 티어 2 10%, 매수 지정가 = floor(직전 종가 × 0.9999, 2)), 시드 $10,000.
 * 시드는 2009-09-01(화)에 $20,000로 바꿔 적용일은 2009-09-02(수)다.
 *
 * 손으로 계산한 주문:
 * - 09-01 티어 1 매수: 지정가 floor(100 × 0.9999, 2) = $99.99
 *   - 옛 시드: floor(500 ÷ 99.99) = 5주 / 새 시드였다면: floor(1,000 ÷ 99.99) = 10주
 * - 09-02 매수 지정가 floor(99 × 0.9999, 2) = $98.99
 *   - 보유가 없으면 티어 1: floor(1,000 ÷ 98.99) = 10주 (새 시드)
 *   - 09-01에 티어 1을 샀으면 티어 2: floor(2,000 ÷ 98.99) = 20주 (새 시드)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";

import { hasDb } from "@/test-utils/db";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { dailyPrices } from "@/database/schema/index";
import type { CreateTradingAccountRequest, DailyOrder } from "@/types/trading";

const TEST_USER_ID = randomUUID();

const REQUEST: CreateTradingAccountRequest = {
  name: "그날의 시드 테스트 계좌",
  ticker: "TQQQ",
  seedCapital: 10_000,
  strategy: "Pro1",
  cycleStartDate: "2009-09-01",
};
const CREATED_ON = "2009-08-31";
const CHANGED_ON = "2009-09-01";
const EFFECTIVE_ON = "2009-09-02";

const SERIES = [
  { date: "2009-08-31", adjClose: 100 },
  { date: "2009-09-01", adjClose: 99 },
  { date: "2009-09-02", adjClose: 98 },
];

function buyOrders(orders: DailyOrder[]): Array<{ tier: number; shares: number }> {
  return orders
    .filter((order) => order.type === "BUY")
    .map((order) => ({ tier: order.tier, shares: order.shares }));
}

describe.skipIf(!hasDb)("그날의 시드로 만드는 주문표와 체결", () => {
  let storage: typeof import("@/database/trading");
  let trading: typeof import("..");
  const syntheticPriceIds: number[] = [];

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` })
      .onConflictDoNothing();

    const inserted = await db
      .insert(dailyPrices)
      .values(
        SERIES.map((bar) => ({
          ticker: "TQQQ",
          date: bar.date,
          open: bar.adjClose,
          high: bar.adjClose,
          low: bar.adjClose,
          close: bar.adjClose,
          adjClose: bar.adjClose,
          volume: 1000,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: dailyPrices.id });
    syntheticPriceIds.push(...inserted.map((row) => row.id));

    storage = await import("@/database/trading");
    trading = await import("..");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·주문·보유·시드 이력 CASCADE 삭제
    if (syntheticPriceIds.length > 0) {
      await db.delete(dailyPrices).where(inArray(dailyPrices.id, syntheticPriceIds));
    }
  });

  it("오늘 바꾼 시드는 이미 만든 오늘 주문표를 바꾸지 않고 다음 평일 주문표부터 쓰인다", async () => {
    const account = await storage.createTradingAccount(TEST_USER_ID, REQUEST, CREATED_ON);
    // 사용자가 오늘 주문표를 보고 증권사에 주문을 낸 뒤 시드를 바꾼다
    const placed = await trading.getFreshDailyOrders(account, CHANGED_ON);
    expect(buyOrders(placed.orders)).toEqual([{ tier: 1, shares: 5 }]);

    await storage.changeSeedCapital(account.id, TEST_USER_ID, 20_000, CHANGED_ON);

    const today = await trading.getFreshDailyOrders(account, CHANGED_ON);
    expect(today.orders.map((order) => order.id)).toEqual(placed.orders.map((order) => order.id));
    expect(buyOrders(today.orders)).toEqual([{ tier: 1, shares: 5 }]);

    const nextWeekday = await trading.getFreshDailyOrders(account, EFFECTIVE_ON);
    expect(buyOrders(nextWeekday.orders)).toEqual([{ tier: 1, shares: 10 }]);
  });

  it("밀린 지난 날짜는 날짜마다 그날의 시드로 마감된다", async () => {
    const account = await storage.createTradingAccount(TEST_USER_ID, REQUEST, CREATED_ON);
    await storage.changeSeedCapital(account.id, TEST_USER_ID, 20_000, CHANGED_ON);

    // 09-01과 09-02를 하루 늦게 한꺼번에 따라잡는다
    await trading.processHistoricalOrders(account, "2009-09-03");

    // 09-01: 옛 시드로 티어 1을 5주 사서 $99에 체결 (다음 날 매도 지정가 $99.00 > 종가 $98)
    expect(buyOrders(await storage.getDailyOrders(account.id, CHANGED_ON))).toEqual([
      { tier: 1, shares: 5 },
    ]);
    // 09-02: 새 시드로 티어 2를 20주
    expect(buyOrders(await storage.getDailyOrders(account.id, EFFECTIVE_ON))).toEqual([
      { tier: 2, shares: 20 },
    ]);
    const holdings = await storage.getTierHoldings(account.id);
    expect(holdings.filter((h) => h.shares > 0).map((h) => [h.tier, h.shares])).toEqual([
      [1, 5],
      [2, 20],
    ]);
  });
});
