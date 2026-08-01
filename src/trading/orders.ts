/**
 * 실계좌 주문표 생성 조율 (#76)
 *
 * 주문표 생성 규칙은 src/strategy의 planOrders가 소유한다.
 * 이 모듈은 가격·보유 상태를 조회해 CycleState로 변환하고, 규칙이 낸 주문 의도를
 * 저장 계층에 넘긴다.
 */

import {
  getPreviousTradingClose,
  listTradingDatesBetween,
  replaceDailyOrders,
  type NewDailyOrder,
} from "@/database/trading";
import type { CycleState, TierHolding as StrategyTierHolding } from "@/strategy";
import { getStrategyParams, planOrders } from "@/strategy";
import type { DailyOrder, TierHolding, Ticker, Strategy } from "@/types/trading";

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
