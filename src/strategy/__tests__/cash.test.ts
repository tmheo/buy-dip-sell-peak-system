/**
 * 예수금과 계좌 현금 테스트 (ADR-0003)
 *
 * 예수금 = max(0, min(사이클 자본 - Σ 활성 티어 매수금액, 계좌 현금))
 * 계좌 현금 = 사이클 자본 - Σ 활성 티어 매수금액 + 이번 사이클 실현손익
 */
import { describe, it, expect } from "vitest";
import { accountCash, availableCash, cashBreakdown, planOrders, settle } from "@/strategy";
import { createHolding, createState, sellOrder } from "./fixtures";

describe("availableCash / accountCash - 사이클 안 실현손익", () => {
  it("순손실 사이클에서는 예수금과 계좌 현금이 손실만큼 줄어야 한다", () => {
    // 티어 2 보유(99 × 10 = 990), 앞서 티어 1을 손절해 -300 실현
    const state = createState({
      holdings: [createHolding({ tier: 2, buyPrice: 99, shares: 10 })],
      realizedPnl: -300,
    });

    // 계좌 현금 = 10000 - 990 - 300 = 8710, 예수금 = min(9010, 8710) = 8710
    expect(accountCash(state)).toBe(8710);
    expect(availableCash(state)).toBe(8710);
  });

  it("이익이 앞선 손실을 상계해야 한다", () => {
    // 앞서 -300을 실현한 사이클에서 티어 2를 +200에 익절하면 순손실은 -100으로 준다
    const state = createState({
      holdings: [createHolding({ tier: 2, buyPrice: 100, shares: 10 })],
      realizedPnl: -300,
    });
    const { newState } = settle(state, [sellOrder({ tier: 2, limitPrice: 101.5, shares: 10 })], {
      date: "2025-01-06",
      close: 120,
    });

    // 계좌 현금 = 10000 - 0 - 100 = 9900, 예수금 = min(10000, 9900) = 9900
    expect(accountCash(newState)).toBe(9900);
    expect(availableCash(newState)).toBe(9900);
  });

  it("실현손익이 플러스면 예수금은 투자되지 않은 사이클 자본을 넘지 않아야 한다 (ADR-0001)", () => {
    const state = createState({
      holdings: [createHolding({ tier: 2, buyPrice: 99, shares: 10 })],
      realizedPnl: 50,
    });

    // 계좌 현금 = 10000 - 990 + 50 = 9060, 예수금 = min(9010, 9060) = 9010
    expect(accountCash(state)).toBe(9060);
    expect(availableCash(state)).toBe(9010);
  });

  it("계좌 현금이 음수가 되어도 예수금은 0 아래로 내려가지 않아야 한다", () => {
    // 옛 규칙으로 계좌 현금보다 큰 매수가 이미 체결된 진행 중인 사이클
    const state = createState({
      holdings: [createHolding({ tier: 2, buyPrice: 95, shares: 100 })],
      realizedPnl: -800,
    });

    // 계좌 현금 = 10000 - 9500 - 800 = -300
    expect(accountCash(state)).toBe(-300);
    expect(availableCash(state)).toBe(0);
  });
});

describe("planOrders - 순실현손실이 있는 사이클의 매수 금액", () => {
  it("뒤쪽 티어를 보유한 채 앞쪽 티어가 손절되면 그 티어의 재매수 금액이 줄어야 한다", () => {
    // Pro2 비율 10/15/20/25/20/10%, 티어 2-6 보유(1500 + 2000 + 2500 + 2000 + 1000 = 9000),
    // 티어 1은 손절되어 -300 실현
    const holdings = [
      createHolding({ tier: 2, buyPrice: 10, shares: 150 }),
      createHolding({ tier: 3, buyPrice: 10, shares: 200 }),
      createHolding({ tier: 4, buyPrice: 10, shares: 250 }),
      createHolding({ tier: 5, buyPrice: 10, shares: 200 }),
      createHolding({ tier: 6, buyPrice: 10, shares: 100 }),
    ];
    const state = createState({ holdings, realizedPnl: -300 });

    const buy = planOrders(state, 10).find((o) => o.type === "BUY");

    // 예수금 = min(10000 - 9000, 10000 - 9000 - 300) = 700
    // 티어 1 금액 = min(10000 × 10%, 700) = 700, 지정가 9.99 → floor(700 / 9.99) = 70주
    // (옛 규칙이면 floor(1000 / 9.99) = 100주로 계좌 현금 700을 넘는다)
    expect(buy?.tier).toBe(1);
    expect(buy?.shares).toBe(70);
  });
});

