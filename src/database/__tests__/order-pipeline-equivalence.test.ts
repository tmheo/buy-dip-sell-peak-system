/**
 * 실계좌 주문 파이프라인 ↔ 백테스트 동등성 테스트 (#47, #43 이행 3단계)
 *
 * 같은 가격 시계열(adjClose)을 공급했을 때, 실계좌 파이프라인
 * (generateDailyOrders → processOrderExecution)이 백테스트와 동일한 주문을
 * 내는지 검증한다. 백테스트의 하루 루프는 src/strategy의 planOrders + settle
 * 합성이므로(#46), 순수 루프를 기대값으로 삼고 BacktestEngine과도 교차 검증한다.
 *
 * 시계열에 휴장일(가격 행이 없는 평일)을 끼워 넣어 다음을 함께 검증한다:
 * - #41: 손절일이 실제 거래일 기준으로 계산된다 (평일 근사는 하루 일찍 손절)
 * - 휴장일에는 주문이 생성·체결되지 않는다 (getClosingPrice 과거 날짜 폴백 제거)
 * - 사이클 완료 후 실계좌는 시드 금액으로 새 사이클을 시작한다 (복리 이월 없음)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import Decimal from "decimal.js";

import type { DailyPrice } from "@/types";
import type { DailyOrder } from "@/types/trading";
import type { CycleState, Execution, OrderIntent } from "@/strategy";
import { getStrategyParams, planOrders, settle, startNextCycle } from "@/strategy";
import { BacktestEngine } from "@/backtest/engine";
import { hasDb } from "@/test-utils/db";
import { db } from "../db-drizzle";
import { users } from "../schema/auth";
import { dailyPrices } from "../schema/index";

const TEST_USER_ID = randomUUID();
const TICKER = "TQQQ"; // 상장(2010-02-11) 이전 날짜를 사용해 실제 시세와 충돌하지 않게 함
const STRATEGY = "Pro1"; // 손절일 10 거래일, 매수 -0.01%, 매도 +0.01%
const SEED_CAPITAL = 100_000;

/**
 * 합성 시계열. 2009-07-03(금)은 독립기념일 휴장으로 가격 행이 없다.
 * close는 adjClose와 다르게 저장해, 파이프라인이 adjClose를 쓰는지도 검증한다.
 *
 * 경로 설계:
 * - 07-02 ~ 07-17 연속 하락: 티어 1-6 + 예비 티어(7) 순차 매수
 * - 07-17: 티어 1이 보유 10 거래일째 도달 → MOC 손절
 *   (평일 근사라면 휴장일 07-03을 거래일로 세어 07-16에 하루 일찍 손절 - #41)
 * - 07-20 반등: 티어 2는 MOC 손절일 도달, 티어 3-7은 LOC 매도 → 전량 매도, 사이클 완료
 * - 07-21: 새 사이클 첫 매수 (실계좌는 시드 금액 고정, 백테스트는 복리 이월)
 */
const SERIES: Array<{ date: string; adjClose: number }> = [
  { date: "2009-07-01", adjClose: 100.0 },
  { date: "2009-07-02", adjClose: 99.5 },
  { date: "2009-07-06", adjClose: 99.0 },
  { date: "2009-07-07", adjClose: 98.5 },
  { date: "2009-07-08", adjClose: 98.0 },
  { date: "2009-07-09", adjClose: 97.5 },
  { date: "2009-07-10", adjClose: 97.0 },
  { date: "2009-07-13", adjClose: 96.5 },
  { date: "2009-07-14", adjClose: 96.0 },
  { date: "2009-07-15", adjClose: 95.5 },
  { date: "2009-07-16", adjClose: 95.0 },
  { date: "2009-07-17", adjClose: 94.5 },
  { date: "2009-07-20", adjClose: 99.6 },
  { date: "2009-07-21", adjClose: 99.55 },
];
const HOLIDAY = "2009-07-03";
const CYCLE_START_DATE = SERIES[1].date; // 백테스트 첫날(07-01)은 전일 종가가 없어 주문이 없다
const CURRENT_DATE = "2009-07-22"; // 마감 처리 기준일 (전일까지 처리)

/** 주문 비교용 정규화 키. MOC는 지정가가 규칙상 없으므로(null) DB 표시값을 무시한다. */
interface NormalizedOrder {
  type: "BUY" | "SELL";
  tier: number;
  orderMethod: "LOC" | "MOC";
  limitPrice: number | null;
  shares: number;
  executed: boolean;
}

function sortOrders(orders: NormalizedOrder[]): NormalizedOrder[] {
  return [...orders].sort((a, b) => a.tier - b.tier || a.type.localeCompare(b.type));
}

/**
 * 시계열 한 칸을 가격 행으로 변환.
 * close ≠ adjClose로 두어 파이프라인이 adjClose 불변식(#43)을 따르는지 판별한다.
 */
