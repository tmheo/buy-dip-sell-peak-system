/**
 * 실계좌 주문표 생성 조율과 신선도 정책 (#76, #80, #96)
 *
 * 주문표 생성 규칙은 src/strategy의 planOrders가 소유한다.
 * 이 모듈은 가격·보유 상태를 조회해 CycleState로 변환하고, 규칙이 낸 주문 의도를
 * 저장 계층에 넘긴다.
 * 더불어 이미 저장된 주문표를 그대로 쓸지 다시 만들지 판정하는 신선도 정책도
 * 이 모듈이 소유한다.
 */

import Decimal from "decimal.js";

import {
  getCycleRealizedPnl,
  getDailyOrders,
  getPreviousTradingClose,
  getSeedCapitalOn,
  getTierHoldings,
  listTradingDatesBetween,
  replaceDailyOrders,
  runInReadSnapshot,
  type DbExecutor,
  type NewDailyOrder,
} from "@/database/trading";
import type {
  CycleState,
  ReducedBuy,
  TierHolding as StrategyTierHolding,
  UnaffordableBuy,
} from "@/strategy";
import { getStrategyParams, planOrdersDetailed } from "@/strategy";
import type { DailyOrder, TierHolding, Ticker, TradingAccount } from "@/types/trading";

/**
 * DB 티어 홀딩을 src/strategy의 보유 상태로 변환 (내부 함수)
 * holdingDays는 기준일 직전 거래일 마감 시점의 보유 거래일 수다
 * (매수 당일 = 0, settle마다 +1 - src/strategy의 손절 카운트 의미).
 * 가장 이른 매수일 이후 거래일 목록을 한 번만 조회하고 티어별 수는 메모리에서 센다.
 */
async function toStrategyHoldings(
  ticker: Ticker,
  holdings: TierHolding[],
  date: string,
  executor: DbExecutor
): Promise<StrategyTierHolding[]> {
  const active = holdings.filter(
    (holding): holding is TierHolding & { buyPrice: number; buyDate: string } =>
      holding.shares > 0 && holding.buyPrice !== null && holding.buyDate !== null
  );
  if (active.length === 0) {
    return [];
  }

  const earliestBuyDate = active.reduce(
    (min, holding) => (holding.buyDate < min ? holding.buyDate : min),
    active[0].buyDate
  );
  const tradingDates = await listTradingDatesBetween(ticker, earliestBuyDate, date, executor);

  return active.map((holding) => ({
    tier: holding.tier,
    buyPrice: holding.buyPrice,
    shares: holding.shares,
    buyDate: holding.buyDate,
    holdingDays: tradingDates.filter((tradingDate) => tradingDate > holding.buyDate).length,
  }));
}

/**
 * 계좌의 사이클 상태를 기준일 직전 거래일 마감 시점으로 조립한다.
 *
 * 주문 생성, 신선도 판정, 체결 처리가 모두 이 함수 하나로 입력을 만든다.
 * 판정과 생성이 서로 다른 입력을 보면 매번 낡았다고 판정되거나 낡은 것을 놓친다.
 * 지금의 보유 티어로 조립하므로, 지난 날짜도 그 직전 거래일까지 마감이 끝났을 때만
 * 그날의 상태가 된다 - 일일 마감은 거래일을 차례로 처리하므로 이 조건이 지켜진다.
 *
 * 보유 티어와 이번 사이클 실현손익은 한 시점에서 읽는다. 따로 읽으면 그 사이에 커밋된
 * 매도가 보유에는 빠지고 실현손익에는 들어가, 판 티어의 손실이 예수금에서 두 번 빠진다.
 *
 * 사이클 자본은 그날의 시드다 - 시드 이력에서 적용일이 그날 이하인 시드를 같은 시점에서
 * 읽는다 (ADR-0005). 지금의 시드를 쓰면 바꾼 날 이미 낸 주문표가 새 시드로 다시 만들어지고,
 * 밀린 지난 날짜도 새 시드로 다시 계산된다.
 *
 * @param account - 계좌 (종목·전략·사이클 번호)
 * @param date - 기준일 (주문표 날짜 또는 체결 처리일)
 * @param executor - 같은 시점에서 함께 읽을 실행자 (runInReadSnapshot 등). 없으면 이 함수의
 *   읽기만 묶는 읽기 시점을 새로 연다.
 */