describe("cashBreakdown - 화면용 현금 내역", () => {
  it("순손실 사이클의 예수금, 그 계산식의 항목, 티어별 할당 시드를 보여야 한다", () => {
    // Pro2 비율 10/15/20/25/20/10%. 티어 1-4 보유(1000 + 1500 + 2000 + 2500 = 7000),
    // 앞서 손절로 -1800 실현 → 예수금 = min(3000, 1200) = 1200
    const holdings = [
      createHolding({ tier: 1, buyPrice: 10, shares: 100 }),
      createHolding({ tier: 2, buyPrice: 10, shares: 150 }),
      createHolding({ tier: 3, buyPrice: 10, shares: 200 }),
      createHolding({ tier: 4, buyPrice: 10, shares: 250 }),
    ];
    const breakdown = cashBreakdown(createState({ holdings, realizedPnl: -1800 }));

    expect(breakdown).toEqual({
      availableCash: 1200,
      accountCash: 1200,
      // 예수금 계산식: 시드 10,000 - 투자 중 7,000 - 순실현손실 1,800 = 1,200
      cycleCapital: 10000,
      investedAmount: 7000,
      netRealizedLoss: 1800,
      isCashReduced: true,
      tiers: [
        // 보유 중인 티어는 비율대로의 금액
        { tier: 1, amount: 1000, nominalAmount: 1000, isReduced: false },
        { tier: 2, amount: 1500, nominalAmount: 1500, isReduced: false },
        { tier: 3, amount: 2000, nominalAmount: 2000, isReduced: false },
        { tier: 4, amount: 2500, nominalAmount: 2500, isReduced: false },
        // 아직 안 산 티어는 지금 사면 쓰일 금액: 티어 5 min(2000, 1200), 티어 6 min(1000, 1200)
        { tier: 5, amount: 1200, nominalAmount: 2000, isReduced: true },
        { tier: 6, amount: 1000, nominalAmount: 1000, isReduced: false },
        // 예비 티어는 기본 티어 1-6이 다 차기 전에는 할당이 없다
        { tier: 7, amount: 0, nominalAmount: null, isReduced: false },
      ],
    });
  });

  it("손실이 없으면 예수금이 줄지 않았고 기본 티어는 비율대로의 금액이어야 한다", () => {
    const breakdown = cashBreakdown(createState({ realizedPnl: 120 }));

    expect(breakdown.availableCash).toBe(10000);
    expect(breakdown.accountCash).toBe(10120);
    expect(breakdown.investedAmount).toBe(0);
    expect(breakdown.netRealizedLoss).toBe(0);
    expect(breakdown.isCashReduced).toBe(false);
    expect(breakdown.tiers.map(({ amount, isReduced }) => ({ amount, isReduced }))).toEqual([
      { amount: 1000, isReduced: false },
      { amount: 1500, isReduced: false },
      { amount: 2000, isReduced: false },
      { amount: 2500, isReduced: false },
      { amount: 2000, isReduced: false },
      { amount: 1000, isReduced: false },
      { amount: 0, isReduced: false },
    ]);
  });

  it("기본 티어 1-6이 모두 보유 중이면 예비 티어에 예수금 전액을 할당해야 한다", () => {
    // 티어 1-6 매수금액 합 = 9,500 → 예수금 500
    const holdings = [1, 2, 3, 4, 5, 6].map((tier) =>
      createHolding({ tier, buyPrice: 10, shares: [100, 150, 200, 250, 200, 50][tier - 1] })
    );
    const breakdown = cashBreakdown(createState({ holdings }));

    expect(breakdown.tiers[6]).toEqual({
      tier: 7,
      amount: 500,
      nominalAmount: null,
      isReduced: false,
    });
  });
});
