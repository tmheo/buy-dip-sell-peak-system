/**
 * 주문표 생성
 * #43: planOrders(state) → OrderIntent[] - 전일 종가(adjClose) 기준 주문표 생성, 순수 함수.
 *
 * 주문 순서 불변식: 매수 티어는 상태 변이 전(전일 마감 시점의 보유 상태) 기준으로 결정된다.
 * 모든 주문은 장 마감 전에 동시에 제출되므로, 당일 매도로 비워질 티어는
 * 당일 매수 티어 선정에 영향을 주지 않는다.
 */
import type { CycleState, OrderIntent, UnaffordableBuy } from "./types";
import {
  availableCash,
  calculateBuyLimitPrice,
  calculateBuyQuantity,
  calculateSellLimitPrice,
  nextBuyTier,
  tierAmount,
} from "./calculations";

/**
 * 전일 종가 기준으로 당일 주문표를 생성
 *
 * @param state - 사이클 상태 (전일 마감 시점)
 * @param prevClose - 전일 종가 (adjClose)
 * @returns 주문 의도 목록 (매수 최대 1건 + 보유 티어별 매도 1건씩)
 */
export function planOrders(state: CycleState, prevClose: number): OrderIntent[] {
  if (prevClose <= 0) {
    throw new Error("prevClose must be greater than 0");
  }

  const orders: OrderIntent[] = [];

  const buyOrder = planBuyOrder(state, prevClose);
  if (buyOrder) {
    orders.push(buyOrder);
  }

  for (const holding of [...state.holdings].sort((a, b) => a.tier - b.tier)) {
    // 손절일 도달 판정: 당일 마감 시점의 보유 거래일 수(holdingDays + 1) >= 손절일
    const reachesStopLoss = holding.holdingDays + 1 >= state.strategy.stopLossDays;
    if (reachesStopLoss) {
      orders.push({
        type: "SELL",
        tier: holding.tier,
        orderMethod: "MOC",
        limitPrice: null,
        shares: holding.shares,
      });
    } else {
      orders.push({
        type: "SELL",
        tier: holding.tier,
        orderMethod: "LOC",
        limitPrice: calculateSellLimitPrice(holding.buyPrice, state.strategy.sellThreshold),
        shares: holding.shares,
      });
    }
  }

  return orders;
}

/**
 * 예수금이 모자라 매수 주문을 내지 않는 티어 (#98)
 * 매수할 티어가 있는데 그 티어 금액이 예수금으로 줄어 1주도 살 수 없으면, 그 티어와 예수금을 낸다.
 * 비율대로의 금액 자체가 1주보다 작은 경우(예수금 탓이 아닌 경우)와 매수 주문이 나가는 날에는 null.
 * planOrders와 같은 판단으로 정하므로, 이 값이 있는 날에는 planOrders의 매수 주문이 없다.
 *
 * @param state - 사이클 상태 (전일 마감 시점)
 * @param prevClose - 전일 종가 (adjClose)
 */
export function unaffordableBuy(state: CycleState, prevClose: number): UnaffordableBuy | null {
  const plan = planBuy(state, prevClose);
  if (plan === null || plan.shares > 0) {
    return null;
  }

  const cash = availableCash(state);
  // 티어 금액이 예수금과 같으면 예수금이 금액을 정한 것이다 (예비 티어는 늘 예수금 전액)
  if (plan.amount !== cash) {
    return null;
  }
  return { tier: plan.tier, availableCash: cash };
}

/**
 * 다음 매수 티어의 매수 계획: 티어, 티어 금액, 지정가, 수량 (내부 헬퍼)
 * 다음 매수 티어가 없으면 null.
 */
function planBuy(
  state: CycleState,
  prevClose: number
): { tier: number; amount: number; limitPrice: number; shares: number } | null {
  const tier = nextBuyTier(state);
  if (tier === null) {
    return null;
  }

  const amount = tierAmount(state, tier);
  const limitPrice = calculateBuyLimitPrice(prevClose, state.strategy.buyThreshold);
  return { tier, amount, limitPrice, shares: calculateBuyQuantity(amount, limitPrice) };
}

/**
 * LOC 매수 주문 생성
 * 다음 매수 티어가 없거나 티어 금액으로 1주도 살 수 없으면 null.
 */
function planBuyOrder(state: CycleState, prevClose: number): OrderIntent | null {
  const plan = planBuy(state, prevClose);
  if (plan === null || plan.shares === 0) {
    return null;
  }

  return {
    type: "BUY",
    tier: plan.tier,
    orderMethod: "LOC",
    limitPrice: plan.limitPrice,
    shares: plan.shares,
  };
}
