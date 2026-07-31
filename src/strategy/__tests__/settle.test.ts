/**
 * settle 테스트
 * 기존 cycle.test.ts(티어 활성화/비활성화, 예수금, 사이클 완료)와
 * order.test.ts(체결 판정)의 규칙 검증을 새 interface 대상으로 이식.
 *
 * 규칙 의미는 #43 "확정된 규칙 의미" 절을 따른다.
 * 예수금 의미는 ADR-0001: 사이클 자본 - Σ(활성 티어 투자원금).
 */
import { describe, it, expect } from "vitest";
import { planOrders } from "../plan-orders";
import { settle } from "../settle";
import { availableCash } from "../calculations";
import type { OrderIntent } from "../types";
import { buyOrder, createHolding, createState, sellOrder } from "./fixtures";

describe("settle - 매수 체결", () => {
  it("당일 종가가 매수 지정가 이하면 체결되어야 한다", () => {
    const state = createState();
    const { newState, executions } = settle(state, [buyOrder()], {
      date: "2025-01-03",
      close: 99,
    });

    expect(executions).toHaveLength(1);
    expect(executions[0].price).toBe(99);
    expect(executions[0].amount).toBe(990);

    expect(newState.holdings).toHaveLength(1);
    expect(newState.holdings[0]).toEqual({
      tier: 1,
      buyPrice: 99,
      shares: 10,
      buyDate: "2025-01-03",
      holdingDays: 0,
    });
  });

  it("당일 종가가 매수 지정가와 같으면 체결되어야 한다", () => {
    const { executions } = settle(createState(), [buyOrder()], {
      date: "2025-01-03",
      close: 99.99,
    });
    expect(executions).toHaveLength(1);
  });

  it("당일 종가가 매수 지정가보다 높으면 미체결이어야 한다", () => {
    const state = createState();
    const { newState, executions } = settle(state, [buyOrder()], {
      date: "2025-01-03",
      close: 100,
    });

    expect(executions).toHaveLength(0);
    expect(newState.holdings).toHaveLength(0);
  });

  it("매수 체결 시 예수금이 투자원금만큼 감소해야 한다", () => {
    const { newState } = settle(createState(), [buyOrder()], {
      date: "2025-01-03",
      close: 99,
    });
    // 예수금 = 10000 - 99 × 10 = 9010
    expect(availableCash(newState)).toBe(9010);
  });

  it("원본 상태를 변경하지 않아야 한다 (순수 함수)", () => {
    const state = createState();
    settle(state, [buyOrder()], { date: "2025-01-03", close: 99 });
    expect(state.holdings).toHaveLength(0);
  });
});

describe("settle - 매도 체결", () => {
  it("당일 종가가 매도 지정가 이상이면 체결되고 실현 손익을 반환해야 한다", () => {
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 99, shares: 10 })],
    });
    const { newState, executions } = settle(
      state,
      [sellOrder({ limitPrice: 100.48, shares: 10 })],
      { date: "2025-01-06", close: 101 }
    );

    expect(executions).toHaveLength(1);
    expect(executions[0].price).toBe(101);
    expect(executions[0].amount).toBe(1010);
    // 실현 손익 = (101 - 99) × 10 = 20
    expect(executions[0].profit).toBe(20);
    expect(newState.holdings).toHaveLength(0);
  });

  it("당일 종가가 매도 지정가와 같으면 체결되어야 한다", () => {
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 99, shares: 10 })],
    });
    const { executions } = settle(state, [sellOrder({ limitPrice: 100.48, shares: 10 })], {
      date: "2025-01-06",
      close: 100.48,
    });
    expect(executions).toHaveLength(1);
  });

  it("당일 종가가 매도 지정가보다 낮으면 미체결이어야 한다", () => {
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 99, shares: 10 })],
    });
    const { newState, executions } = settle(
      state,
      [sellOrder({ limitPrice: 100.48, shares: 10 })],
      { date: "2025-01-06", close: 100 }
    );

    expect(executions).toHaveLength(0);
    expect(newState.holdings).toHaveLength(1);
  });

  it("매도 체결 시 원금만 예수금으로 회복되고 실현 수익은 포함되지 않아야 한다 (ADR-0001)", () => {
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 99, shares: 10 })],
    });
    // 체결 전 예수금 = 10000 - 990 = 9010
    expect(availableCash(state)).toBe(9010);

    const { newState } = settle(state, [sellOrder({ limitPrice: 100.48, shares: 10 })], {
      date: "2025-01-06",
      close: 101,
    });
    // 수익 20이 났지만 예수금은 원금 회복분까지만: 10000 (10020이 아님)
    expect(availableCash(newState)).toBe(10000);
  });

  it("손실 매도 시 음수 손익을 반환해야 한다", () => {
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 100, shares: 10, holdingDays: 9 })],
    });
    const { executions } = settle(
      state,
      [sellOrder({ orderMethod: "MOC", limitPrice: null, shares: 10 })],
      { date: "2025-01-16", close: 90 }
    );
    // 실현 손익 = (90 - 100) × 10 = -100
    expect(executions[0].profit).toBe(-100);
  });
});