function toPriceRow(bar: { date: string; adjClose: number }) {
  return {
    ticker: TICKER,
    date: bar.date,
    open: bar.adjClose,
    high: bar.adjClose,
    low: bar.adjClose,
    close: new Decimal(bar.adjClose).add(5).toNumber(),
    adjClose: bar.adjClose,
    volume: 1000,
  };
}

/** 합성 시계열 구간의 가격 행 삭제 (셋업 멱등성·정리 공용) */
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

function toNormalizedDbOrder(order: DailyOrder): NormalizedOrder {
  return {
    type: order.type,
    tier: order.tier,
    orderMethod: order.orderMethod,
    limitPrice: order.orderMethod === "MOC" ? null : order.limitPrice,
    shares: order.shares,
    executed: order.executed,
  };
}

/**
 * 순수 루프(planOrders + settle)를 실계좌 의미(사이클 자본 = 시드 금액 고정)로
 * 돌려 날짜별 기대 주문표를 만든다. 이 합성이 곧 백테스트의 하루 루프다(#46).
 */
function runReferenceLoop(): Map<string, NormalizedOrder[]> {
  const expected = new Map<string, NormalizedOrder[]>();
  let state: CycleState = {
    strategy: getStrategyParams(STRATEGY),
    cycleCapital: SEED_CAPITAL,
    holdings: [],
    cycleNumber: 1,
  };
  let cycleCompleted = false;

  for (let i = 1; i < SERIES.length; i++) {
    if (cycleCompleted) {
      state = startNextCycle(state, SEED_CAPITAL); // 실계좌: 시드 금액 고정
      cycleCompleted = false;
    }

    const orders = planOrders(state, SERIES[i - 1].adjClose);
    const { newState, executions, events } = settle(state, orders, {
      date: SERIES[i].date,
      close: SERIES[i].adjClose,
    });

    expected.set(SERIES[i].date, normalize(orders, executions));
    state = newState;
    cycleCompleted = events.some((e) => e.type === "CYCLE_COMPLETED");
  }

  return expected;
}

function normalize(orders: OrderIntent[], executions: Execution[]): NormalizedOrder[] {
  const executed = new Set(executions.map((e) => e.order));
  return sortOrders(
    orders.map((order) => ({
      type: order.type,
      tier: order.tier,
      orderMethod: order.orderMethod,
      limitPrice: order.orderMethod === "MOC" ? null : order.limitPrice,
      shares: order.shares,
      executed: executed.has(order),
    }))
  );
}

