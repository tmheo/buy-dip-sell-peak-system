/**
 * planOrders 테스트
 * 기존 order.test.ts(매수·매도 지정가, 수량)와 cycle.test.ts(티어 선정, 티어 금액)의
 * 규칙 검증을 새 interface 대상으로 이식.
 *
 * 규칙 의미는 #43 "확정된 규칙 의미" 절을 따른다.
 */
import { describe, it, expect } from "vitest";
import { planOrders } from "../plan-orders";
import { getStrategyParams } from "../params";
import { createHolding, createState } from "./fixtures";

describe("planOrders - 매수 주문 생성", () => {
  it("빈 사이클에서는 티어 1 LOC 매수 주문 하나를 생성해야 한다", () => {
    const orders = planOrders(createState(), 100);

    expect(orders).toHaveLength(1);
    expect(orders[0]).toEqual({
      type: "BUY",
      tier: 1,
      orderMethod: "LOC",
      // 매수 지정가 = floor(100 × (1 - 0.0001), 2) = 99.99
      limitPrice: 99.99,
      // 티어 1 금액 = 10000 × 10% = 1000, 수량 = floor(1000 / 99.99) = 10
      shares: 10,
    });
  });

  it("매수 지정가는 전일 종가 × (1 + buyThreshold)를 소수점 2자리로 내림해야 한다", () => {
    // floor(25.50 × 0.9999, 2) = floor(25.497..., 2) = 25.49
    const orders = planOrders(createState(), 25.5);
    expect(orders[0].limitPrice).toBe(25.49);

    // Pro3: floor(100 × 0.999, 2) = 99.90
    const pro3Orders = planOrders(createState({ strategy: getStrategyParams("Pro3") }), 100);
    expect(pro3Orders[0].limitPrice).toBe(99.9);
  });

  it("매수 수량은 티어 금액 ÷ 매수 지정가를 정수로 내림해야 한다", () => {
    // Pro2 티어 1 금액 = 33330 × 10% = 3333
    // 지정가 = floor(33.33 × 0.9999, 2) = 33.32
    // 수량 = floor(3333 / 33.32) = floor(100.03...) = 100
    const orders = planOrders(createState({ cycleCapital: 33330 }), 33.33);
    expect(orders[0].shares).toBe(100);
  });

  it("티어 금액이 지정가보다 작아 수량이 0이면 매수 주문을 생성하지 않아야 한다", () => {
    const orders = planOrders(createState({ cycleCapital: 500 }), 100);
    // 티어 1 금액 = 500 × 10% = 50 < 지정가 99.99 → 수량 0
    expect(orders.filter((o) => o.type === "BUY")).toHaveLength(0);
  });

  it("가장 낮은 빈 기본 티어를 매수 티어로 선정해야 한다", () => {
    // 티어 2, 3 보유 중 → 티어 1이 다음 매수 티어
    const state = createState({
      holdings: [createHolding({ tier: 2 }), createHolding({ tier: 3 })],
    });
    const orders = planOrders(state, 100);
    const buyOrder = orders.find((o) => o.type === "BUY");
    expect(buyOrder?.tier).toBe(1);
  });

  it("티어 1-6이 모두 보유 중이고 예수금이 있으면 예비 티어(7) 매수 주문을 생성해야 한다", () => {
    // #40 회귀: 기본 티어 매수 완료 후 예비 티어 주문이 누락되면 안 된다
    const holdings = [1, 2, 3, 4, 5, 6].map((tier) =>
      createHolding({ tier, buyPrice: 100, shares: 10 })
    );
    const orders = planOrders(createState({ holdings }), 100);
    const buyOrder = orders.find((o) => o.type === "BUY");

    expect(buyOrder?.tier).toBe(7);
    // 예수금 = 10000 - 6 × 1000 = 4000, 수량 = floor(4000 / 99.99) = 40
    expect(buyOrder?.shares).toBe(40);
  });

  it("티어 1-6이 모두 보유 중이고 예수금이 없으면 매수 주문을 생성하지 않아야 한다", () => {
    // 투자원금 합 = (16 + 16 + 17 + 17 + 17 + 17) × 100 = 10000 → 예수금 0
    const shares = [16, 16, 17, 17, 17, 17];
    const holdings = [1, 2, 3, 4, 5, 6].map((tier) =>
      createHolding({ tier, buyPrice: 100, shares: shares[tier - 1] })
    );
    const orders = planOrders(createState({ holdings }), 100);
    expect(orders.filter((o) => o.type === "BUY")).toHaveLength(0);
  });

  it("티어 1-7이 모두 보유 중이면 매수 주문을 생성하지 않아야 한다", () => {
    const holdings = [1, 2, 3, 4, 5, 6, 7].map((tier) =>
      createHolding({ tier, buyPrice: 100, shares: 10 })
    );
    const orders = planOrders(createState({ holdings }), 100);
    expect(orders.filter((o) => o.type === "BUY")).toHaveLength(0);
  });

  it("예비 티어 금액은 예수금 전액이며 실현 수익은 포함하지 않아야 한다 (ADR-0001)", () => {
    // 사이클 중 티어를 수익 매도했더라도 예수금은 보유 상태에서만 파생된다:
    // 예수금 = 사이클 자본 - Σ(활성 티어 투자원금)
    const holdings = [1, 2, 3, 4, 5, 6].map((tier) =>
      createHolding({ tier, buyPrice: 99, shares: 10 })
    );
    const orders = planOrders(createState({ holdings }), 100);
    const buyOrder = orders.find((o) => o.type === "BUY");

    // 예수금 = 10000 - 6 × 990 = 4060, 수량 = floor(4060 / 99.99) = 40
    expect(buyOrder?.tier).toBe(7);
    expect(buyOrder?.shares).toBe(40);
  });

  it("티어 금액은 사이클 자본 × 전략 비율이어야 한다 (Pro2)", () => {
    // Pro2 비율: 10%, 15%, 20%, 25%, 20%, 10%
    // 전일 종가 10, 지정가 = floor(10 × 0.9999, 2) = 9.99
    // 티어별 수량 = floor(사이클 자본 × 비율 ÷ 9.99)
    const expectedShares = [100, 150, 200, 250, 200, 100];
    for (let tier = 1; tier <= 6; tier++) {
      const holdings = [];
      for (let t = 1; t < tier; t++) {
        holdings.push(createHolding({ tier: t, buyPrice: 10, shares: 1 }));
      }
      const orders = planOrders(createState({ holdings }), 10);
      const buyOrder = orders.find((o) => o.type === "BUY");
      expect(buyOrder?.tier).toBe(tier);
      // floor(10000 × ratio / 9.99)
      expect(buyOrder?.shares).toBe(expectedShares[tier - 1]);
    }
  });
});

