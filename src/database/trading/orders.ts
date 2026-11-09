/**
 * 일일 주문표 저장 함수
 *
 * 주문표 생성 규칙은 src/strategy의 planOrders가, 그 규칙을 호출하는 조율은
 * src/trading이 소유한다. 이 모듈은 주문·가격 행의 조회와 저장만 한다.
 */

import { eq, and, desc, asc, lt, gt, sql } from "drizzle-orm";

import type { DailyOrder, Ticker, OrderType, OrderMethod } from "@/types/trading";

import { db, type DbExecutor } from "../db-drizzle";
import { dailyOrders, dailyPrices } from "../schema/index";

import { mapDrizzleDailyOrder } from "./mappers";

/**
 * 당일 주문표 조회 (티어, 구분 순)
 */
export async function getDailyOrders(
  accountId: string,
  date: string,
  executor: DbExecutor = db
): Promise<DailyOrder[]> {
  const rows = await executor
    .select()
    .from(dailyOrders)
    .where(and(eq(dailyOrders.accountId, accountId), eq(dailyOrders.date, date)))
    .orderBy(asc(dailyOrders.tier), asc(dailyOrders.type));

  return rows.map(mapDrizzleDailyOrder);
}

/**
 * 한 계좌·날짜의 주문표를 트랜잭션이 끝날 때까지 잠근다
 *
 * 주문표 교체(replaceDailyOrders)와 체결 트랜잭션이 같은 계좌·날짜에서 서로 끼어들지
 * 못하게, 둘 다 주문표를 읽거나 바꾸기 전에 이 잠금부터 쥔다. 잠금은 커밋이나 롤백 때
 * 풀린다. 그래서 반드시 트랜잭션 안에서 불러야 한다 - 트랜잭션 밖에서는 문장이 끝나자마자
 * 풀려 아무것도 막지 못한다.
 *
 * 행 잠금으로는 막을 수 없다. 교체는 "체결된 주문이 없다"를 읽고 나서 지우는데, 읽기는
 * 행을 잠그지 않고 아직 없는 행은 잠글 수도 없다.
 *
 * @param executor - 잠금을 쥘 트랜잭션
 */