describe.skipIf(!hasDb)("실계좌 주문 파이프라인 동등성 (#47)", () => {
  let tradingModule: typeof import("../trading");
  let accountId: string;

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` })
      .onConflictDoNothing();

    // 이전 실행이 afterAll 전에 중단됐어도 유니크 위반 없이 다시 실행되게 한다
    await deleteSeriesPriceRows();
    await db.insert(dailyPrices).values(SERIES.map(toPriceRow));

    tradingModule = await import("../trading");

    const account = await tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "동등성 테스트 계좌",
      ticker: TICKER,
      seedCapital: SEED_CAPITAL,
      strategy: STRATEGY,
      cycleStartDate: CYCLE_START_DATE,
    });
    accountId = account.id;

    // 사이클 시작일부터 전일(07-21)까지 실계좌 마감 처리
    await tradingModule.processHistoricalOrders(
      accountId,
      CYCLE_START_DATE,
      null,
      CURRENT_DATE,
      TICKER,
      STRATEGY,
      SEED_CAPITAL
    );
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·주문·홀딩 CASCADE 삭제
    await deleteSeriesPriceRows();
  });

  it("모든 거래일에서 실계좌 주문표가 순수 전략 루프(백테스트 하루 루프)와 일치해야 한다", async () => {
    const expected = runReferenceLoop();

    for (const [date, expectedOrders] of expected) {
      const dbOrders = await tradingModule.getDailyOrders(accountId, date);
      const actual = sortOrders(dbOrders.map(toNormalizedDbOrder));

      expect(actual, `${date} 주문표`).toEqual(expectedOrders);
    }
  });

  it("BacktestEngine의 일별 주문·손절 거래와도 일치해야 한다 (첫 사이클 구간)", async () => {
    const prices: DailyPrice[] = SERIES.map(toPriceRow);
    const result = await new BacktestEngine(STRATEGY).run(
      {
        ticker: TICKER,
        strategy: STRATEGY,
        startDate: SERIES[0].date,
        endDate: SERIES[SERIES.length - 1].date,
        initialCapital: SEED_CAPITAL,
      },
      prices
    );

    // 사이클 완료일(07-20)까지만 비교한다. 그 이후 백테스트는 실현 손익을
    // 복리 이월하고 실계좌는 시드 금액을 유지하므로 자본 공급이 달라진다.
    const cycleEndIndex = SERIES.findIndex((bar) => bar.date === "2009-07-20");
    for (let i = 1; i <= cycleEndIndex; i++) {
      const snapshot = result.dailyHistory[i];
      const dbOrders = await tradingModule.getDailyOrders(accountId, SERIES[i].date);

      // LOC 주문: 지정가·수량·체결 여부까지 일치 (엔진 스냅샷은 MOC를 주문 내역에서 제외)
      const engineLoc = sortOrders(
        snapshot.orders.map((order) => ({
          type: order.type,
          tier: order.tier,
          orderMethod: order.orderType,
          limitPrice: order.limitPrice,
          shares: order.shares,
          executed: order.executed,
        }))
      );
      const dbLoc = sortOrders(
        dbOrders.filter((order) => order.orderMethod === "LOC").map(toNormalizedDbOrder)
      );
      expect(dbLoc, `${SERIES[i].date} LOC 주문`).toEqual(engineLoc);

      // MOC 손절: 엔진은 거래 내역(STOP_LOSS)으로 기록한다
      const engineStopLoss = snapshot.trades
        .filter((trade) => trade.type === "STOP_LOSS")
        .map((trade) => ({ tier: trade.tier, shares: trade.shares }))
        .sort((a, b) => a.tier - b.tier);
      const dbMoc = dbOrders
        .filter((order) => order.orderMethod === "MOC")
        .map((order) => ({ tier: order.tier, shares: order.shares }))
        .sort((a, b) => a.tier - b.tier);
      expect(dbMoc, `${SERIES[i].date} MOC 손절`).toEqual(engineStopLoss);
      dbOrders
        .filter((order) => order.orderMethod === "MOC")
        .forEach((order) => expect(order.executed, `${SERIES[i].date} MOC 체결`).toBe(true));
    }
  });

  it("#41: 손절일은 실제 거래일 기준이어야 한다 (휴장일을 거래일로 세지 않는다)", async () => {
    // 평일 근사라면 휴장일 07-03이 거래일로 세어져 07-16에 하루 일찍 MOC가 나간다
    const ordersOn16 = await tradingModule.getDailyOrders(accountId, "2009-07-16");
    const tier1On16 = ordersOn16.find((order) => order.tier === 1 && order.type === "SELL");
    expect(tier1On16?.orderMethod).toBe("LOC");
    expect(ordersOn16.every((order) => order.orderMethod !== "MOC")).toBe(true);

    // 실제 거래일 기준 보유 10일째인 07-17에 MOC 손절
    const ordersOn17 = await tradingModule.getDailyOrders(accountId, "2009-07-17");
    const tier1On17 = ordersOn17.find((order) => order.tier === 1 && order.type === "SELL");
    expect(tier1On17?.orderMethod).toBe("MOC");
    expect(tier1On17?.executed).toBe(true);
  });

  it("휴장일에는 주문이 생성되지 않고, getClosingPrice는 과거 날짜로 폴백하지 않아야 한다", async () => {
    expect(await tradingModule.getDailyOrders(accountId, HOLIDAY)).toHaveLength(0);
    expect(await tradingModule.getClosingPrice(TICKER, HOLIDAY)).toBeNull();
    // 거래일에는 해당 날짜의 adjClose를 반환한다 (close가 아니라)
    expect(await tradingModule.getClosingPrice(TICKER, "2009-07-06")).toBe(99.0);
  });

  it("사이클 완료 후 실계좌는 시드 금액으로 새 사이클을 시작해야 한다 (복리 이월 없음)", async () => {
    // 07-20 전량 매도로 사이클 1 완료 → cycleNumber 증가
    const account = await tradingModule.getTradingAccountById(accountId, TEST_USER_ID);
    expect(account?.cycleNumber).toBe(2);

    // 사이클 1 매도 7건(티어 1-7)의 수익 기록
    const profits = await tradingModule.getProfitRecords(accountId);
    expect(profits).toHaveLength(7);

    // 07-21 새 사이클 첫 매수: 시드 금액 × 티어1 비율(5%) 기준 수량
    // 매수 지정가 = floor(99.6 × (1 - 0.01%)) = 99.59, 수량 = floor(5,000 ÷ 99.59) = 50
    const holdings = await tradingModule.getTierHoldings(accountId);
    const tier1 = holdings.find((holding) => holding.tier === 1);
    expect(tier1?.shares).toBe(50);
    expect(tier1?.buyPrice).toBe(99.55);
    expect(tier1?.buyDate).toBe("2009-07-21");
    holdings
      .filter((holding) => holding.tier !== 1)
      .forEach((holding) => expect(holding.shares).toBe(0));

    // 마감 처리 진행 상태가 마지막 거래일로 영속화되어야 한다
    expect(account?.lastProcessedDate).toBe("2009-07-21");
  });
});