describe("planOrders - 매도 주문 생성", () => {
  it("보유 티어마다 LOC 매도 주문을 생성해야 한다", () => {
    const state = createState({
      holdings: [
        createHolding({ tier: 1, buyPrice: 99, shares: 10 }),
        createHolding({ tier: 2, buyPrice: 25.49, shares: 15 }),
      ],
    });
    const orders = planOrders(state, 100);
    const sellOrders = orders.filter((o) => o.type === "SELL");

    expect(sellOrders).toHaveLength(2);
    // 매도 지정가 = floor(매수가 × (1 + 1.5%), 2)
    // floor(99 × 1.015, 2) = floor(100.485, 2) = 100.48
    expect(sellOrders[0]).toEqual({
      type: "SELL",
      tier: 1,
      orderMethod: "LOC",
      limitPrice: 100.48,
      shares: 10,
    });
    // floor(25.49 × 1.015, 2) = floor(25.87235, 2) = 25.87
    expect(sellOrders[1]).toEqual({
      type: "SELL",
      tier: 2,
      orderMethod: "LOC",
      limitPrice: 25.87,
      shares: 15,
    });
  });

  it("매도 지정가는 전략별 매도 임계값을 따라야 한다", () => {
    const holding = createHolding({ tier: 1, buyPrice: 100, shares: 10 });

    // Pro1: floor(100 × 1.0001, 2) = 100.01
    const pro1 = planOrders(
      createState({ strategy: getStrategyParams("Pro1"), holdings: [holding] }),
      100
    );
    expect(pro1.find((o) => o.type === "SELL")?.limitPrice).toBe(100.01);

    // Pro3: floor(100 × 1.02, 2) = 102.00
    const pro3 = planOrders(
      createState({ strategy: getStrategyParams("Pro3"), holdings: [holding] }),
      100
    );
    expect(pro3.find((o) => o.type === "SELL")?.limitPrice).toBe(102);
  });
});

describe("planOrders - 손절 주문 생성", () => {
  it("당일로 손절일에 도달하는 티어는 MOC 매도 주문을 생성해야 한다", () => {
    // Pro2 손절일 = 10 거래일. holdingDays 9 → 당일 마감 시 10일째 → 손절
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 100, shares: 10, holdingDays: 9 })],
    });
    const orders = planOrders(state, 100);
    const sellOrder = orders.find((o) => o.type === "SELL");

    expect(sellOrder).toEqual({
      type: "SELL",
      tier: 1,
      orderMethod: "MOC",
      limitPrice: null,
      shares: 10,
    });
  });

  it("손절일 전 티어는 LOC 매도 주문을 유지해야 한다", () => {
    // holdingDays 8 → 당일 마감 시 9일째 → 아직 손절 아님
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 100, shares: 10, holdingDays: 8 })],
    });
    const orders = planOrders(state, 100);
    const sellOrder = orders.find((o) => o.type === "SELL");

    expect(sellOrder?.orderMethod).toBe("LOC");
  });

  it("손절일은 전략별 설정을 따라야 한다 (Pro3 = 12 거래일)", () => {
    const strategy = getStrategyParams("Pro3");
    const atStopLoss = planOrders(
      createState({
        strategy,
        holdings: [createHolding({ tier: 1, holdingDays: 11 })],
      }),
      100
    );
    expect(atStopLoss.find((o) => o.type === "SELL")?.orderMethod).toBe("MOC");

    const beforeStopLoss = planOrders(
      createState({
        strategy,
        holdings: [createHolding({ tier: 1, holdingDays: 10 })],
      }),
      100
    );
    expect(beforeStopLoss.find((o) => o.type === "SELL")?.orderMethod).toBe("LOC");
  });
});
