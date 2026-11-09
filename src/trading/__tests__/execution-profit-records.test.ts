/**
 * 매도 체결의 수익 기록이 체결 판정과 같은 값을 남기는지 검증한다 (#97, ADR-0003)
 *
 * 예수금 계산은 이번 사이클의 실현손익을 수익 기록에서 읽는다. 그래서 기록은
 * settle이 계산한 매도금액·손익을 그대로 담고, 체결 시점(사이클 완료 처리 전)의
 * 계좌 사이클 번호를 가져야 한다.
 *
 * 합성 시계열 (SOXL 상장 이전 날짜라 실제 시세와 겹치지 않는다):
 * SOXL 2009-03-02 $100, 03-03 $99, 03-04 $101
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, gte, lte } from "drizzle-orm";

import { hasDb } from "@/test-utils/db";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { dailyPrices } from "@/database/schema/index";

const TEST_USER_ID = randomUUID();
const FIRST_DATE = "2009-03-02";
const LAST_DATE = "2009-03-04";
const PRICES = [
  { date: "2009-03-02", adjClose: 100 },
  { date: "2009-03-03", adjClose: 99 },
  { date: "2009-03-04", adjClose: 101 },
];

async function deletePriceRows(): Promise<void> {
  await db
    .delete(dailyPrices)
    .where(
      and(
        eq(dailyPrices.ticker, "SOXL"),
        gte(dailyPrices.date, FIRST_DATE),
        lte(dailyPrices.date, LAST_DATE)
      )
    );
}

describe.skipIf(!hasDb)("매도 체결의 수익 기록", () => {
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
        ticker: "SOXL" as const,
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
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·주문·홀딩·수익 기록 CASCADE 삭제
    await deletePriceRows();
  });

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("사이클을 끝내는 매도도 완료 처리 전의 사이클 번호로 기록한다", async () => {
    const account = await tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "수익 기록 사이클 번호 테스트 계좌",
      ticker: "SOXL",
      seedCapital: 100_000,
      strategy: "Pro2",
      cycleStartDate: "2009-03-03",
    });

    // 03-03: 매수 LOC floor(100 × 0.9999, 2) = $99.99, floor(10,000 ÷ 99.99) = 100주가
    //        종가 $99에 체결된다
    // 03-04: 매도 LOC ceil(99 × 1.015, 2) = $100.49가 종가 $101에 체결되어
    //        보유 티어가 모두 비고 사이클 1이 끝난다
    await trading.processHistoricalOrders(account, "2009-03-05");

    const records = await tradingModule.getProfitRecords(account.id);
    expect(records).toEqual([
      expect.objectContaining({
        cycleNumber: 1,
        tier: 1,
        buyDate: "2009-03-03",
        buyPrice: 99,
        buyQuantity: 100,
        sellDate: "2009-03-04",
        sellPrice: 101,
        buyAmount: 9900,
        sellAmount: 10100,
        profit: 200,
        profitRate: 2.02,
      }),
    ]);

    const after = await tradingModule.getTradingAccountById(account.id, TEST_USER_ID);
    expect(after?.cycleNumber).toBe(2);
    expect(await tradingModule.getCycleRealizedPnl(account.id, 1)).toBe(200);
    // 새 사이클은 실현손익 0에서 시작한다
    expect(await tradingModule.getCycleRealizedPnl(account.id, 2)).toBe(0);
  });
});