export async function loadCycleState(
  account: TradingAccount,
  date: string,
  executor?: DbExecutor
): Promise<CycleState> {
  if (!executor) {
    return runInReadSnapshot((snapshot) => loadCycleState(account, date, snapshot));
  }

  const [holdings, realizedPnl, seedCapital] = await Promise.all([
    getTierHoldings(account.id, executor),
    // 이번 사이클 실현손익: 계좌의 지금 사이클 번호로 묶인 수익 기록의 손익 합 (ADR-0003)
    getCycleRealizedPnl(account.id, account.cycleNumber, executor),
    getSeedCapitalOn(account.id, date, executor),
  ]);
  return {
    strategy: getStrategyParams(account.strategy),
    cycleCapital: seedCapital, // 실계좌의 사이클 자본 = 그날의 시드 금액 (#43, ADR-0005)
    holdings: await toStrategyHoldings(account.ticker, holdings, date, executor),
    cycleNumber: account.cycleNumber,
    realizedPnl,
  };
}

/** 지금의 입력으로 계산한 그날의 주문표와, 예수금 때문에 덜 사거나 내지 않은 매수 (#98) */
interface PlannedDailyOrders {
  rows: NewDailyOrder[];
  unaffordableBuy: UnaffordableBuy | null;
  reducedBuy: ReducedBuy | null;
}

/**
 * 지금의 입력과 현재 규칙으로 그날의 주문표를 계산한다 (저장하지 않는다).
 * 직전 거래일 종가(adjClose)가 없으면 계산할 수 없으므로 null을 반환한다.
 *
 * @param state - loadCycleState(account, date)로 조립한 사이클 상태
 */
async function planDailyOrders(
  account: TradingAccount,
  date: string,
  state: CycleState
): Promise<PlannedDailyOrders | null> {
  const prevClose = await getPreviousTradingClose(account.ticker, date);
  if (!prevClose) {
    return null;
  }

  const { intents, unaffordableBuy, reducedBuy } = planOrdersDetailed(state, prevClose.adjClose);
  const rows = intents.map((intent) => ({
    tier: intent.tier,
    type: intent.type,
    orderMethod: intent.orderMethod,
    // MOC는 규칙상 지정가가 없다. limit_price 컬럼이 NOT NULL이라
    // 표시용으로 직전 거래일 종가를 저장한다 (체결 판정에는 쓰이지 않는다).
    limitPrice: intent.limitPrice ?? prevClose.adjClose,
    shares: intent.shares,
  }));
  return { rows, unaffordableBuy, reducedBuy };
}

/**
 * 당일 주문 자동 생성
 * 주문표는 src/strategy의 planOrders가 직전 거래일 종가(adjClose) 기준으로 생성하고,
 * 저장 계층의 replaceDailyOrders가 삭제/생성 원자성을 보장한다.
 * 직전 거래일 종가가 없으면 주문을 만들지 않는다.
 */
export async function generateDailyOrders(
  account: TradingAccount,
  date: string
): Promise<DailyOrder[]> {
  const planned = await planDailyOrders(account, date, await loadCycleState(account, date));
  if (!planned) {
    return [];
  }
  return replaceDailyOrders(account.id, date, planned.rows);
}

/**
 * 신선도 판정을 거친 주문표.
 * regenerated는 저장돼 있던 주문표를 교체했는지 여부다.
 * unaffordableBuy는 매수 차례인 티어가 예수금으로 1주도 살 수 없어 매수 주문이 없을 때의
 * 그 티어와 예수금이고, reducedBuy는 예수금 때문에 비율대로의 수량보다 덜 사는 매수 주문의
 * 티어와 비율대로의 수량이다 (#98). 둘 다 주문표를 지금의 입력으로 다시 계산했을 때만 알 수 있어,
 * 체결된 주문이 있거나 직전 종가가 없어 계산하지 않았으면 null이다.
 */
export interface RefreshedDailyOrders {
  orders: DailyOrder[];
  regenerated: boolean;
  unaffordableBuy: UnaffordableBuy | null;
  reducedBuy: ReducedBuy | null;
}

