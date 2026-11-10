/**
 * 예수금보다 큰 시드 감액이 적용일에 사이클을 끝내는지 검증한다 (ADR-0004, ADR-0006, #117)
 *
 * 사이클 중에 시드를 직전 마감 예수금보다 많이 줄이면, 적용일 주문표는 매수 없이 보유 티어를
 * 모두 MOC로 판다. 마감에서 그날 종가로 체결되고 보유가 비어 사이클이 정상 완료와 같은 경로로
 * 끝난다 - 사이클 번호가 오르고, 수익 기록은 끝난 사이클의 번호로 남는다. 그다음 거래일
 * 주문표가 새 시드로 1번 티어를 사며 다음 사이클이 시작된다.
 *
 * 적용일은 바꾼 날의 다음 평일이라 휴장일일 수 있다. 판정은 "적용일 = 그날"이 아니라 그날과
 * 가격 행 기준 직전 거래일의 시드를 견주어 하므로, 적용일 뒤의 실제 첫 거래일에 판정된다.
 *
 * 합성 시세 (상장 이전 날짜라 실제 시세와 겹치지 않는다. 직전 종가 $100부터 하루 $1씩 내린다):
 * - 평일 적용일: TQQQ 2009-10-30(금) $100, 11-02(월) $99, 11-03(화) $98, 11-04(수) $97, 11-05(목) $96
 * - 휴장 적용일: SOXL 2009-11-23(월) $100, 11-24(화) $99, 11-25(수) $98, 11-27(금) $97, 11-30(월) $96
 *   (11-26(목)은 추수감사절 휴장이라 가격 행이 없다)
 * 계좌: Pro2(티어 1 10%, 티어 2 15%, 매수 지정가 = floor(직전 종가 × 0.9999, 2),
 * 매도 지정가 = floor(매수가 × 1.015, 2)), 시드 $10,000.
 *
 * 손으로 계산한 흐름 (두 경우 모두 같다, 첫날 = 운용 시작일):
 * - 첫날: 티어 1을 지정가 $99.99로 floor(1,000 ÷ 99.99) = 10주, 종가 $99에 체결 → $990
 * - 둘째 날: 티어 2를 지정가 $98.99로 floor(1,500 ÷ 98.99) = 15주, 종가 $98에 체결 → $1,470.
 *   티어 1 매도 지정가 $100.48 > $98이라 팔지 않는다. 이날 시드를 $2,000로 줄인다.
 *   이날 마감 뒤 예수금 = 10,000 - 2,460 = $7,540 < 감액 $8,000
 * - 적용일(휴장이면 그 뒤 첫 거래일): 사이클 자본 $2,000 - 투자 중 $2,460 < 0 → 매수 없이
 *   티어 1 10주, 티어 2 15주를 MOC로 판다. 종가 $97에 체결: 손익 -20, -15. 사이클 2로 넘어간다
 * - 그다음 거래일: 새 시드로 티어 1을 지정가 $96.99로 floor(200 ÷ 96.99) = 2주
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";

import { hasDb } from "@/test-utils/db";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { dailyPrices } from "@/database/schema/index";
import type { DailyOrder, Ticker } from "@/types/trading";

const TEST_USER_ID = randomUUID();

interface Scenario {
  label: string;
  ticker: Ticker;
  createdOn: string;
  prices: Array<{ date: string; adjClose: number }>;
  // 운용 시작일, 시드를 줄이는 날, 모두 파는 날, 다음 사이클의 첫 매수일
  firstDay: string;
  changedOn: string;
  sellAllOn: string;
  nextCycleOn: string;
}

const SCENARIOS: Scenario[] = [
  {
    label: "적용일이 거래일이면 적용일",
    ticker: "TQQQ",
    createdOn: "2009-10-30",
    prices: [
      { date: "2009-10-30", adjClose: 100 },
      { date: "2009-11-02", adjClose: 99 },
      { date: "2009-11-03", adjClose: 98 },
      { date: "2009-11-04", adjClose: 97 },
      { date: "2009-11-05", adjClose: 96 },
    ],
    firstDay: "2009-11-02",
    changedOn: "2009-11-03",
    sellAllOn: "2009-11-04",
    nextCycleOn: "2009-11-05",
  },
  {
    label: "적용일이 휴장일이면 그 뒤 첫 거래일",
    ticker: "SOXL",
    createdOn: "2009-11-23",
    prices: [
      { date: "2009-11-23", adjClose: 100 },
      { date: "2009-11-24", adjClose: 99 },
      { date: "2009-11-25", adjClose: 98 },
      { date: "2009-11-27", adjClose: 97 },
      { date: "2009-11-30", adjClose: 96 },
    ],
    firstDay: "2009-11-24",
    changedOn: "2009-11-25", // 적용일 11-26(목)은 휴장
    sellAllOn: "2009-11-27",
    nextCycleOn: "2009-11-30",
  },
];

function orderLines(orders: DailyOrder[]) {
  return orders
    .map((order) => ({
      tier: order.tier,
      type: order.type,
      orderMethod: order.orderMethod,
      shares: order.shares,
    }))
    .sort((a, b) => a.tier - b.tier || a.type.localeCompare(b.type));
}

/** 날짜 다음 날 (YYYY-MM-DD, UTC) */
function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

