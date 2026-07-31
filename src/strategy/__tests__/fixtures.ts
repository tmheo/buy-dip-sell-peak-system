/**
 * strategy 모듈 테스트 공용 픽스처
 */
import { getStrategyParams } from "../params";
import type { CycleState, OrderIntent, TierHolding } from "../types";

export function createState(overrides: Partial<CycleState> = {}): CycleState {
  return {
    strategy: getStrategyParams("Pro2"),
    cycleCapital: 10000,
    holdings: [],
    cycleNumber: 1,
    ...overrides,
  };
}

export function createHolding(overrides: Partial<TierHolding> = {}): TierHolding {
  return {
    tier: 1,
    buyPrice: 100,
    shares: 10,
    buyDate: "2025-01-02",
    holdingDays: 0,
    ...overrides,
  };
}

export function buyOrder(
  overrides: { tier?: number; limitPrice?: number; shares?: number } = {}
): OrderIntent {
  return {
    type: "BUY",
    tier: overrides.tier ?? 1,
    orderMethod: "LOC",
    limitPrice: overrides.limitPrice ?? 99.99,
    shares: overrides.shares ?? 10,
  };
}

type SellOverrides = { tier?: number; shares?: number } & (
  | { orderMethod?: "LOC"; limitPrice?: number }
  | { orderMethod: "MOC"; limitPrice?: null }
);

export function sellOrder(overrides: SellOverrides = {}): OrderIntent {
  const tier = overrides.tier ?? 1;
  const shares = overrides.shares ?? 10;
  if (overrides.orderMethod === "MOC") {
    return { type: "SELL", tier, orderMethod: "MOC", limitPrice: null, shares };
  }
  return {
    type: "SELL",
    tier,
    orderMethod: "LOC",
    limitPrice: overrides.limitPrice ?? 100.48,
    shares,
  };
}