describe("settle - 손절(MOC) 체결", () => {
  it("MOC 매도는 종가와 무관하게 당일 종가로 체결되어야 한다", () => {
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 100, shares: 10, holdingDays: 9 })],
    });
    const { newState, executions } = settle(
      state,
      [sellOrder({ orderMethod: "MOC", limitPrice: null, shares: 10 })],
      { date: "2025-01-16", close: 95 }
    );

    expect(executions).toHaveLength(1);
    expect(executions[0].order.orderMethod).toBe("MOC");
    expect(executions[0].price).toBe(95);
    expect(newState.holdings).toHaveLength(0);
  });
});

describe("settle - 보유일 카운트", () => {
  it("체결되지 않고 남은 티어의 holdingDays가 1 증가해야 한다 (실제 거래일 기준)", () => {
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 100, shares: 10, holdingDays: 3 })],
    });
    const { newState } = settle(state, [sellOrder({ limitPrice: 101.5, shares: 10 })], {
      date: "2025-01-08",
      close: 100,
    });
    expect(newState.holdings[0].holdingDays).toBe(4);
  });

  it("당일 매수한 티어의 holdingDays는 0이어야 한다 (매수 당일 = 0일)", () => {
    const { newState } = settle(createState(), [buyOrder()], {
      date: "2025-01-03",
      close: 99,
    });
    expect(newState.holdings[0].holdingDays).toBe(0);
  });
});

describe("settle - 사이클 완료", () => {
  it("마지막 보유 티어가 매도되면 CYCLE_COMPLETED 이벤트를 통지해야 한다", () => {
    const state = createState({
      cycleNumber: 3,
      holdings: [createHolding({ tier: 1, buyPrice: 99, shares: 10 })],
    });
    const { newState, events } = settle(state, [sellOrder({ limitPrice: 100.48, shares: 10 })], {
      date: "2025-01-06",
      close: 101,
    });

    expect(events).toEqual([{ type: "CYCLE_COMPLETED", cycleNumber: 3 }]);
    expect(newState.holdings).toHaveLength(0);
    // 새 사이클 시작은 호출자의 몫: cycleNumber는 그대로 유지
    expect(newState.cycleNumber).toBe(3);
  });

  it("전량 매도와 동시에 매수가 체결되면 사이클은 계속되어야 한다", () => {
    // 엔진 규칙: 손절로 티어가 비워져도 동시에 제출된 매수가 체결되면 사이클 계속
    const state = createState({
      holdings: [createHolding({ tier: 1, buyPrice: 100, shares: 10, holdingDays: 9 })],
    });
    const orders: OrderIntent[] = [
      buyOrder({ tier: 2, limitPrice: 99.99, shares: 15 }),
      sellOrder({ orderMethod: "MOC", limitPrice: null, shares: 10 }),
    ];
    const { newState, events } = settle(state, orders, { date: "2025-01-16", close: 95 });

    expect(events).toHaveLength(0);
    expect(newState.holdings.map((h) => h.tier)).toEqual([2]);
  });

  it("체결이 없으면 이벤트가 없어야 한다", () => {
    const { events } = settle(createState(), [buyOrder()], {
      date: "2025-01-03",
      close: 100,
    });
    expect(events).toHaveLength(0);
  });
});

