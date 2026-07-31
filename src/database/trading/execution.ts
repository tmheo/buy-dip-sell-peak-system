/**
 * 주문 체결 처리 함수
 *
 * #43 이행 3단계: 체결 판정과 상태 전이 규칙은 src/strategy의 settle이 소유한다.
 * 이 모듈은 주문·보유 상태를 조회해 settle에 넘기고, 결과를 트랜잭션으로 저장만 한다.
 */

import { eq } from "drizzle-orm";

import type { CycleState, Execution, OrderIntent } from "@/strategy";
import { getStrategyParams, settle } from "@/strategy";
import type { DailyOrder, Ticker, Strategy } from "@/types/trading";
import { calculateSellLimitPrice, getPreviousTradingDate } from "@/utils/trading-core";

import { db, type DbExecutor } from "../db-drizzle";
import { tradingAccounts } from "../schema/index";

import { getTierHoldings, updateTierHolding } from "./tier-holdings";
import {
  getDailyOrders,
  getClosingPrice,
  getPreviousTradingClose,
  toStrategyHoldings,
  updateOrderExecuted,
  generateDailyOrders,
} from "./orders";
import { createProfitRecord } from "./profits";

export interface ExecutionResult {
  orderId: string;
  tier: number;
  type: "BUY" | "SELL";
  executed: boolean;
  limitPrice: number;
  closePrice: number;
  shares: number;
}

/**
 * 계좌의 전략 조회 (내부 헬퍼)
 */
export async function getAccountStrategy(accountId: string): Promise<Strategy> {
  return (await getAccountRow(accountId)).strategy;
}

/**
 * 사이클 완료 시 cycleNumber 증가
 * 모든 티어가 비었을 때 호출되어 다음 사이클을 준비
 *
 * @param accountId - 계좌 ID
 * @param executor - 쿼리 실행자 (트랜잭션 컨텍스트 전달용)
 * @returns 업데이트된 cycleNumber, 계좌가 없으면 null
 */
export async function completeCycleAndIncrement(
  accountId: string,
  executor: DbExecutor = db
): Promise<number | null> {
  // 1. 현재 cycle_number 조회
  const rows = await executor
    .select({ cycleNumber: tradingAccounts.cycleNumber })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.id, accountId))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  // 2. cycle_number 증가
  const newCycleNumber = rows[0].cycleNumber + 1;
  await executor
    .update(tradingAccounts)
    .set({ cycleNumber: newCycleNumber, updatedAt: new Date() })
    .where(eq(tradingAccounts.id, accountId));

  return newCycleNumber;
}

/**
 * DB 주문 행을 src/strategy의 주문 의도로 변환
 * MOC의 limit_price 컬럼 값은 표시용이므로 규칙상 지정가 없음(null)으로 되돌린다.
 */
function toOrderIntent(order: DailyOrder): OrderIntent {
  if (order.orderMethod === "MOC") {
    if (order.type !== "SELL") {
      throw new Error(`Unexpected MOC ${order.type} order: ${order.id}`);
    }
    return {
      type: "SELL",
      tier: order.tier,
      orderMethod: "MOC",
      limitPrice: null,
      shares: order.shares,
    };
  }
  return {
    type: order.type,
    tier: order.tier,
    orderMethod: "LOC",
    limitPrice: order.limitPrice,
    shares: order.shares,
  };
}

/**
 * 당일 주문 체결 처리
 * src/strategy의 settle이 당일 종가(adjClose)로 체결 판정·상태 전이를 결정하고,
 * 이 함수는 그 결과를 티어 홀딩·수익 기록·주문 상태에 트랜잭션으로 반영한다.
 * 사이클 완료 이벤트를 받으면 cycleNumber를 증가시킨다.
 *
 * @param accountId - 계좌 ID
 * @param date - 체결 처리할 날짜 (해당 날짜의 가격 행이 없으면 체결하지 않는다)
 * @param ticker - 종목
 * @returns 체결 결과 목록
 */
