/**
 * 체결 판정과 상태 전이
 * #43: settle(state, orders, bar) → { newState, executions, events } - 순수 함수.
 *
 * 모든 주문(LOC 매수/매도, MOC 손절)은 당일 종가에 체결된다.
 * 사이클 완료는 events로 통지하며, 다음 사이클 시작(자본 공급)은 호출자의 몫이다.
 */
import Decimal from "decimal.js";
import type {
  CycleState,
  CycleEvent,
  DayBar,
  Execution,
  OrderIntent,
  SettleResult,
  TierHolding,
} from "./types";
import { availableCash, shouldExecuteBuy, shouldExecuteSell } from "./calculations";

/**
 * 당일 가격으로 주문표를 체결 판정하고 사이클 상태를 전이
 *
 * @param state - 사이클 상태 (전일 마감 시점, planOrders에 넘긴 것과 동일해야 한다)
 * @param orders - planOrders가 생성한 주문표
 * @param bar - 당일 가격 (close는 adjClose)
 * @returns 새 상태, 체결 목록, 사이클 완료 이벤트
 */
export function settle(state: CycleState, orders: OrderIntent[], bar: DayBar): SettleResult {
  if (bar.close <= 0) {
    throw new Error("close must be greater than 0");
  }
  validateOrders(state, orders);

  const executions: Execution[] = [];

  // 1. 매도 체결 (LOC: 종가 >= 지정가, MOC: 무조건) - 티어 제거, 원금 회복 (ADR-0001)
  const holdingsByTier = new Map(state.holdings.map((h) => [h.tier, h]));
  const soldTiers = new Set<number>();
  for (const order of orders) {
    if (order.type !== "SELL") continue;
    const executed = order.orderMethod === "MOC" || shouldExecuteSell(bar.close, order.limitPrice);
    if (!executed) continue;

    const holding = holdingsByTier.get(order.tier);
    if (!holding) {
      throw new Error(`Tier ${order.tier} is not held`);
    }
    soldTiers.add(order.tier);
    executions.push({
      order,
      price: bar.close,
      amount: executedAmount(bar.close, order.shares),
      profit: new Decimal(bar.close)
        .sub(holding.buyPrice)
        .mul(order.shares)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber(),
    });
  }

  // 남은 티어는 보유 거래일 수 1 증가 (실제 거래일 기준 손절 카운트)
  const remainingHoldings: TierHolding[] = state.holdings
    .filter((h) => !soldTiers.has(h.tier))
    .map((h) => ({ ...h, holdingDays: h.holdingDays + 1 }));

  // 2. 매수 체결 (종가 <= 지정가) - 매도와 동시에 제출된 주문이므로 티어는 이미 결정됨
  const buyOrder = orders.find((o): o is Extract<OrderIntent, { type: "BUY" }> => o.type === "BUY");
  if (buyOrder && shouldExecuteBuy(bar.close, buyOrder.limitPrice)) {
    const cost = new Decimal(bar.close).mul(buyOrder.shares);
    const cashAfterSells = availableCash({ ...state, holdings: remainingHoldings });
    if (cost.gt(cashAfterSells)) {
      throw new Error("Insufficient cash for buy execution");
    }
    executions.push({
      order: buyOrder,
      price: bar.close,
      amount: executedAmount(bar.close, buyOrder.shares),
    });
    remainingHoldings.push({
      tier: buyOrder.tier,
      buyPrice: bar.close,
      shares: buyOrder.shares,
      buyDate: bar.date,
      holdingDays: 0,
    });
  }

  // 3. 사이클 완료 판정: 매도 체결로 보유 티어가 모두 비워지면 완료
  //    (동시 제출된 매수가 체결되면 사이클은 계속된다)
  const events: CycleEvent[] = [];
  if (soldTiers.size > 0 && remainingHoldings.length === 0) {
    events.push({ type: "CYCLE_COMPLETED", cycleNumber: state.cycleNumber });
  }

  return {
    newState: { ...state, holdings: remainingHoldings },
    executions,
    events,
  };
}

/**
 * 체결 금액 계산 (체결가 × 수량, 소수점 2자리 반올림)
 */
function executedAmount(price: number, shares: number): number {
  return new Decimal(price).mul(shares).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * 주문표와 상태의 정합성 검증
 */
function validateOrders(state: CycleState, orders: OrderIntent[]): void {
  const heldTiers = new Set(state.holdings.map((h) => h.tier));

  const buyOrders = orders.filter((o) => o.type === "BUY");
  if (buyOrders.length > 1) {
    throw new Error("At most one buy order per day");
  }
  for (const order of buyOrders) {
    if (heldTiers.has(order.tier)) {
      throw new Error(`Tier ${order.tier} is already held`);
    }
  }

  for (const order of orders) {
    if (order.type === "SELL" && !heldTiers.has(order.tier)) {
      throw new Error(`Tier ${order.tier} is not held`);
    }
  }
}
