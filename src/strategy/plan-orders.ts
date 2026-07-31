/**
 * 주문표 생성
 * #43: planOrders(state) → OrderIntent[] - 전일 종가(adjClose) 기준 주문표 생성, 순수 함수.
 *
 * 주문 순서 불변식: 매수 티어는 상태 변이 전(전일 마감 시점의 보유 상태) 기준으로 결정된다.
 * 모든 주문은 장 마감 전에 동시에 제출되므로, 당일 매도로 비워질 티어는
 * 당일 매수 티어 선정에 영향을 주지 않는다.
 */
import type { CycleState, OrderIntent } from "./types";
import {
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
 * LOC 매수 주문 생성
 * 다음 매수 티어가 없거나 티어 금액으로 1주도 살 수 없으면 null.
 */
function planBuyOrder(state: CycleState, prevClose: number): OrderIntent | null {
  const tier = nextBuyTier(state);
  if (tier === null) {
    return null;
  }

  const limitPrice = calculateBuyLimitPrice(prevClose, state.strategy.buyThreshold);
  const shares = calculateBuyQuantity(tierAmount(state, tier), limitPrice);
  if (shares === 0) {
    return null;
  }

  return {
    type: "BUY",
    tier,
    orderMethod: "LOC",
    limitPrice,
    shares,
  };
}