describe.skipIf(!hasDb)("예수금보다 큰 시드 감액으로 끝나는 사이클", () => {
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
        SCENARIOS.flatMap((scenario) =>
          scenario.prices.map((bar) => ({
            ticker: scenario.ticker,
            date: bar.date,
            open: bar.adjClose,
            high: bar.adjClose,
            low: bar.adjClose,
            close: bar.adjClose,
            adjClose: bar.adjClose,
            volume: 1000,
          }))
        )
      )
      .onConflictDoNothing()
      .returning({ id: dailyPrices.id });
    syntheticPriceIds.push(...inserted.map((row) => row.id));

    storage = await import("@/database/trading");
    trading = await import("..");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·주문·보유·기록·시드 이력 CASCADE 삭제
    if (syntheticPriceIds.length > 0) {
      await db.delete(dailyPrices).where(inArray(dailyPrices.id, syntheticPriceIds));
    }
  });

  it.each(SCENARIOS)(
    "$label에 보유 티어를 모두 팔고 다음 거래일에 새 시드로 다음 사이클을 시작해야 한다",
    async (scenario) => {
      const created = await storage.createTradingAccount(
        TEST_USER_ID,
        {
          name: "시드 감액 사이클 종료 테스트 계좌",
          ticker: scenario.ticker,
          seedCapital: 10_000,
          strategy: "Pro2",
          cycleStartDate: scenario.firstDay,
        },
        scenario.createdOn
      );
      const reload = async () => (await storage.getTradingAccountById(created.id, TEST_USER_ID))!;

      // 둘째 날 아침까지 마감한 뒤(첫날 티어 1 체결) 둘째 날에 시드를 줄인다
      await trading.processHistoricalOrders(await reload(), scenario.changedOn);
      // 오늘 티어 2 매수($98.99 × 15주 = $1,484.85)가 체결되면 예수금 9,010 → $7,525.15라
      // 감액 $8,000은 오늘 체결에 달렸다. 확인 없이는 쓰지 않고, 확인하면 쓴다
      const unconfirmed = await trading.changeSeed(
        created.id,
        TEST_USER_ID,
        2_000,
        scenario.changedOn,
        false
      );
      expect(unconfirmed).toEqual({
        status: "needsConfirmation",
        classification: "depends",
        seedCutLimits: { closedCash: 9_010, cashIfTodayBuyFills: 7_525.15 },
      });
      const confirmed = await trading.changeSeed(
        created.id,
        TEST_USER_ID,
        2_000,
        scenario.changedOn,
        true
      );
      expect(confirmed?.status).toBe("changed");

      // 둘째 날을 마감하고(티어 2 체결) 모두 파는 날 아침의 주문표를 본다
      await trading.processHistoricalOrders(await reload(), scenario.sellAllOn);
      const sellAll = await trading.getFreshDailyOrders(await reload(), scenario.sellAllOn);
      expect(orderLines(sellAll.orders)).toEqual([
        { tier: 1, type: "SELL", orderMethod: "MOC", shares: 10 },
        { tier: 2, type: "SELL", orderMethod: "MOC", shares: 15 },
      ]);

      // 모두 파는 날을 마감한다: 종가로 체결되고 사이클이 끝난다
      await trading.processHistoricalOrders(await reload(), scenario.nextCycleOn);
      const afterSell = await reload();
      expect(afterSell.cycleNumber).toBe(2);
      const holdings = await storage.getTierHoldings(created.id);
      expect(holdings.filter((holding) => holding.shares > 0)).toEqual([]);
      const soldOnSellAll = (await storage.getProfitRecords(created.id)).filter(
        (record) => record.sellDate === scenario.sellAllOn
      );
      expect(
        soldOnSellAll.map((record) => ({
          cycleNumber: record.cycleNumber,
          tier: record.tier,
          sellPrice: record.sellPrice,
          profit: record.profit,
        }))
      ).toEqual([
        { cycleNumber: 1, tier: 1, sellPrice: 97, profit: -20 },
        { cycleNumber: 1, tier: 2, sellPrice: 97, profit: -15 },
      ]);

      // 다음 거래일 주문표는 새 시드로 티어 1을 산다
      const nextCycle = await trading.getFreshDailyOrders(afterSell, scenario.nextCycleOn);
      expect(orderLines(nextCycle.orders)).toEqual([
        { tier: 1, type: "BUY", orderMethod: "LOC", shares: 2 },
      ]);

      // 다음 사이클의 첫 매수가 체결되면 시드 감액이 남긴 상태 없이 이어진다
      await trading.processHistoricalOrders(afterSell, nextDay(scenario.nextCycleOn));
      const nextHoldings = await storage.getTierHoldings(created.id);
      expect(
        nextHoldings.filter((holding) => holding.shares > 0).map((h) => [h.tier, h.shares])
      ).toEqual([[1, 2]]);
    }
  );
});
