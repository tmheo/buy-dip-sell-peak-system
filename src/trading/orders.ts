/**
 * 실계좌 주문표 생성 조율과 신선도 정책 (#76, #80)
 *
 * 주문표 생성 규칙은 src/strategy의 planOrders가 소유한다.
 * 이 모듈은 가격·보유 상태를 조회해 CycleState로 변환하고, 규칙이 낸 주문 의도를
 * 저장 계층에 넘긴다.
 * 더불어 이미 저장된 주문표를 그대로 쓸지 다시 만들지 판정하는 신선도 정책도
 * 이 모듈이 소유한다.
 */

import {
  deleteDailyOrders,
  getDailyOrders,
  getPreviousTradingClose,
  getTierHoldings,
  hasNewerPriceSince,
  listTradingDatesBetween,
  replaceDailyOrders,
  type NewDailyOrder,
} from "@/database/trading";
import type { CycleState, TierHolding as StrategyTierHolding } from "@/strategy";
import { getStrategyParams, planOrders } from "@/strategy";
import type { DailyOrder, TierHolding, Ticker, Strategy, TradingAccount } from "@/types/trading";

/**
 * DB 티어 홀딩을 src/strategy의 보유 상태로 변환
 * holdingDays는 기준일 직전 거래일 마감 시점의 보유 거래일 수다
 * (매수 당일 = 0, settle마다 +1 - src/strategy의 손절 카운트 의미).
 * 가장 이른 매수일 이후 거래일 목록을 한 번만 조회하고 티어별 수는 메모리에서 센다.
 *
 * @param ticker - 종목 (거래일 수 계산에 가격 데이터 사용)
 * @param holdings - DB 티어 홀딩 목록 (비활성 티어 포함 가능)
 * @param date - 기준일 (주문 생성일 또는 체결 처리일)
 */
export async function toStrategyHoldings(
  ticker: Ticker,
  holdings: TierHolding[],
  date: string
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
  const tradingDates = await listTradingDatesBetween(ticker, earliestBuyDate, date);

  return active.map((holding) => ({
    tier: holding.tier,
    buyPrice: holding.buyPrice,
    shares: holding.shares,
    buyDate: holding.buyDate,
    holdingDays: tradingDates.filter((tradingDate) => tradingDate > holding.buyDate).length,
  }));
}

/**
 * 당일 주문 자동 생성
 * 주문표는 src/strategy의 planOrders가 직전 거래일 종가(adjClose) 기준으로 생성하고,
 * 저장 계층의 replaceDailyOrders가 삭제/생성 원자성을 보장한다.
 */
export async function generateDailyOrders(
  accountId: string,
  date: string,
  ticker: Ticker,
  strategy: Strategy,
  seedCapital: number,
  holdings: TierHolding[]
): Promise<DailyOrder[]> {
  const prevClose = await getPreviousTradingClose(ticker, date);
  if (!prevClose) {
    return []; // 가격 데이터 없으면 주문 생성 불가
  }

  const state: CycleState = {
    strategy: getStrategyParams(strategy),
    cycleCapital: seedCapital, // 실계좌의 사이클 자본 = 사용자 설정 시드 금액 (#43)
    holdings: await toStrategyHoldings(ticker, holdings, date),
    cycleNumber: 0, // planOrders는 사용하지 않는다 (settle의 사이클 완료 통지용 필드)
  };
  const intents = planOrders(state, prevClose.adjClose);

  const rows: NewDailyOrder[] = intents.map((intent) => ({
    tier: intent.tier,
    type: intent.type,
    orderMethod: intent.orderMethod,
    // MOC는 규칙상 지정가가 없다. limit_price 컬럼이 NOT NULL이라
    // 표시용으로 직전 거래일 종가를 저장한다 (체결 판정에는 쓰이지 않는다).
    limitPrice: intent.limitPrice ?? prevClose.adjClose,
    shares: intent.shares,
  }));

  return replaceDailyOrders(accountId, date, rows);
}

/**
 * 주문표 조회 - 없거나 낡았으면 생성한다 (#80)
 *
 * 주문표는 화면 진입 시 지연 생성된다. 사이클 시작일부터 어제까지의 마감 처리는
 * 스케줄러(processDailyClose)가 담당하므로, 여기서는 조회와 해당 날짜 주문 생성만
 * 수행해 응답 속도를 확보한다 (REQ-001).
 *
 * 재생성 여부는 아래 신선도 판정이 전적으로 결정한다. 판정을 건너뛰는 수동 경로는
 * 두지 않는다 (#85) - 체결 기록까지 지워 홀딩·수익이 중복 반영되는 통로였고,
 * 계좌 설정 변경과 뒤늦게 적재된 종가는 판정이 이미 자동으로 잡아낸다.
 *
 * @param account - 소유자 확인을 마친 계좌
 * @param date - 주문표 날짜 (YYYY-MM-DD)
 */
export async function getOrCreateDailyOrders(
  account: TradingAccount,
  date: string
): Promise<DailyOrder[]> {
  // 기존 주문 조회 (체결 처리로 업데이트된 holdings 기반)
  let orders = await getDailyOrders(account.id, date);

  if (orders.length > 0 && (await isStaleDailyOrders(account, date, orders))) {
    await deleteDailyOrders(account.id, date);
    orders = [];
  }

  if (orders.length > 0) {
    return orders;
  }

  const holdings = await getTierHoldings(account.id);
  return generateDailyOrders(
    account.id,
    date,
    account.ticker,
    account.strategy,
    account.seedCapital,
    holdings
  );
}

/**
 * 주문표 신선도 판정 (내부 헬퍼)
 *
 * 체결된 주문이 하나라도 있으면 재생성하지 않는다 - 체결 결과가 이미 티어 홀딩과
 * 수익 기록에 반영됐으므로, 주문을 다시 만들면 그 반영과 어긋난다.
 *
 * 미체결 주문만 있을 때는 아래 둘 중 하나면 낡은 것으로 본다.
 *  1) 계좌 설정이 주문 생성 이후 수정됨 (시드 금액·전략 변경이 주문에 반영되지 않았다)
 *  2) 주문 생성 이후 더 최신 가격 데이터가 적재됨
 *     - 지연 생성 특성상, 일일 크론이 전일 종가를 적재하기 전에 화면에 진입하면
 *       그보다 이전 거래일 종가로 주문이 잘못 생성된다. 이후 크론이 종가를 적재해도
 *       자동으로 갱신되지 않는 문제를 복구한다.
 */
async function isStaleDailyOrders(
  account: TradingAccount,
  date: string,
  orders: DailyOrder[]
): Promise<boolean> {
  if (orders.some((order) => order.executed)) {
    return false;
  }

  const oldestOrderCreatedAt = orders.reduce(
    (min, order) => (order.createdAt < min ? order.createdAt : min),
    orders[0].createdAt
  );

  if (account.updatedAt > oldestOrderCreatedAt) {
    return true;
  }

  return hasNewerPriceSince(account.ticker, date, new Date(oldestOrderCreatedAt));
}
