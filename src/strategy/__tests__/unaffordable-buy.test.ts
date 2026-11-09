/**
 * unaffordableBuy 테스트 (#98)
 *
 * 매수할 티어가 있는데 예수금으로 1주도 살 수 없어 매수 주문을 내지 않는 날을 알린다.
 * 화면은 이 값으로 "예수금 $X로는 1주도 살 수 없어 주문하지 않습니다"를 그 티어 줄에 보인다.
 * 주문을 낼지 말지는 planOrders가 정하므로, 두 함수는 같은 날에 서로 어긋나면 안 된다.
 */
import { describe, it, expect } from "vitest";
import { planOrders, unaffordableBuy } from "@/strategy";
import { createHolding, createState } from "./fixtures";

// Pro2 시드 $10,000에서 티어 1-5 보유: 매수금액 합 = 1,000 + 1,500 + 2,000 + 2,500 + 2,000 = 9,000
const TIERS_1_TO_5 = [1, 2, 3, 4, 5].map((tier, i) =>
  createHolding({ tier, buyPrice: 100, shares: [10, 15, 20, 25, 20][i] })
);

describe("unaffordableBuy", () => {
  it("순실현손실로 예수금이 1주 가격보다 작으면 다음 티어와 예수금을 알려야 한다", () => {
    // 예수금 = min(1,000, 1,000 - 950) = 50 < 지정가 99.99
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -950 });

    expect(unaffordableBuy(state, 100)).toEqual({ tier: 6, availableCash: 50 });
    expect(planOrders(state, 100).filter((o) => o.type === "BUY")).toHaveLength(0);
  });

  it("예수금이 0이어도 매수할 기본 티어가 남아 있으면 알려야 한다", () => {
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -1_200 });

    expect(unaffordableBuy(state, 100)).toEqual({ tier: 6, availableCash: 0 });
  });

  it("줄어든 금액으로도 1주 이상 살 수 있으면 알리지 않아야 한다", () => {
    // 예수금 = 1,000 - 700 = 300 → 3주 매수
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -700 });

    expect(unaffordableBuy(state, 100)).toBeNull();
    expect(planOrders(state, 100).find((o) => o.type === "BUY")?.shares).toBe(3);
  });

  it("예비 티어도 남은 예수금으로 1주를 살 수 없으면 알려야 한다", () => {
    // 티어 1-6 매수금액 합 = 9,950 → 예수금 50
    const holdings = [...TIERS_1_TO_5, createHolding({ tier: 6, buyPrice: 95, shares: 10 })];
    const state = createState({ holdings });

    expect(unaffordableBuy(state, 100)).toEqual({ tier: 7, availableCash: 50 });
  });

  it("매수할 티어가 없으면 알리지 않아야 한다", () => {
    // 티어 1-6을 보유하고 예수금이 0이면 예비 티어도 사지 않는다
    const holdings = [...TIERS_1_TO_5, createHolding({ tier: 6, buyPrice: 100, shares: 10 })];

    expect(unaffordableBuy(createState({ holdings }), 100)).toBeNull();
  });

  it("예수금은 넉넉한데 비율대로의 금액이 1주보다 작으면 예수금 탓이 아니므로 알리지 않아야 한다", () => {
    // 시드 $500: 티어 1 금액 = 50 < 지정가 99.99, 예수금은 500
    const state = createState({ cycleCapital: 500 });

    expect(unaffordableBuy(state, 100)).toBeNull();
    expect(planOrders(state, 100)).toHaveLength(0);
  });
});
