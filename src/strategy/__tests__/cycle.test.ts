/**
 * 사이클 경계 테스트
 * 기존 cycle.test.ts의 사이클 종료/시작(REQ-007) 규칙 검증을 새 interface 대상으로 이식.
 *
 * #43: 시드·전략 변경은 사이클 경계에서만 일어난다.
 * 사이클 자본은 외부에서 공급된다 (백테스트: 직전 사이클 종료 현금, 실계좌: 시드 금액).
 */
import { describe, it, expect } from "vitest";
import { startNextCycle } from "../cycle";
import { planOrders } from "../plan-orders";
import { settle } from "../settle";
import { getStrategyParams } from "../params";
import { createState } from "./fixtures";

describe("startNextCycle", () => {
  it("사이클 번호를 증가시키고 공급받은 자본으로 새 사이클을 시작해야 한다", () => {
    const state = createState({ cycleNumber: 2 });
    const next = startNextCycle(state, 10100);

    expect(next).toEqual({
      strategy: state.strategy,
      cycleCapital: 10100,
      holdings: [],
      cycleNumber: 3,
    });
  });

  it("전략 변경은 사이클 경계에서만 허용된다", () => {
    const state = createState();
    const next = startNextCycle(state, 10000, getStrategyParams("Pro3"));
    expect(next.strategy.name).toBe("Pro3");
  });

  it("보유 티어가 남아 있으면 에러를 발생시켜야 한다", () => {
    const state = createState({
      holdings: [{ tier: 1, buyPrice: 100, shares: 10, buyDate: "2025-01-02", holdingDays: 0 }],
    });
    expect(() => startNextCycle(state, 10000)).toThrow(
      "Cannot start next cycle: 1 active tier(s) remaining"
    );
  });

  it("자본이 0 이하면 에러를 발생시켜야 한다", () => {
    expect(() => startNextCycle(createState(), 0)).toThrow("cycleCapital must be greater than 0");
  });
});

describe("사이클 경계 합성 - 백테스트식 복리", () => {
  it("사이클 수익을 자본에 더해 새 사이클 티어 금액이 커져야 한다 (풀복리)", () => {
    // cycle.test.ts 이식: 10000으로 시작 → 수익 20 실현 → 새 사이클 자본 10020
    let state = createState();

    // 매수: 전일 종가 100, 종가 99 → 티어 1 매수 (99 × 10 = 990)
    let result = settle(state, planOrders(state, 100), { date: "2025-01-03", close: 99 });
    state = result.newState;

    // 매도: 종가 101 >= 지정가 100.48 → 수익 20, 사이클 완료
    result = settle(state, planOrders(state, 99), { date: "2025-01-06", close: 101 });
    expect(result.events).toEqual([{ type: "CYCLE_COMPLETED", cycleNumber: 1 }]);

    // 백테스트 호출자: 종료 현금 = 사이클 자본 + Σ실현손익 (ADR-0001 Consequences)
    const realizedProfit = result.executions.reduce((sum, e) => sum + (e.profit ?? 0), 0);
    const nextCapital = state.cycleCapital + realizedProfit;
    state = startNextCycle(result.newState, nextCapital);

    expect(state.cycleCapital).toBe(10020);
    expect(state.cycleNumber).toBe(2);

    // 새 사이클 티어 1 금액 = 10020 × 10% = 1002 → 전일 종가 10 기준 지정가 9.99, 수량 100
    const orders = planOrders(state, 10);
    expect(orders[0].shares).toBe(100); // floor(1002 / 9.99) = 100
  });
});