export async function processOrderExecution(
  accountId: string,
  date: string,
  ticker: Ticker
): Promise<ExecutionResult[]> {
  // 당일 종가 조회 (정확 일치 - 휴장일·미적재면 체결 처리 불가)
  const closePrice = await getClosingPrice(ticker, date);
  if (!closePrice) {
    return [];
  }

  const orders = await getDailyOrders(accountId, date);
  const pendingOrders = orders.filter((order) => !order.executed);

  // 미체결 주문이 없으면 현재 상태만 보고 (사이클 완료 중복 처리 방지)
  if (pendingOrders.length === 0) {
    return orders.map((order) => toExecutionResult(order, order.executed, closePrice));
  }

  const account = await getAccountRow(accountId);
  const state: CycleState = {
    strategy: getStrategyParams(account.strategy),
    cycleCapital: account.seedCapital, // 실계좌의 사이클 자본 = 사용자 설정 시드 금액 (#43)
    holdings: await toStrategyHoldings(ticker, await getTierHoldings(accountId), date),
    cycleNumber: account.cycleNumber,
  };

  const intents = pendingOrders.map(toOrderIntent);
  const orderByIntent = new Map(intents.map((intent, index) => [intent, pendingOrders[index]]));
  const { executions, events } = settle(state, intents, { date, close: closePrice });
  const executedIntents = new Set(executions.map((execution) => execution.order));

  await db.transaction(async (tx) => {
    for (const execution of executions) {
      const order = orderByIntent.get(execution.order);
      if (!order) {
        throw new Error("Execution does not match a submitted order intent");
      }
      // 미체결 조건부 갱신으로 주문을 선점한다. 다른 체결 처리(마감 스케줄러와
      // 화면 진입)가 같은 주문을 동시에 읽었어도 한쪽만 반영되고 나머지는 롤백된다.
      const claimed = await updateOrderExecuted(order.id, true, tx);
      if (!claimed) {
        throw new Error(`Order already executed concurrently: ${order.id}`);
      }
      await applyExecution(tx, accountId, ticker, state, execution, date);
    }

    if (events.some((event) => event.type === "CYCLE_COMPLETED")) {
      await completeCycleAndIncrement(accountId, tx);
    }
  });

  return orders.map((order) => {
    const pendingIndex = pendingOrders.indexOf(order);
    const executed =
      pendingIndex === -1 ? order.executed : executedIntents.has(intents[pendingIndex]);
    return toExecutionResult(order, executed, closePrice);
  });
}

/**
 * 체결 하나를 티어 홀딩·수익 기록에 반영 (내부 헬퍼)
 */
async function applyExecution(
  tx: DbExecutor,
  accountId: string,
  ticker: Ticker,
  state: CycleState,
  execution: Execution,
  date: string
): Promise<void> {
  const { order, price } = execution;

  if (order.type === "BUY") {
    // 매수 체결: 티어에 보유 정보 추가
    // sell_target_price는 표시용 캐시다 - 매도 지정가의 소유자는 src/strategy이며
    // 주문 생성 시 보유 상태에서 파생 계산된다 (#43)
    await updateTierHolding(
      accountId,
      order.tier,
      {
        buyPrice: price,
        shares: order.shares,
        buyDate: date,
        sellTargetPrice: calculateSellLimitPrice(price, state.strategy.sellThreshold),
      },
      tx
    );
    return;
  }

  // 매도 체결: 수익 기록 생성 후 티어 보유 정보 초기화
  const holding = state.holdings.find((h) => h.tier === order.tier);
  if (!holding) {
    throw new Error(`Tier ${order.tier} holding not found for sell execution`);
  }

  await createProfitRecord(
    {
      accountId,
      tier: order.tier,
      ticker,
      strategy: state.strategy.name,
      buyDate: holding.buyDate,
      buyPrice: holding.buyPrice,
      buyQuantity: holding.shares,
      sellDate: date,
      sellPrice: price,
    },
    tx
  );
  await updateTierHolding(
    accountId,
    order.tier,
    { buyPrice: null, shares: 0, buyDate: null, sellTargetPrice: null },
    tx
  );
}

function toExecutionResult(
  order: DailyOrder,
  executed: boolean,
  closePrice: number
): ExecutionResult {
  return {
    orderId: order.id,
    tier: order.tier,
    type: order.type,
    executed,
    limitPrice: order.limitPrice,
    closePrice,
    shares: order.shares,
  };
}

/**
 * 계좌의 체결 처리에 필요한 필드 조회 (내부 헬퍼)
 */
async function getAccountRow(
  accountId: string
): Promise<{ strategy: Strategy; seedCapital: number; cycleNumber: number }> {
  const rows = await db
    .select({
      strategy: tradingAccounts.strategy,
      seedCapital: tradingAccounts.seedCapital,
      cycleNumber: tradingAccounts.cycleNumber,
    })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.id, accountId))
    .limit(1);

  if (!rows[0]) {
    throw new Error(`Account not found: ${accountId}`);
  }
  return { ...rows[0], strategy: rows[0].strategy as Strategy };
}

/**
 * 이전 거래일 미체결 주문 체결 처리
 * REQ-001: 오늘 주문 조회 시 이전 거래일 미체결 주문 자동 체결
 * CON-001: 종가 데이터가 없으면 체결하지 않음
 * CON-002: 이미 체결된 주문은 다시 체결하지 않음 (processOrderExecution에서 처리)
 *
 * 이전 거래일은 가격 데이터 기준이다 - 평일 근사는 휴장일 직후의
 * 미체결 주문을 놓친다 (#41과 같은 계열의 휴장일 문제).
 *
 * @param accountId - 계좌 ID
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param ticker - 종목
 * @returns 체결 결과 목록
 */
