/**
 * 체결 전 주문표 신선도 판정 테스트 (#96)
 *
 * 주문표를 체결하는 모든 경로(일일 마감의 processHistoricalOrders, 화면 진입의
 * processPreviousDayExecution)가 체결 전에 신선도 판정을 거쳐, 낡은 주문표는
 * 다시 만든 뒤 체결하는지 실제 DB로 검증한다.
 *
 * 낡은 주문표는 옛 규칙이나 이른 종가로 만들어져 지금 다시 만들면 나오지 않을 주문이다.
 * 여기서는 예수금보다 큰 매수를 넣어 둔다 - 그대로 체결하면 settle의 현금 검사가
 * 예외를 던져 lastProcessedDate가 앞으로 가지 않고 그 계좌의 마감이 멈춘다.
 *
 * 합성 시계열 (TQQQ 상장 이전 날짜라 실제 시세와 겹치지 않는다):
 * - 2009-08-03 $100, 2009-08-04 $99, 2009-08-05 $98
 * - Pro1, 시드 $100,000, 운용 시작일 2009-08-04
 * - 08-04 주문표 (직전 종가 $100): 티어 1 LOC 매수 floor(100 × 0.9999, 2) = $99.99,
 *   floor(5,000 ÷ 99.99) = 50주 → 종가 $99에 체결
 * - 08-05 주문표 (직전 종가 $99): 티어 2 LOC 매수 floor(99 × 0.9999, 2) = $98.99,
 *   floor(10,000 ÷ 98.99) = 101주 / 티어 1 LOC 매도 floor(99 × 1.0001, 2) = $99.00, 50주
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, gte, lte } from "drizzle-orm";

import { hasDb } from "@/test-utils/db";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { dailyPrices } from "@/database/schema/index";
import type { DailyOrder, TradingAccount } from "@/types/trading";

const TEST_USER_ID = randomUUID();
const TICKER = "TQQQ";
const SERIES = [
  { date: "2009-08-03", adjClose: 100 },
  { date: "2009-08-04", adjClose: 99 },
  { date: "2009-08-05", adjClose: 98 },
];
const CYCLE_START_DATE = "2009-08-04";
const CURRENT_DATE = "2009-08-06";

/** 예수금($100,000)보다 큰 매수: 종가 $99 × 2,000주 = $198,000 */
const STALE_BUY = {
  tier: 1,
  type: "BUY",
  orderMethod: "LOC",
  limitPrice: 120,
  shares: 2000,
} as const;

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

describe.skipIf(!hasDb)("체결 전 주문표 신선도 판정 (#96)", () => {
  let tradingModule: typeof import("@/database/trading");
  let trading: typeof import("..");
  let account: TradingAccount;
  let logSpy: ReturnType<typeof vi.spyOn>;

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

    tradingModule = await import("@/database/trading");
    trading = await import("..");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·주문·홀딩 CASCADE 삭제
    await deleteSeriesPriceRows();
  });

  beforeEach(async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    account = await tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "체결 전 신선도 테스트 계좌",
      ticker: TICKER,
      seedCapital: 100_000,
      strategy: "Pro1",
      cycleStartDate: CYCLE_START_DATE,
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  /** 로그 가운데 계좌 id와 날짜를 함께 담은 것 */
  function logsAbout(date: string): unknown[][] {
    return logSpy.mock.calls.filter((args: unknown[]) => {
      const line = args.join(" ");
      return line.includes(account.id) && line.includes(date);
    });
  }

  describe("일일 마감 (processHistoricalOrders)", () => {
    it("낡은 주문표가 저장된 날짜는 다시 만든 주문표로 체결하고 로그를 남긴다", async () => {
      await tradingModule.createDailyOrder(account.id, { date: "2009-08-04", ...STALE_BUY });

      await trading.processHistoricalOrders(account, CURRENT_DATE);

      // 낡은 주문은 사라지고, 지금 다시 만든 주문이 종가 $99에 체결됐다
      const orders = await tradingModule.getDailyOrders(account.id, "2009-08-04");
      expect(content(orders)).toEqual([
        {
          tier: 1,
          type: "BUY",
          orderMethod: "LOC",
          limitPrice: 99.99,
          shares: 50,
          executed: true,
        },
      ]);
      const tier1 = (await tradingModule.getTierHoldings(account.id)).find((h) => h.tier === 1);
      expect(tier1).toMatchObject({ buyPrice: 99, shares: 50, buyDate: "2009-08-04" });

      // 마감이 멈추지 않고 다음 거래일까지 진행됐다
      const after = await tradingModule.getTradingAccountById(account.id, TEST_USER_ID);
      expect(after?.lastProcessedDate).toBe("2009-08-05");

      // 배포일에 몇 계좌가 영향을 받았는지 볼 수 있도록 계좌 id와 날짜를 남긴다
      expect(logsAbout("2009-08-04")).toHaveLength(1);
    });

    it("내용이 같은 주문표는 교체하지 않고 그대로 체결하며 로그도 남기지 않는다", async () => {
      const fresh = await tradingModule.createDailyOrder(account.id, {
        date: "2009-08-04",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99.99,
        shares: 50,
      });

      await trading.processHistoricalOrders(account, CURRENT_DATE);

      const orders = await tradingModule.getDailyOrders(account.id, "2009-08-04");
      expect(orders.map((order) => order.id)).toEqual([fresh.id]);
      expect(orders[0].executed).toBe(true);
      expect(logsAbout("2009-08-04")).toHaveLength(0);
    });

    it("날짜를 차례로 처리하므로 다음 날짜는 직전 날짜 마감 뒤의 보유 상태로 판정한다", async () => {
      // 08-05 주문표를 08-04 마감 전(티어 1 미보유) 상태로 미리 만들어 둔 경우:
      // 티어 1 매수 floor(99 × 0.9999, 2) = $98.99, floor(5,000 ÷ 98.99) = 50주
      await tradingModule.createDailyOrder(account.id, {
        date: "2009-08-05",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 98.99,
        shares: 50,
      });

      await trading.processHistoricalOrders(account, CURRENT_DATE);

      // 08-04에 티어 1을 샀으므로 08-05 주문표는 티어 2 매수 + 티어 1 매도로 다시 만들어진다
      const orders = await tradingModule.getDailyOrders(account.id, "2009-08-05");
      expect(content(orders)).toEqual([
        {
          tier: 1,
          type: "SELL",
          orderMethod: "LOC",
          limitPrice: 99,
          shares: 50,
          executed: false,
        },
        {
          tier: 2,
          type: "BUY",
          orderMethod: "LOC",
          limitPrice: 98.99,
          shares: 101,
          executed: true,
        },
      ]);
      expect(logsAbout("2009-08-05")).toHaveLength(1);
    });
  });

  describe("화면 진입 (processPreviousDayExecution)", () => {
    it("직전 거래일의 낡은 주문표를 다시 만든 뒤 체결한다", async () => {
      await tradingModule.createDailyOrder(account.id, { date: "2009-08-04", ...STALE_BUY });

      const results = await trading.processPreviousDayExecution(account.id, "2009-08-05");

      expect(results).toEqual([
        expect.objectContaining({
          tier: 1,
          type: "BUY",
          executed: true,
          limitPrice: 99.99,
          closePrice: 99,
          shares: 50,
        }),
      ]);
      const orders = await tradingModule.getDailyOrders(account.id, "2009-08-04");
      expect(content(orders)).toEqual([
        {
          tier: 1,
          type: "BUY",
          orderMethod: "LOC",
          limitPrice: 99.99,
          shares: 50,
          executed: true,
        },
      ]);
    });
  });
});