/**
 * 저장된 주문표의 신선도를 판정하고, 없거나 낡았으면 다시 만든다 (#96)
 *
 * 신선도는 "지금 다시 만들면 같은가"다. 지금의 입력과 현재 규칙으로 주문을 다시
 * 계산해, 주문 내용(티어, 매수·매도, 주문 방식, 지정가, 수량)이 하나라도 다르면
 * 낡은 것으로 보고 교체한다. 계좌 설정 변경, 뒤늦게 적재된 종가, 보유 거래일 수
 * 변화, 매매 규칙 변경이 모두 이 비교 하나로 잡힌다. 주문을 만들 때 쓴 입력값은
 * 저장하지 않는다 - 규칙의 입력이 늘어도 저장 구조를 고칠 필요가 없다.
 *
 * 다음 경우에는 저장된 주문표를 그대로 둔다.
 * - 체결된 주문이 하나라도 있다: 체결 결과가 이미 티어 홀딩과 수익 기록에 반영됐다.
 * - 직전 종가가 없어 판정할 수 없다: 빈 주문표로 덮어쓰지 않는다.
 * - 내용이 같다: 화면 진입과 일일 마감이 겹쳐도 평소에는 교체 자체가 일어나지 않는다.
 *
 * @param account - 계좌
 * @param date - 주문표 날짜 (YYYY-MM-DD)
 * @param stored - 그 날짜에 저장돼 있는 주문표 (getDailyOrders 결과)
 * @param state - loadCycleState(account, date)로 조립한 사이클 상태. 체결 처리는 같은 상태로
 *   settle을 부르므로, 판정과 체결이 같은 입력을 보도록 호출자가 한 번 조립해 넘긴다.
 */
export async function refreshDailyOrders(
  account: TradingAccount,
  date: string,
  stored: DailyOrder[],
  state: CycleState
): Promise<RefreshedDailyOrders> {
  const kept = { orders: stored, regenerated: false, unaffordableBuy: null, reducedBuy: null };

  if (stored.some((order) => order.executed)) {
    return kept;
  }

  const planned = await planDailyOrders(account, date, state);
  if (!planned) {
    return kept;
  }

  const { unaffordableBuy, reducedBuy } = planned;
  if (stored.length > 0 && hasSameContent(stored, planned.rows)) {
    return { ...kept, unaffordableBuy, reducedBuy };
  }

  return {
    orders: await replaceDailyOrders(account.id, date, planned.rows),
    regenerated: stored.length > 0,
    unaffordableBuy,
    reducedBuy,
  };
}

/**
 * 신선한 주문표 조회 - 없으면 만들고, 낡았으면 다시 만들어 교체한다 (#80, #96)
 *
 * 주문표는 화면 진입 시 지연 생성된다. 운용 시작일부터 어제까지의 마감 처리는
 * 스케줄러(processDailyClose)가 담당하므로, 여기서는 조회와 해당 날짜 주문 생성만
 * 수행해 응답 속도를 확보한다 (REQ-001).
 *
 * 재생성 여부는 refreshDailyOrders의 신선도 판정이 전적으로 결정한다. 판정을 건너뛰는
 * 수동 경로는 두지 않는다 (#85) - 체결 기록까지 지워 홀딩·수익이 중복 반영되는 통로였다.
 *
 * @param account - 소유자 확인을 마친 계좌
 * @param date - 주문표 날짜 (YYYY-MM-DD)
 */
export async function getFreshDailyOrders(
  account: TradingAccount,
  date: string
): Promise<FreshDailyOrders> {
  const stored = await getDailyOrders(account.id, date);
  const state = await loadCycleState(account, date);
  const { orders, unaffordableBuy, reducedBuy } = await refreshDailyOrders(
    account,
    date,
    stored,
    state
  );
  return { orders, unaffordableBuy, reducedBuy };
}

/** 화면에 보일 주문표와, 예수금 때문에 덜 사거나 내지 않은 매수 (RefreshedDailyOrders 참고) */
export type FreshDailyOrders = Pick<
  RefreshedDailyOrders,
  "orders" | "unaffordableBuy" | "reducedBuy"
>;

/**
 * 저장된 주문표와 다시 계산한 주문표의 주문 내용이 같은지 비교 (내부 헬퍼)
 * 지정가는 저장 정밀도(limit_price 컬럼, 소수 둘째 자리)에 맞춰 비교한다 -
 * MOC의 표시용 지정가(직전 종가)는 그보다 정밀한 값이라 그대로 비교하면 늘 달라진다.
 */
function hasSameContent(stored: DailyOrder[], planned: NewDailyOrder[]): boolean {
  if (stored.length !== planned.length) {
    return false;
  }

  const storedKeys = stored.map(toContentKey).sort();
  const plannedKeys = planned.map(toContentKey).sort();
  return storedKeys.every((key, index) => key === plannedKeys[index]);
}

function toContentKey(order: NewDailyOrder): string {
  const limitPrice = new Decimal(order.limitPrice)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
  return [order.tier, order.type, order.orderMethod, limitPrice, order.shares].join("|");
}
