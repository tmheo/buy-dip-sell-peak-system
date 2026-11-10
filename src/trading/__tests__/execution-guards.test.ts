/**
 * 체결 처리가 다른 상태의 입력을 섞지 않는지 검증한다 (#96, PR #99 리뷰)
 *
 * 체결은 한 날짜의 주문표를 그날 종가로, 그날 직전 마감 뒤의 보유 상태로 판정해야 한다.
 * 여기서는 그 셋이 서로 다른 시점이나 다른 종목에서 오는 경우를 실제 DB로 재현한다.
 *
 * 합성 시계열 (두 종목 모두 상장 이전 날짜라 실제 시세와 겹치지 않는다):
 * - 종목 교체: TQQQ 2009-10-01 $100, 10-02 $99 / SOXL 2009-10-01 $100, 10-02 $200
 * - 지난 날짜 체결: TQQQ 2009-10-06 $100, 10-07 $101, 10-08 $99
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { hasDb } from "@/test-utils/db";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { dailyPrices, tradingAccounts } from "@/database/schema/index";
import type { DailyOrder, Ticker } from "@/types/trading";

const TEST_USER_ID = randomUUID();
const FIRST_DATE = "2009-10-01";
const LAST_DATE = "2009-10-08";
const PRICES: { ticker: Ticker; date: string; adjClose: number }[] = [
  { ticker: "TQQQ", date: "2009-10-01", adjClose: 100 },
  { ticker: "TQQQ", date: "2009-10-02", adjClose: 99 },
  { ticker: "SOXL", date: "2009-10-01", adjClose: 100 },
  { ticker: "SOXL", date: "2009-10-02", adjClose: 200 },
  { ticker: "TQQQ", date: "2009-10-06", adjClose: 100 },
  { ticker: "TQQQ", date: "2009-10-07", adjClose: 101 },
  { ticker: "TQQQ", date: "2009-10-08", adjClose: 99 },
];

/** 주문 내용만 남긴 비교용 형태 */
function content(orders: DailyOrder[]) {
  return orders.map(({ tier, type, orderMethod, limitPrice, shares, executed }) => ({
    tier,
    type,
    orderMethod,
    limitPrice,
    shares,
    executed,
  }));
}

async function deletePriceRows(): Promise<void> {
  await db
    .delete(dailyPrices)
    .where(
      and(
        inArray(dailyPrices.ticker, ["TQQQ", "SOXL"]),
        gte(dailyPrices.date, FIRST_DATE),
        lte(dailyPrices.date, LAST_DATE)
      )
    );
}

describe.skipIf(!hasDb)("체결 처리의 입력 일관성", () => {
  let tradingModule: typeof import("@/database/trading");
  let trading: typeof import("..");
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` })
      .onConflictDoNothing();

    // 이전 실행이 정리 전에 중단됐어도 유니크 위반 없이 다시 실행되게 한다
    await deletePriceRows();
    await db.insert(dailyPrices).values(
      PRICES.map((bar) => ({
        ticker: bar.ticker,
        date: bar.date,
        open: bar.adjClose,
        high: bar.adjClose,
        low: bar.adjClose,
        close: bar.adjClose,
        adjClose: bar.adjClose,
        volume: 1000,
      }))
    );

    tradingModule = await import("@/database/trading");
    trading = await import("..");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·주문·홀딩 CASCADE 삭제
    await deletePriceRows();
  });

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe("일일 마감 도중 종목이 바뀐 경우 (processHistoricalOrders)", () => {
    it("주문표를 만든 종목의 종가로 체결한다", async () => {
      // 마감이 계좌를 읽은 뒤 종목이 바뀐 상황이다. 계좌 설정 수정은 종목을 받지 않지만(#112)
      // 체결이 주문표의 종목을 따르는 방어는 남겨 둔다 - 행을 직접 바꿔 흉내 낸다
      const staleAccount = await tradingModule.createTradingAccount(TEST_USER_ID, {
        name: "종목 교체 테스트 계좌",
        ticker: "TQQQ",
        seedCapital: 100_000,
        strategy: "Pro1",
        cycleStartDate: "2009-10-02",
      });
      await db
        .update(tradingAccounts)
        .set({ ticker: "SOXL" })
        .where(eq(tradingAccounts.id, staleAccount.id));

      await trading.processHistoricalOrders(staleAccount, "2009-10-05");

      // SOXL 직전 종가 $100으로 만든 매수 LOC $99.99는 SOXL 종가 $200에 체결되지 않는다
      // (TQQQ 종가 $99로 판정하면 체결돼 버린다)
      const orders = await tradingModule.getDailyOrders(staleAccount.id, "2009-10-02");
      expect(content(orders)).toEqual([
        {
          tier: 1,
          type: "BUY",
          orderMethod: "LOC",
          limitPrice: 99.99,
          shares: 50,
          executed: false,
        },
      ]);
      const tier1 = (await tradingModule.getTierHoldings(staleAccount.id)).find(
        (h) => h.tier === 1
      );
      expect(tier1?.shares).toBe(0);
    });
  });

  describe("뒤에 체결된 날짜가 있는 지난 날짜 (processOrderExecution)", () => {
    it("지금 보유로 다시 만들거나 체결하지 않고 저장된 주문표를 미체결로 보고한다", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const account = await tradingModule.createTradingAccount(TEST_USER_ID, {
          name: "지난 날짜 체결 테스트 계좌",
          ticker: "TQQQ",
          seedCapital: 100_000,
          strategy: "Pro1",
          cycleStartDate: "2009-10-07",
        });

        // 10-07: 매수 LOC $99.99는 종가 $101에 체결되지 않는다
        // 10-08: 매수 LOC floor(101 × 0.9999, 2) = $100.98, floor(5,000 ÷ 100.98) = 49주가
        //        종가 $99에 체결된다
        await trading.processHistoricalOrders(account, "2009-10-09");
        const before = await tradingModule.getDailyOrders(account.id, "2009-10-07");
        expect(content(before)).toEqual([
          {
            tier: 1,
            type: "BUY",
            orderMethod: "LOC",
            limitPrice: 99.99,
            shares: 50,
            executed: false,
          },
        ]);

        // 체결 API는 아무 날짜나 받는다. 10-08에 산 티어 1로 10-07 주문표를 다시 만들면
        // 매도 LOC $99.00이 나오고, 종가 $101에 체결되면 매수보다 앞선 매도가 기록된다.
        const results = await trading.processOrderExecution(account.id, "2009-10-07");

        expect(results).toEqual([
          expect.objectContaining({
            orderId: before[0].id,
            tier: 1,
            type: "BUY",
            executed: false,
            limitPrice: 99.99,
            closePrice: 101,
            shares: 50,
          }),
        ]);
        const after = await tradingModule.getDailyOrders(account.id, "2009-10-07");
        expect(after).toEqual(before);
        const tier1 = (await tradingModule.getTierHoldings(account.id)).find((h) => h.tier === 1);
        expect(tier1).toMatchObject({ buyPrice: 99, shares: 49, buyDate: "2009-10-08" });
        expect(await tradingModule.getProfitRecords(account.id)).toEqual([]);

        // 어느 계좌의 어느 날짜를 건너뛰었는지 남긴다
        const warnings = warnSpy.mock.calls.filter((args: unknown[]) => {
          const line = args.join(" ");
          return line.includes(account.id) && line.includes("2009-10-07");
        });
        expect(warnings).toHaveLength(1);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
