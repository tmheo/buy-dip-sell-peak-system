/**
 * 주문표 생성
 * #43: planOrders(state) → OrderIntent[] - 전일 종가(adjClose) 기준 주문표 생성, 순수 함수.
 * #98: planOrdersDetailed는 같은 주문표에 예수금 때문에 덜 사거나 사지 않는 매수를 함께 낸다.
 *
 * 주문 순서 불변식: 매수 티어는 상태 변이 전(전일 마감 시점의 보유 상태) 기준으로 결정된다.
 * 모든 주문은 장 마감 전에 동시에 제출되므로, 당일 매도로 비워질 티어는
 * 당일 매수 티어 선정에 영향을 주지 않는다.
 */
import type {
  CycleState,
  DetailedOrderPlan,
  OrderIntent,
  ReducedBuy,
  UnaffordableBuy,
} from "./types";
import {
  availableCash,
  calculateBuyLimitPrice,
  calculateBuyQuantity,
  calculateSellLimitPrice,
  nextBuyTier,
  nominalTierAmount,
  tierAmount,
} from "./calculations";
import { RESERVE_TIER_NUMBER } from "./types";

/**
 * 전일 종가 기준으로 당일 주문표를 생성
 *
 * @param state - 사이클 상태 (전일 마감 시점)
 * @param prevClose - 전일 종가 (adjClose)
 * @returns 주문 의도 목록 (매수 최대 1건 + 보유 티어별 매도 1건씩)
 */
export function planOrders(state: CycleState, prevClose: number): OrderIntent[] {
  return planOrdersDetailed(state, prevClose).intents;
}

/**
 * 당일 주문표와, 예수금 때문에 비율대로 사지 못하는 매수 (#98)
 * 주문 의도는 planOrders와 같다. 매수 주문과 "왜 덜 사거나 사지 않는가"를 한 번의 매수 판단에서
 * 함께 정하므로, 화면에 보일 이유가 주문표와 어긋나지 않는다.
 *
 * @param state - 사이클 상태 (전일 마감 시점)
 * @param prevClose - 전일 종가 (adjClose)
 */
export function planOrdersDetailed(state: CycleState, prevClose: number): DetailedOrderPlan {
  if (prevClose <= 0) {
    throw new Error("prevClose must be greater than 0");
  }

  const { intent, unaffordableBuy, reducedBuy } = decideBuy(state, prevClose);
  const intents: OrderIntent[] = intent ? [intent] : [];

  for (const holding of [...state.holdings].sort((a, b) => a.tier - b.tier)) {
    // 손절일 도달 판정: 당일 마감 시점의 보유 거래일 수(holdingDays + 1) >= 손절일
    const reachesStopLoss = holding.holdingDays + 1 >= state.strategy.stopLossDays;
    if (reachesStopLoss) {
      intents.push({
        type: "SELL",
        tier: holding.tier,
        orderMethod: "MOC",
        limitPrice: null,
        shares: holding.shares,
      });
    } else {
      intents.push({
        type: "SELL",
        tier: holding.tier,
        orderMethod: "LOC",
        limitPrice: calculateSellLimitPrice(holding.buyPrice, state.strategy.sellThreshold),
        shares: holding.shares,
      });
    }
  }

  return { intents, unaffordableBuy, reducedBuy };
}

/** 그날의 매수 판단: 낼 매수 주문과, 예수금 때문에 덜 사거나 사지 않는 이유 (내부 헬퍼) */
interface BuyDecision {
  intent: OrderIntent | null;
  unaffordableBuy: UnaffordableBuy | null;
  reducedBuy: ReducedBuy | null;
}

/**
 * 다음 매수 티어의 매수 판단 (내부 헬퍼)
 * 예수금 탓인지는 비율대로의 금액으로 살 수량과 실제 수량을 견주어 가린다 - 비율대로의 금액으로도
 * 1주를 못 사면 예수금 탓이 아니다. 예비 티어는 비율이 없고 늘 예수금 전액이라, 1주도 못 사면
 * 언제나 예수금 탓이고 "비율보다 덜 산다"는 일은 없다.
 */
function decideBuy(state: CycleState, prevClose: number): BuyDecision {
  const none: BuyDecision = { intent: null, unaffordableBuy: null, reducedBuy: null };
  const tier = nextBuyTier(state);
  if (tier === null) {
    return none;
  }

  const limitPrice = calculateBuyLimitPrice(prevClose, state.strategy.buyThreshold);
  const shares = calculateBuyQuantity(tierAmount(state, tier), limitPrice);
  const nominalShares =
    tier === RESERVE_TIER_NUMBER
      ? null
      : calculateBuyQuantity(nominalTierAmount(state, tier), limitPrice);

  if (shares === 0) {
    const limitedByCash = nominalShares === null || nominalShares > 0;
    return limitedByCash
      ? { ...none, unaffordableBuy: { tier, availableCash: availableCash(state) } }
      : none;
  }

  return {
    intent: { type: "BUY", tier, orderMethod: "LOC", limitPrice, shares },
    unaffordableBuy: null,
    reducedBuy: nominalShares !== null && shares < nominalShares ? { tier, nominalShares } : null,
  };
}