export async function lockDailyOrders(
  accountId: string,
  date: string,
  executor: DbExecutor
): Promise<void> {
  const key = `${accountId}:${date}`;
  await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`);
}

/**
 * 기준일보다 뒤 날짜에 체결된 주문이 하나라도 있는지 확인
 * 있으면 지금의 보유 티어는 기준일 직전 마감 뒤의 상태가 아니다.
 */
export async function hasExecutedOrdersAfter(accountId: string, date: string): Promise<boolean> {
  const rows = await db
    .select({ id: dailyOrders.id })
    .from(dailyOrders)
    .where(
      and(
        eq(dailyOrders.accountId, accountId),
        gt(dailyOrders.date, date),
        eq(dailyOrders.executed, true)
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * 주문 생성
 */
export async function createDailyOrder(
  accountId: string,
  data: {
    date: string;
    tier: number;
    type: OrderType;
    orderMethod: OrderMethod;
    limitPrice: number;
    shares: number;
  }
): Promise<DailyOrder> {
  const result = await db
    .insert(dailyOrders)
    .values({
      accountId,
      date: data.date,
      tier: data.tier,
      type: data.type,
      orderMethod: data.orderMethod,
      limitPrice: data.limitPrice,
      shares: data.shares,
      executed: false,
    })
    .returning();

  return mapDrizzleDailyOrder(result[0]);
}

/**
 * 주문 실행 상태 업데이트 (조건부 선점)
 * 상태가 실제로 바뀌는 경우에만 갱신한다. 동시 체결 처리가 같은 주문을
 * 중복 반영하지 못하도록, 이미 목표 상태인 주문에는 false를 반환한다.
 */
export async function updateOrderExecuted(
  orderId: string,
  executed: boolean,
  executor: DbExecutor = db
): Promise<boolean> {
  const result = await executor
    .update(dailyOrders)
    .set({ executed, updatedAt: new Date() })
    .where(and(eq(dailyOrders.id, orderId), eq(dailyOrders.executed, !executed)))
    .returning();

  return result.length > 0;
}

/**
 * 특정 날짜의 종가(adjClose) 조회
 * 해당 날짜의 가격 행이 없으면(휴장일 또는 미적재) null을 반환한다.
 * 과거 날짜로 폴백하지 않는다 - 폴백은 휴장일과 데이터 미적재를 구분하지 못해
 * 잘못된 기준가로 체결하는 원인이 된다 (#43 가격 불변식).
 */
export async function getClosingPrice(ticker: Ticker, date: string): Promise<number | null> {
  const rows = await db
    .select({ adjClose: dailyPrices.adjClose })
    .from(dailyPrices)
    .where(and(eq(dailyPrices.ticker, ticker), eq(dailyPrices.date, date)))
    .limit(1);

  return rows[0]?.adjClose ?? null;
}

/**
 * 직전 거래일의 종가(adjClose) 조회
 * 거래일은 가격 데이터가 존재하는 날로 정의한다 - 기준일 이전의 가장 최근 가격 행.
 */
export async function getPreviousTradingClose(
  ticker: Ticker,
  date: string
): Promise<{ date: string; adjClose: number } | null> {
  const rows = await db
    .select({ date: dailyPrices.date, adjClose: dailyPrices.adjClose })
    .from(dailyPrices)
    .where(and(eq(dailyPrices.ticker, ticker), lt(dailyPrices.date, date)))
    .orderBy(desc(dailyPrices.date))
    .limit(1);

  return rows[0] ?? null;
}

/** 저장된 가장 최근 종가(adjClose)와 그 거래일 (YYYY-MM-DD) (#98) */
export interface LatestClose {
  date: string;
  adjClose: number;
}

/**
 * 저장된 가장 최근 종가(adjClose)와 그 거래일 조회 (#98)
 * 계좌 화면의 평가금(가장 최근 종가 × 보유 수량)에 쓴다. 가격 행이 하나도 없으면 null.
 */
export async function getLatestClose(
  ticker: Ticker,
  executor: DbExecutor = db
): Promise<LatestClose | null> {
  const rows = await executor
    .select({ date: dailyPrices.date, adjClose: dailyPrices.adjClose })
    .from(dailyPrices)
    .where(eq(dailyPrices.ticker, ticker))
    .orderBy(desc(dailyPrices.date))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * 두 날짜 사이(양 끝 제외)의 실제 거래일 목록 (가격 데이터 행 기준)
 * #41: 평일 근사는 휴장일을 거래일로 세어 백테스트보다 하루 일찍 손절하게 만든다.
 */
export async function listTradingDatesBetween(
  ticker: Ticker,
  afterDate: string,
  beforeDate: string,
  executor: DbExecutor = db
): Promise<string[]> {
  const rows = await executor
    .select({ date: dailyPrices.date })
    .from(dailyPrices)
    .where(
      and(
        eq(dailyPrices.ticker, ticker),
        gt(dailyPrices.date, afterDate),
        lt(dailyPrices.date, beforeDate)
      )
    );

  return rows.map((row) => row.date);
}

/**
 * 저장할 주문 하나. 전략의 주문 의도에서 표시용 지정가까지 정해진 상태다
 * (MOC는 규칙상 지정가가 없지만 limit_price 컬럼이 NOT NULL이라 값이 채워져 있다).
 */
export interface NewDailyOrder {
  tier: number;
  type: OrderType;
  orderMethod: OrderMethod;
  limitPrice: number;
  shares: number;
}

/**
 * 특정 날짜의 주문표를 통째로 교체
 * 기존 주문 삭제와 새 주문 삽입을 한 트랜잭션으로 묶어 원자성을 보장하고,
 * 같은 계좌·날짜의 체결 트랜잭션과는 lockDailyOrders로 차례를 정한다.
 * 무엇을 주문할지는 조율 계층(src/trading)이 정하고, 이 함수는 저장만 한다.
 *
 * @param accountId - 계좌 ID
 * @param date - 주문 기준일
 * @param orders - 저장할 주문 목록 (미체결 상태로 삽입된다)
 * @returns 생성된 주문 목록 (getDailyOrders와 같은 티어, 구분 순)
 * @throws 해당 날짜에 체결된 주문이 있으면 에러
 */
export async function replaceDailyOrders(
  accountId: string,
  date: string,
  orders: NewDailyOrder[]
): Promise<DailyOrder[]> {
  return db.transaction(async (tx) => {
    // 같은 날짜의 체결 트랜잭션이나 다른 교체가 끼어들지 못하게 먼저 잠근다.
    // 잠그지 않으면 아래 확인과 삭제 사이에 다른 요청의 체결이 커밋돼, 체결된 행을
    // 지우고 다시 체결될 미체결 행을 넣게 된다.
    await lockDailyOrders(accountId, date, tx);

    // 체결된 주문이 있는 날짜는 교체 불가 - 삭제 후 미체결로 되살리면
    // 재체결 처리로 홀딩·수익 기록이 중복 반영된다.
    // 조율 계층의 판단이 아니라 저장 자체의 불변식이므로 여기서 막는다.
    const executedRows = await tx
      .select({ id: dailyOrders.id })
      .from(dailyOrders)
      .where(
        and(
          eq(dailyOrders.accountId, accountId),
          eq(dailyOrders.date, date),
          eq(dailyOrders.executed, true)
        )
      )
      .limit(1);
    if (executedRows.length > 0) {
      throw new Error(`Cannot regenerate orders for ${date}: executed orders exist`);
    }

    await tx
      .delete(dailyOrders)
      .where(and(eq(dailyOrders.accountId, accountId), eq(dailyOrders.date, date)));

    for (const order of orders) {
      await tx.insert(dailyOrders).values({
        accountId,
        date,
        tier: order.tier,
        type: order.type,
        orderMethod: order.orderMethod,
        limitPrice: order.limitPrice,
        shares: order.shares,
        executed: false,
      });
    }

    // 조회와 같은 순서로 돌려준다 - 처음 만든 주문표와 다시 조회한 주문표의 줄 순서가 같아야 한다
    return getDailyOrders(accountId, date, tx);
  });
}