export async function processPreviousDayExecution(
  accountId: string,
  currentDate: string,
  ticker: Ticker
): Promise<ExecutionResult[]> {
  // 1. 이전 거래일과 종가 확인 (CON-001 준수: 종가 없으면 체결 불가)
  const prevClose = await getPreviousTradingClose(ticker, currentDate);
  if (!prevClose) {
    return [];
  }

  // 2. 이전 거래일 미체결 주문 조회
  const orders = await getDailyOrders(accountId, prevClose.date);
  const hasUnexecutedOrders = orders.some((o) => !o.executed);

  if (!hasUnexecutedOrders) {
    return [];
  }

  // 3. 체결 처리 (기존 함수 재사용, CON-002 준수: 이미 체결된 주문은 스킵됨)
  return await processOrderExecution(accountId, prevClose.date, ticker);
}

/**
 * 다음 거래일 계산 (주말 제외)
 */
export function getNextTradingDate(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setDate(d.getDate() + 1);

  // 주말이면 월요일로 이동
  const dayOfWeek = d.getUTCDay();
  if (dayOfWeek === 0) {
    d.setDate(d.getDate() + 1); // 일요일 -> 월요일
  } else if (dayOfWeek === 6) {
    d.setDate(d.getDate() + 2); // 토요일 -> 월요일
  }

  return d.toISOString().split("T")[0];
}

/**
 * 마감 처리 완료 거래일을 계좌에 기록
 * 다음 스케줄러 실행이 이 날짜 다음부터 이어받아 증분 처리한다.
 * (updatedAt은 갱신하지 않는다 — 주문 라우트의 설정 변경 감지에 영향을 주지 않기 위함)
 */
async function updateAccountLastProcessedDate(accountId: string, date: string): Promise<void> {
  await db
    .update(tradingAccounts)
    .set({ lastProcessedDate: date })
    .where(eq(tradingAccounts.id, accountId));
}

/**
 * 미처리 거래일의 주문을 순차적으로 마감 처리 (증분)
 * - lastProcessedDate가 있으면 그 다음 거래일부터, 없으면 cycleStartDate부터 처리
 * - 가격 행이 있는 거래일만 처리한다 (휴장일·미적재일은 주문 생성 없이 건너뜀)
 * - 체결 결과에 따라 holdings가 업데이트되므로 순차 처리 필수
 * - 종가가 있는 거래일을 처리할 때마다 lastProcessedDate를 갱신하여,
 *   중간에 중단(타임아웃 등)되어도 다음 실행이 이어받을 수 있게 한다
 * - deadline이 지정되면 그 시각을 넘기기 전에 루프를 중단 (Vercel 함수 제한 대응)
 *
 * @param accountId - 계좌 ID
 * @param cycleStartDate - 사이클 시작일 (YYYY-MM-DD)
 * @param lastProcessedDate - 마지막으로 처리 완료한 거래일 (최초 실행이면 null)
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param ticker - 종목
 * @param strategy - 전략
 * @param seedCapital - 시드 캐피털
 * @param deadline - 처리를 중단할 시각 (Date.now() 기준 ms, 선택)
 * @returns 전체 체결 결과 목록
 */
export async function processHistoricalOrders(
  accountId: string,
  cycleStartDate: string,
  lastProcessedDate: string | null,
  currentDate: string,
  ticker: Ticker,
  strategy: Strategy,
  seedCapital: number,
  deadline?: number
): Promise<ExecutionResult[]> {
  const allResults: ExecutionResult[] = [];

  // 처리 시작일: 마지막 처리일의 다음 거래일, 최초 실행이면 사이클 시작일
  let processingDate = lastProcessedDate ? getNextTradingDate(lastProcessedDate) : cycleStartDate;
  const yesterday = getPreviousTradingDate(currentDate);

  // 종료 조건: processingDate > yesterday
  while (processingDate <= yesterday) {
    // 시간 예산 초과 시 중단 (남은 거래일은 다음 실행이 lastProcessedDate로 이어받음)
    if (deadline !== undefined && Date.now() >= deadline) {
      break;
    }

    // 1. 해당 날짜의 종가 확인 (없으면 거래일이 아니므로 건너뜀)
    const closePrice = await getClosingPrice(ticker, processingDate);

    if (closePrice) {
      // 2. 해당 날짜의 주문 조회
      let orders = await getDailyOrders(accountId, processingDate);

      // 3. 주문이 없으면 생성 (현재 holdings 상태 기준)
      if (orders.length === 0) {
        const holdings = await getTierHoldings(accountId);
        orders = await generateDailyOrders(
          accountId,
          processingDate,
          ticker,
          strategy,
          seedCapital,
          holdings
        );
      }

      // 4. 미체결 주문이 있으면 체결 처리
      const hasUnexecutedOrders = orders.some((o) => !o.executed);
      if (hasUnexecutedOrders) {
        const results = await processOrderExecution(accountId, processingDate, ticker);
        allResults.push(...results);
      }

      // 5. 종가가 있는 거래일을 처리 완료 → 진행 상태 영속화
      await updateAccountLastProcessedDate(accountId, processingDate);
    }

    // 6. 다음 거래일로 이동
    processingDate = getNextTradingDate(processingDate);
  }

  return allResults;
}
