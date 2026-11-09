/**
 * 예수금과 계좌 현금 테스트 (ADR-0003)
 *
 * 예수금 = max(0, min(사이클 자본 - Σ 활성 티어 매수금액, 계좌 현금))
 * 계좌 현금 = 사이클 자본 - Σ 활성 티어 매수금액 + 이번 사이클 실현손익
 */
import { describe, it, expect } from "vitest";
import { accountCash, availableCash, cashBreakdown, planOrders, settle } from "@/strategy";
import { nextBuyTier, tierAmount } from "../calculations";
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
        // 아직 안 산 티어는 앞 티어부터 차례로 산다고 친 금액: 티어 5가 min(2000, 1200)으로
        // 예수금을 다 쓰고, 티어 6은 남은 예수금 0
        { tier: 5, amount: 1200, nominalAmount: 2000, isReduced: true },
        { tier: 6, amount: 0, nominalAmount: 1000, isReduced: true },
        // 예비 티어는 기본 티어 1-6이 다 차기 전에는 할당이 없다
        { tier: 7, amount: 0, nominalAmount: null, isReduced: false },
      ],
    });
  });

  it("안 산 티어가 여럿이면 첫 티어는 비율대로 사고 남은 예수금으로 뒤 티어를 차례로 줄여야 한다", () => {
    // #108의 실계좌 예: 시드 $54,938.44, Pro2 비율 10/15/20/25/20/10%, 티어 1-3 보유
    // (5,493.60 + 8,212.05 + 7,682.24 = 21,387.89), 순실현손실 13,673.30
    // → 예수금 = 54,938.44 - 21,387.89 - 13,673.30 = 19,877.25
    const holdings = [
      createHolding({ tier: 1, buyPrice: 45.78, shares: 120 }),
      createHolding({ tier: 2, buyPrice: 43.45, shares: 189 }),
      createHolding({ tier: 3, buyPrice: 240.07, shares: 32 }),
    ];
    const breakdown = cashBreakdown(
      createState({ cycleCapital: 54938.44, holdings, realizedPnl: -13673.3 })
    );

    expect(breakdown.availableCash).toBe(19877.25);
    expect(breakdown.tiers.slice(3, 6)).toEqual([
      // 첫 번째로 살 티어는 오늘 주문표의 금액(tierAmount)과 같다: min(13,734.61, 19,877.25)
      { tier: 4, amount: 13734.61, nominalAmount: 13734.61, isReduced: false },
      // 남은 예수금 19,877.25 - 13,734.61 = 6,142.64
      { tier: 5, amount: 6142.64, nominalAmount: 10987.68, isReduced: true },
      // 남은 예수금 0
      { tier: 6, amount: 0, nominalAmount: 5493.84, isReduced: true },
    ]);
  });

  it("손절된 앞쪽 티어가 비어 있으면 그 티어부터 차례로 산다고 쳐야 한다", () => {
    // 티어 1은 손절되어 비고 티어 2-3 보유(1,500 + 2,000 = 3,500), 순실현손실 5,000
    // → 예수금 = min(6,500, 10,000 - 3,500 - 5,000) = 1,500
    const holdings = [
      createHolding({ tier: 2, buyPrice: 10, shares: 150 }),
      createHolding({ tier: 3, buyPrice: 10, shares: 200 }),
    ];
    const breakdown = cashBreakdown(createState({ holdings, realizedPnl: -5000 }));

    expect(breakdown.availableCash).toBe(1500);
    expect(
      breakdown.tiers.map(({ tier, amount, isReduced }) => ({ tier, amount, isReduced }))
    ).toEqual([
      // 티어 1이 비율대로 1,000을 사고, 남은 500을 티어 4가 쓴다
      { tier: 1, amount: 1000, isReduced: false },
      { tier: 2, amount: 1500, isReduced: false },
      { tier: 3, amount: 2000, isReduced: false },
      { tier: 4, amount: 500, isReduced: true },
      { tier: 5, amount: 0, isReduced: true },
      { tier: 6, amount: 0, isReduced: true },
      { tier: 7, amount: 0, isReduced: false },
    ]);
  });

  it.each([
    {
      name: "티어 1-4 보유, 순실현손실 1,800",
      state: createState({
        holdings: [
          createHolding({ tier: 1, buyPrice: 10, shares: 100 }),
          createHolding({ tier: 2, buyPrice: 10, shares: 150 }),
          createHolding({ tier: 3, buyPrice: 10, shares: 200 }),
          createHolding({ tier: 4, buyPrice: 10, shares: 250 }),
        ],
        realizedPnl: -1800,
      }),
    },
    {
      name: "#108의 실계좌 예",
      state: createState({
        cycleCapital: 54938.44,
        holdings: [
          createHolding({ tier: 1, buyPrice: 45.78, shares: 120 }),
          createHolding({ tier: 2, buyPrice: 43.45, shares: 189 }),
          createHolding({ tier: 3, buyPrice: 240.07, shares: 32 }),
        ],
        realizedPnl: -13673.3,
      }),
    },
    {
      name: "손절된 티어 1이 비고 티어 2-6 보유, 순실현손실 300",
      state: createState({
        holdings: [
          createHolding({ tier: 2, buyPrice: 10, shares: 150 }),
          createHolding({ tier: 3, buyPrice: 10, shares: 200 }),
          createHolding({ tier: 4, buyPrice: 10, shares: 250 }),
          createHolding({ tier: 5, buyPrice: 10, shares: 200 }),
          createHolding({ tier: 6, buyPrice: 10, shares: 100 }),
        ],
        realizedPnl: -300,
      }),
    },
  ])("첫 번째로 살 티어의 금액은 오늘 주문표의 티어 금액과 같아야 한다 ($name)", ({ state }) => {
    const firstTier = nextBuyTier(state);
    if (firstTier === null) throw new Error("살 티어가 없는 상태");

    const firstTierCash = cashBreakdown(state).tiers.find((t) => t.tier === firstTier);

    expect(firstTierCash?.amount).toBe(tierAmount(state, firstTier));
  });

  it("손실이 없으면 티어를 보유 중이어도 안 산 티어가 모두 비율대로의 금액이어야 한다", () => {
    // 티어 1-2 보유(1,000 + 1,500), 실현손익 0 → 예수금 7,500 = 티어 3-6 비율대로의 합
    const holdings = [
      createHolding({ tier: 1, buyPrice: 10, shares: 100 }),
      createHolding({ tier: 2, buyPrice: 10, shares: 150 }),
    ];
    const breakdown = cashBreakdown(createState({ holdings }));

    expect(breakdown.availableCash).toBe(7500);
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

  it("예비 티어를 보유 중이면 할당 시드를 알 수 없어 null이어야 한다", () => {
    // 예비 티어는 매수 당시의 예수금 전액을 썼다. 그 금액은 저장되지 않고, 지금 남은
    // 예수금(매수 뒤 잔액)은 할당 시드가 아니다.
    const holdings = [1, 2, 3, 4, 5, 6, 7].map((tier) =>
      createHolding({ tier, buyPrice: 10, shares: [100, 150, 200, 250, 200, 50, 40][tier - 1] })
    );
    const breakdown = cashBreakdown(createState({ holdings }));

    expect(breakdown.tiers[6]).toEqual({
      tier: 7,
      amount: null,
      nominalAmount: null,
      isReduced: false,
    });
  });
});
