/**
 * planOrdersDetailed 테스트 (#98)
 *
 * 주문표와 함께, 예수금 때문에 비율대로 사지 못하는 매수를 알린다.
 * - unaffordableBuy: 매수할 티어가 있는데 예수금으로 1주도 살 수 없어 매수 주문을 내지 않는 날.
 *   화면은 "예수금 $X로는 1주도 살 수 없어 주문하지 않습니다"를 그 티어 줄에 보인다.
 * - reducedBuy: 매수 주문은 나가지만 예수금 때문에 비율대로의 수량보다 덜 사는 날.
 *   화면은 수량을 ~~비율대로의 수량~~ 실제 수량으로 보인다 (결정은 #93 시안 C).
 * 둘 다 주문표와 같은 한 번의 매수 판단에서 나오므로 서로 어긋나지 않는다.
 */
import { describe, it, expect } from "vitest";
import { planOrders, planOrdersDetailed } from "@/strategy";
import { createHolding, createState } from "./fixtures";

// Pro2 시드 $10,000에서 티어 1-5 보유: 매수금액 합 = 1,000 + 1,500 + 2,000 + 2,500 + 2,000 = 9,000
// 티어 6의 비율대로의 금액은 $1,000 (지정가 99.99로 10주)
const TIERS_1_TO_5 = [1, 2, 3, 4, 5].map((tier, i) =>
  createHolding({ tier, buyPrice: 100, shares: [10, 15, 20, 25, 20][i] })
);

describe("planOrdersDetailed - 주문표", () => {
  it("주문 의도는 planOrders와 같아야 한다", () => {
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -700 });

    expect(planOrdersDetailed(state, 100).intents).toEqual(planOrders(state, 100));
  });
});

describe("planOrdersDetailed - 예수금으로 1주도 살 수 없는 날 (unaffordableBuy)", () => {
  it("순실현손실로 예수금이 1주 가격보다 작으면 다음 티어와 예수금을 알려야 한다", () => {
    // 예수금 = min(1,000, 1,000 - 950) = 50 < 지정가 99.99
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -950 });

    const plan = planOrdersDetailed(state, 100);

    expect(plan.unaffordableBuy).toEqual({ tier: 6, availableCash: 50 });
    expect(plan.intents.filter((o) => o.type === "BUY")).toHaveLength(0);
  });

  it("예수금이 0이어도 매수할 기본 티어가 남아 있으면 알려야 한다", () => {
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -1_200 });

    expect(planOrdersDetailed(state, 100).unaffordableBuy).toEqual({ tier: 6, availableCash: 0 });
  });

  it("줄어든 금액으로도 1주 이상 살 수 있으면 알리지 않아야 한다", () => {
    // 예수금 = 1,000 - 700 = 300 → 3주 매수
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -700 });

    const plan = planOrdersDetailed(state, 100);

    expect(plan.unaffordableBuy).toBeNull();
    expect(plan.intents.find((o) => o.type === "BUY")?.shares).toBe(3);
  });

  it("예비 티어도 남은 예수금으로 1주를 살 수 없으면 알려야 한다", () => {
    // 티어 1-6 매수금액 합 = 9,950 → 예수금 50
    const holdings = [...TIERS_1_TO_5, createHolding({ tier: 6, buyPrice: 95, shares: 10 })];

    expect(planOrdersDetailed(createState({ holdings }), 100).unaffordableBuy).toEqual({
      tier: 7,
      availableCash: 50,
    });
  });

  it("매수할 티어가 없으면 알리지 않아야 한다", () => {
    // 티어 1-6을 보유하고 예수금이 0이면 예비 티어도 사지 않는다
    const holdings = [...TIERS_1_TO_5, createHolding({ tier: 6, buyPrice: 100, shares: 10 })];

    expect(planOrdersDetailed(createState({ holdings }), 100).unaffordableBuy).toBeNull();
  });

  it("예수금은 넉넉한데 비율대로의 금액이 1주보다 작으면 예수금 탓이 아니므로 알리지 않아야 한다", () => {
    // 시드 $500: 티어 1 금액 = 50 < 지정가 99.99, 예수금은 500
    const plan = planOrdersDetailed(createState({ cycleCapital: 500 }), 100);

    expect(plan.unaffordableBuy).toBeNull();
    expect(plan.intents).toHaveLength(0);
  });

  it("비율대로의 금액이 예수금과 같아도 그 금액이 1주보다 작으면 예수금 탓이 아니므로 알리지 않아야 한다", () => {
    // 시드 $500, 순실현손실 $450 → 예수금 = min(500, 50) = 50
    // 티어 1 비율대로의 금액 = 500 × 10% = 50 = 예수금이지만, 손실이 없어도 1주(99.99)를 못 산다
    const plan = planOrdersDetailed(createState({ cycleCapital: 500, realizedPnl: -450 }), 100);

    expect(plan.unaffordableBuy).toBeNull();
    expect(plan.intents).toHaveLength(0);
  });
});

describe("planOrdersDetailed - 비율대로보다 덜 사는 매수 (reducedBuy)", () => {
  it("예수금 때문에 수량이 줄면 그 티어와 비율대로의 수량을 알려야 한다", () => {
    // 예수금 300: 실제 floor(300 / 99.99) = 3주, 비율대로 floor(1,000 / 99.99) = 10주
    const plan = planOrdersDetailed(
      createState({ holdings: TIERS_1_TO_5, realizedPnl: -700 }),
      100
    );

    expect(plan.reducedBuy).toEqual({ tier: 6, nominalShares: 10 });
    expect(plan.intents.find((o) => o.type === "BUY")?.shares).toBe(3);
  });

  it("비율대로 살 수 있으면 알리지 않아야 한다", () => {
    expect(planOrdersDetailed(createState({ holdings: TIERS_1_TO_5 }), 100).reducedBuy).toBeNull();
  });

  it("금액은 줄었어도 수량이 같으면 알리지 않아야 한다", () => {
    // 예수금 999.95: floor(999.95 / 99.99) = 10주 = 비율대로의 수량
    const plan = planOrdersDetailed(
      createState({ holdings: TIERS_1_TO_5, realizedPnl: -0.05 }),
      100
    );

    expect(plan.reducedBuy).toBeNull();
    expect(plan.intents.find((o) => o.type === "BUY")?.shares).toBe(10);
  });

  it("예비 티어는 비율이 없으므로 알리지 않아야 한다", () => {
    // 티어 1-6 매수금액 합 = 9,500 → 예수금 500으로 예비 티어 5주
    const holdings = [...TIERS_1_TO_5, createHolding({ tier: 6, buyPrice: 50, shares: 10 })];

    const plan = planOrdersDetailed(createState({ holdings }), 100);

    expect(plan.intents.find((o) => o.type === "BUY")).toMatchObject({ tier: 7, shares: 5 });
    expect(plan.reducedBuy).toBeNull();
  });

  it("1주도 살 수 없는 날에는 줄어든 매수가 아니라 내지 않는 매수로 알려야 한다", () => {
    const plan = planOrdersDetailed(
      createState({ holdings: TIERS_1_TO_5, realizedPnl: -950 }),
      100
    );

    expect(plan.reducedBuy).toBeNull();
    expect(plan.unaffordableBuy).not.toBeNull();
  });
});
