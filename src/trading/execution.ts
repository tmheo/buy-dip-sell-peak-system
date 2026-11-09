/**
 * 실계좌 주문 체결·마감 처리 조율 (#76)
 *
 * 체결 판정과 상태 전이 규칙은 src/strategy의 settle이 소유한다.
 * 이 모듈은 주문·보유 상태를 조회해 settle에 넘기고, 결과를 저장 계층에
 * 트랜잭션으로 반영한다.
 */

import {
  completeCycleAndIncrement,
  createProfitRecord,
  getClosingPrice,
  getDailyOrders,
  getPreviousTradingClose,
  getTradingAccountByIdWithoutOwnerCheck,
  hasExecutedOrdersAfter,
  lockDailyOrders,
  runInTransaction,
  updateAccountLastProcessedDate,
  updateOrderExecuted,
  updateTierHolding,
  type DbExecutor,
} from "@/database/trading";
import { formatUtcDate, getPreviousTradingDate } from "@/lib/date";
import type { CycleState, Execution, OrderIntent } from "@/strategy";
import { calculateSellLimitPrice, settle } from "@/strategy";
import type { DailyOrder, Ticker, TradingAccount } from "@/types/trading";

import { loadCycleState, refreshDailyOrders } from "./orders";

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
 * 주문표를 체결하는 모든 경로(일일 마감, 화면 진입, 체결 API)가 이 함수를 거친다.
 * 그래서 체결 전에 여기서 신선도 판정을 하고, 낡았으면 다시 만든 주문표로 체결한다 (#96).
 * 체결되는 주문표는 언제나 지금의 입력과 현재 규칙으로 만든 것이 된다.
 *
 * @param accountId - 계좌 ID
 * @param date - 체결 처리할 날짜 (해당 날짜의 가격 행이 없으면 체결하지 않는다)
 * @returns 체결 결과 목록
 */
export async function processOrderExecution(
  accountId: string,
  date: string
): Promise<ExecutionResult[]> {
  const account = await requireAccount(accountId);

  // 당일 종가 조회 (정확 일치 - 휴장일·미적재면 체결 처리 불가)
  const closePrice = await getClosingPrice(account.ticker, date);
  if (!closePrice) {
    return [];
  }

  const stored = await getDailyOrders(accountId, date);

  // 미체결 주문이 없으면 현재 상태만 보고 (사이클 완료 중복 처리 방지)
  if (stored.every((order) => order.executed)) {
    return stored.map((order) => toExecutionResult(order, order.executed, closePrice));
  }

  return refreshAndSettle(account, date, closePrice, stored);
}

/**
 * 저장된 주문표를 신선도 판정에 거친 뒤 체결한다 (내부 함수, #96)
 *
 * 사이클 상태는 여기서 한 번만 조립해 신선도 판정과 settle에 함께 넘긴다.
 * 주문표가 비어 있으면 판정 과정에서 새로 만들어진다.
 * 판정 뒤의 주문표에 미체결 주문이 없으면(다시 만든 주문표가 비는 경우 등)
 * 체결 트랜잭션을 열지 않고 현재 상태만 보고한다.
 *
 * 사이클 상태는 지금의 보유 티어로 조립하므로, 그 날짜보다 뒤에 체결된 주문이 있으면
 * 그날의 상태가 아니다. 그 상태로 다시 만들면 뒤에 산 티어의 매도가 나오고, 체결하면
 * 매수보다 앞선 매도가 기록되고 지금의 보유가 지워진다. 그래서 이때는 다시 만들지도
 * 체결하지도 않고 저장된 주문표를 그대로 보고한다. 일일 마감은 날짜를 차례로 처리하므로
 * 평소에는 이 경우가 생기지 않고, 아무 날짜나 받는 체결 API에서 생긴다.
 *
 * @param account - 계좌 (체결 처리 시점에 다시 읽은 것)
 * @param date - 체결 처리할 날짜
 * @param closePrice - 그날 종가 (adjClose)
 * @param stored - 그 날짜에 저장돼 있는 주문표 (getDailyOrders 결과)
 */
async function refreshAndSettle(
  account: TradingAccount,
  date: string,
  closePrice: number,
  stored: DailyOrder[]
): Promise<ExecutionResult[]> {
  const { id: accountId, ticker } = account;
  const reportStored = () =>
    stored.map((order) => toExecutionResult(order, order.executed, closePrice));

  if (await hasExecutedOrdersAfter(accountId, date)) {
    console.warn(
      `[${accountId}] ${date} 뒤 날짜에 체결된 주문이 있어 지금의 보유로 체결할 수 없다 - 건너뛴다`
    );
    return reportStored();
  }

  const state = await loadCycleState(account, date);

  const { orders, regenerated } = await refreshDailyOrders(account, date, stored, state);
  if (regenerated) {
    // 배포일처럼 규칙이 바뀐 날 몇 계좌가 영향을 받았는지 보려는 기록이다
    console.log(`[${accountId}] ${date} 낡은 주문표를 다시 만든 뒤 체결한다`);
  }

  const pendingOrders = orders.filter((order) => !order.executed);
  if (pendingOrders.length === 0) {
    return orders.map((order) => toExecutionResult(order, order.executed, closePrice));
  }

  const intents = pendingOrders.map(toOrderIntent);
  const orderByIntent = new Map(intents.map((intent, index) => [intent, pendingOrders[index]]));
  const { executions, events } = settle(state, intents, { date, close: closePrice });
  const executedIntents = new Set(executions.map((execution) => execution.order));

  await runInTransaction(async (tx) => {
    // 같은 날짜의 주문표 교체와 차례를 정한다. 교체가 먼저 끝났으면 아래 선점이
    // 실패해 롤백되고, 체결이 먼저 끝났으면 교체가 체결된 주문을 보고 멈춘다.
    await lockDailyOrders(accountId, date, tx);

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

  // 매도금액과 손익은 settle이 계산한 값을 그대로 남긴다 - 예수금 계산이 읽는
  // 이번 사이클 실현손익이 체결 판정과 어긋나지 않게 하려는 것이다 (#97).
  // 사이클 번호는 체결 시점의 것이다. 이 체결로 사이클이 끝나도 번호 증가는
  // 체결 반영 뒤에 하므로 이 기록은 끝난 사이클에 속한다.
  await createProfitRecord(
    {
      accountId,
      ticker,
      strategy: state.strategy.name,
      cycleNumber: state.cycleNumber,
      sellDate: date,
      holding,
      execution,
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
 * 체결 처리 대상 계좌 조회 (내부 헬퍼)
 * 소유자 확인은 호출 경로(라우트·스케줄러)가 이미 마쳤다.
 */
async function requireAccount(accountId: string): Promise<TradingAccount> {
  const account = await getTradingAccountByIdWithoutOwnerCheck(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }
  return account;
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
 * @returns 체결 결과 목록
 */
export async function processPreviousDayExecution(
  accountId: string,
  currentDate: string
): Promise<ExecutionResult[]> {
  const account = await requireAccount(accountId);

  // 1. 이전 거래일과 종가 확인 (CON-001 준수: 종가 없으면 체결 불가)
  const prevClose = await getPreviousTradingClose(account.ticker, currentDate);
  if (!prevClose) {
    return [];
  }

  // 2. 이전 거래일 미체결 주문 조회
  const orders = await getDailyOrders(accountId, prevClose.date);
  const hasUnexecutedOrders = orders.some((o) => !o.executed);

  if (!hasUnexecutedOrders) {
    return [];
  }

  // 3. 체결 처리 (신선도 판정을 거친다, CON-002 준수: 이미 체결된 주문은 스킵됨)
  return await processOrderExecution(accountId, prevClose.date);
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

  return formatUtcDate(d);
}

/**
 * 미처리 거래일의 주문을 순차적으로 마감 처리 (증분)
 * - lastProcessedDate가 있으면 그 다음 거래일부터, 없으면 cycleStartDate부터 처리
 * - 가격 행이 있는 거래일만 처리한다 (휴장일·미적재일은 주문 생성 없이 건너뜀)
 * - 체결 결과에 따라 holdings가 업데이트되므로 순차 처리 필수
 *   (날짜 D의 신선도 판정과 체결은 D 직전 거래일 마감 뒤의 보유 상태로 한다)
 * - 이미 저장된 주문표도 체결 전에 신선도 판정을 거친다 (processOrderExecution, #96)
 * - 종가가 있는 거래일을 처리할 때마다 lastProcessedDate를 갱신하여,
 *   중간에 중단(타임아웃 등)되어도 다음 실행이 이어받을 수 있게 한다
 * - deadline이 지정되면 그 시각을 넘기기 전에 루프를 중단 (Vercel 함수 제한 대응)
 *
 * @param account - 계좌 (사이클 시작일·마지막 처리일. 종목·전략 등은 날짜마다 다시 읽는다)
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param deadline - 처리를 중단할 시각 (Date.now() 기준 ms, 선택)
 * @returns 전체 체결 결과 목록
 */
export async function processHistoricalOrders(
  account: TradingAccount,
  currentDate: string,
  deadline?: number
): Promise<ExecutionResult[]> {
  const { id: accountId, cycleStartDate, lastProcessedDate } = account;
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

    // 1. 날짜마다 계좌를 한 번 읽고, 그 계좌로 종가 조회와 체결을 모두 한다.
    //    앞선 날짜의 사이클 완료로 사이클 번호가 바뀌었을 수 있고, 보유가 없으면
    //    도중에 종목이 바뀔 수도 있다 - 종가와 주문표가 서로 다른 종목에서 오면 안 된다.
    const current = await requireAccount(accountId);

    // 2. 해당 날짜의 종가 확인 (없으면 거래일이 아니므로 건너뜀)
    const closePrice = await getClosingPrice(current.ticker, processingDate);

    if (closePrice) {
      // 3. 해당 날짜의 주문 조회
      const stored = await getDailyOrders(accountId, processingDate);

      // 4. 주문표가 없거나 미체결 주문이 있으면 신선도 판정을 거쳐 체결 처리
      //    (주문표가 없으면 판정 과정에서 현재 holdings 기준으로 만들어진다)
      if (stored.length === 0 || stored.some((o) => !o.executed)) {
        const results = await refreshAndSettle(current, processingDate, closePrice, stored);
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