describe("settle - 주문 검증", () => {
  it("보유하지 않은 티어의 매도 주문은 에러를 발생시켜야 한다", () => {
    expect(() =>
      settle(createState(), [sellOrder({ tier: 3 })], { date: "2025-01-03", close: 100 })
    ).toThrow("Tier 3 is not held");
  });

  it("이미 보유한 티어의 매수 주문은 에러를 발생시켜야 한다", () => {
    const state = createState({ holdings: [createHolding({ tier: 1 })] });
    expect(() => settle(state, [buyOrder({ tier: 1 })], { date: "2025-01-03", close: 99 })).toThrow(
      "Tier 1 is already held"
    );
  });

  it("매수 주문이 2건 이상이면 에러를 발생시켜야 한다", () => {
    expect(() =>
      settle(createState(), [buyOrder({ tier: 1 }), buyOrder({ tier: 2 })], {
        date: "2025-01-03",
        close: 99,
      })
    ).toThrow("At most one buy order per day");
  });

  it("매수 체결 비용이 예수금을 초과하면 에러를 발생시켜야 한다", () => {
    // cycle.test.ts "예수금이 부족하면 에러" 이식.
    // planOrders는 예수금 내에서만 주문을 생성하므로 이 경로는 주문표 오염 방어선이다.
    const state = createState({ cycleCapital: 1000 });
    expect(() =>
      settle(state, [buyOrder({ limitPrice: 100, shares: 20 })], {
        date: "2025-01-03",
        close: 100,
      })
    ).toThrow("Insufficient cash for buy execution");
  });

  it("종가가 0 이하면 에러를 발생시켜야 한다", () => {
    expect(() => settle(createState(), [], { date: "2025-01-03", close: 0 })).toThrow(
      "close must be greater than 0"
    );
  });
});

describe("planOrders + settle 합성 - 하루 루프", () => {
  it("매수 → 보유 → 목표가 매도 → 사이클 완료가 이어져야 한다", () => {
    // 엔진 시나리오 이식: Day1 종가 100 → Day2 99 매수 → Day3 100 미체결 → Day4 101 매도
    let state = createState();

    // Day 2: 전일 종가 100 기준 주문, 종가 99 → 티어 1 매수 체결
    let result = settle(state, planOrders(state, 100), { date: "2025-01-03", close: 99 });
    expect(result.newState.holdings.map((h) => h.tier)).toEqual([1]);
    state = result.newState;

    // Day 3: 종가 100 → 매도 지정가 100.48 미달, 매수 지정가 98.99보다 높아 매수도 미체결
    result = settle(state, planOrders(state, 99), { date: "2025-01-04", close: 100 });
    expect(result.executions).toHaveLength(0);
    expect(result.newState.holdings[0].holdingDays).toBe(1);
    state = result.newState;

    // Day 4: 종가 101 → 매도 체결 (101 >= 100.48), 사이클 완료
    result = settle(state, planOrders(state, 100), { date: "2025-01-05", close: 101 });
    const sellExecution = result.executions.find((e) => e.order.type === "SELL");
    expect(sellExecution?.profit).toBe(20);
    expect(result.events).toEqual([{ type: "CYCLE_COMPLETED", cycleNumber: 1 }]);
  });

  it("손절일 도달 시 MOC 매도가 체결되어야 한다 (Pro2 = 10 거래일)", () => {
    // 엔진 시나리오 이식: 매수 후 횡보로 10 거래일 경과 → MOC 손절
    let state = createState();
    let result = settle(state, planOrders(state, 100), { date: "2025-01-03", close: 99 });
    state = result.newState;

    // 9 거래일 횡보 (holdingDays 0 → 9)
    for (let day = 0; day < 9; day++) {
      result = settle(state, planOrders(state, 99), { date: `2025-01-${10 + day}`, close: 99 });
      state = result.newState;
    }
    // 마지막 settle에서 holdingDays 9 → 다음 날 손절
    expect(state.holdings[0]?.holdingDays).toBe(9);

    const orders = planOrders(state, 99);
    const stopLossOrder = orders.find((o) => o.type === "SELL");
    expect(stopLossOrder?.orderMethod).toBe("MOC");

    result = settle(state, orders, { date: "2025-01-20", close: 99 });
    const stopLossExecution = result.executions.find((e) => e.order.orderMethod === "MOC");
    expect(stopLossExecution).toBeDefined();
    expect(stopLossExecution?.price).toBe(99);
    expect(result.events).toEqual([{ type: "CYCLE_COMPLETED", cycleNumber: 1 }]);
  });
});
