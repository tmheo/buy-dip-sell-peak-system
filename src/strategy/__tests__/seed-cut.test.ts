/**
 * 사이클을 끝내는 시드 감액 테스트 (ADR-0004, ADR-0006, #117)
 *
 * 실계좌의 사이클 자본은 그날의 시드라, 사이클 중 시드를 줄이면 적용일의 사이클 자본이 준다.
 * 사이클 상태의 capitalCut은 그 거래일에 줄어든 사이클 자본(직전 거래일의 시드 - 그날 시드)이다.
 * capitalCut > 0이고 0으로 자르기 전의 예수금 min(U, U + P)가 0보다 작으면
 * (U = 사이클 자본 - Σ 활성 티어 매수금액, P = 이번 사이클 실현손익),
 * 그날 주문표는 매수 없이 보유 티어를 모두 MOC로 판다.
 * 이는 "감액이 직전 거래일까지 마감된 예수금보다 크다"와 같은 판정이다.
 *
 * 공통 상태: Pro2, 티어 1-5 보유(매수가 $100) - 매수금액 합 = 1,000 + 1,500 + 2,000 + 2,500 + 2,000 = 9,000.
 * 옛 시드 $10,000이면 직전 거래일까지 마감된 예수금 = 10,000 - 9,000 = $1,000.
 */
import { describe, it, expect } from "vitest";
import {
  cashBreakdown,
  classifySeedChange,
  endsCycleBySeedCut,
  isCycleInProgress,
  mayEndCycle,
  needsSeedChangeConfirmation,
  planOrdersDetailed,
  seedCutLimits,
} from "@/strategy";
import { createHolding, createState } from "./fixtures";

const TIERS_1_TO_5 = [1, 2, 3, 4, 5].map((tier, i) =>
  createHolding({ tier, buyPrice: 100, shares: [10, 15, 20, 25, 20][i] })
);

const mocSell = (tier: number, shares: number) => ({
  type: "SELL",
  tier,
  orderMethod: "MOC",
  limitPrice: null,
  shares,
});

/** 옛 시드 $10,000에서 newSeed로 줄인 적용일의 사이클 상태 */
function effectiveDayState(newSeed: number, realizedPnl = 0) {
  return createState({
    cycleCapital: newSeed,
    capitalCut: 10_000 - newSeed,
    holdings: TIERS_1_TO_5,
    realizedPnl,
  });
}

describe("planOrdersDetailed - 예수금보다 큰 감액의 적용일", () => {
  it("매수 없이 보유 티어를 모두 MOC로 팔고 사이클을 끝낸다고 알려야 한다", () => {
    // 감액 $1,500 > 예수금 $1,000: U = 8,500 - 9,000 = -500 < 0
    const plan = planOrdersDetailed(effectiveDayState(8_500), 100);

    expect(plan.intents).toEqual([
      mocSell(1, 10),
      mocSell(2, 15),
      mocSell(3, 20),
      mocSell(4, 25),
      mocSell(5, 20),
    ]);
    expect(plan.endsCycleBySeedCut).toBe(true);
    expect(plan.unaffordableBuy).toBeNull();
    expect(plan.reducedBuy).toBeNull();
  });

  it("감액이 예수금과 같으면 예수금이 0으로 남고 사이클이 이어져야 한다", () => {
    // 감액 $1,000 = 예수금 $1,000: U = 9,000 - 9,000 = 0. 티어 6은 예수금이 없어 사지 않는다
    const plan = planOrdersDetailed(effectiveDayState(9_000), 100);

    expect(plan.endsCycleBySeedCut).toBe(false);
    expect(plan.intents.map((o) => o.orderMethod)).toEqual(["LOC", "LOC", "LOC", "LOC", "LOC"]);
    expect(plan.unaffordableBuy).toEqual({ tier: 6, availableCash: 0 });
  });

  it("직전 거래일의 예수금이 0인 계좌에서는 어떤 감액도 사이클을 끝내야 한다", () => {
    // 옛 시드 $10,000에서 순실현손실 $1,000으로 예수금이 0인 계좌를 $0.01 줄인다:
    // min(U, U + P) = min(999.99, -0.01) < 0
    const state = createState({
      cycleCapital: 9_999.99,
      capitalCut: 0.01,
      holdings: TIERS_1_TO_5,
      realizedPnl: -1_000,
    });

    const plan = planOrdersDetailed(state, 100);

    expect(plan.endsCycleBySeedCut).toBe(true);
    expect(plan.intents.every((o) => o.orderMethod === "MOC")).toBe(true);
  });

  it("순실현손실이 있는 사이클은 손실을 뺀 예수금보다 큰 감액에서 끝나야 한다", () => {
    // 순실현손실 $300: 직전 예수금 = min(1,000, 700) = $700
    // $701 감액: min(299, -1) < 0 → 끝난다 / $700 감액: min(300, 0) = 0 → 이어진다
    expect(planOrdersDetailed(effectiveDayState(9_299, -300), 100).endsCycleBySeedCut).toBe(true);
    expect(planOrdersDetailed(effectiveDayState(9_300, -300), 100).endsCycleBySeedCut).toBe(false);
  });

  it("증액한 날은 평소 주문표를 내야 한다", () => {
    // 시드 $10,000 → $12,000: 예수금 3,000으로 티어 6을 비율대로 $1,200(지정가 99.99로 12주)
    const state = createState({ cycleCapital: 12_000, capitalCut: 0, holdings: TIERS_1_TO_5 });

    const plan = planOrdersDetailed(state, 100);

    expect(plan.endsCycleBySeedCut).toBe(false);
    expect(plan.intents[0]).toEqual({
      type: "BUY",
      tier: 6,
      orderMethod: "LOC",
      limitPrice: 99.99,
      shares: 12,
    });
  });

  it("사이클 자본이 줄지 않은 날은 계좌 현금이 음수인 옛 상태에서도 모두 팔지 않아야 한다", () => {
    // 옛 규칙으로 계좌 현금보다 큰 매수가 이미 체결된 상태: 계좌 현금 = 10,000 - 9,000 - 1,500 = -500
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -1_500 });

    const plan = planOrdersDetailed(state, 100);

    expect(plan.endsCycleBySeedCut).toBe(false);
    expect(plan.intents.map((o) => o.orderMethod)).toEqual(["LOC", "LOC", "LOC", "LOC", "LOC"]);
  });

  it("그날 손절일에 걸린 티어가 있어도 매도는 보유 티어별 MOC 한 건씩이어야 한다", () => {
    const holdings = TIERS_1_TO_5.map((h) => (h.tier === 1 ? { ...h, holdingDays: 9 } : h));
    const state = createState({ cycleCapital: 8_500, capitalCut: 1_500, holdings });

    expect(planOrdersDetailed(state, 100).intents).toHaveLength(5);
  });
});

describe("endsCycleBySeedCut", () => {
  it("주문표와 같은 판정을 사이클 상태 하나로 내야 한다", () => {
    expect(endsCycleBySeedCut(effectiveDayState(8_500))).toBe(true);
    expect(endsCycleBySeedCut(effectiveDayState(9_000))).toBe(false);
  });

  it("팔 보유 티어가 없으면 끝낼 사이클도 없다", () => {
    expect(endsCycleBySeedCut(createState({ cycleCapital: 8_500, capitalCut: 1_500 }))).toBe(false);
  });
});

describe("seedCutLimits - 오늘 시드를 줄일 때의 감액 경계", () => {
  it("직전 마감 예수금과 오늘 매수가 지정가대로 체결된다고 쳤을 때의 예수금을 내야 한다", () => {
    // 시드 $10,000, 티어 1-5 보유: 직전 마감 예수금 $1,000.
    // 오늘 주문표: 티어 6을 지정가 99.99(직전 종가 100의 -0.01%)로 10주 = $999.90
    const state = createState({ holdings: TIERS_1_TO_5 });

    expect(seedCutLimits(state, 100)).toEqual({ closedCash: 1_000, cashIfTodayBuyFills: 0.1 });
  });

  it("오늘 매수가 없으면 두 경계가 같아야 한다", () => {
    // 순실현손실 $950으로 예수금 $50 < 지정가 99.99: 티어 6을 1주도 살 수 없다
    const state = createState({ holdings: TIERS_1_TO_5, realizedPnl: -950 });

    expect(seedCutLimits(state, 100)).toEqual({ closedCash: 50, cashIfTodayBuyFills: 50 });
  });

  it("직전 종가가 없어 오늘 주문표를 만들 수 없으면 두 경계가 같아야 한다", () => {
    const state = createState({ holdings: TIERS_1_TO_5 });

    expect(seedCutLimits(state, null)).toEqual({ closedCash: 1_000, cashIfTodayBuyFills: 1_000 });
  });

  it("당일 매도는 예수금을 줄이지 않으므로 매수만 빼야 한다", () => {
    // 티어 1만 보유($1,000): 직전 마감 예수금 $9,000. 티어 1 LOC 매도도 나가지만 빼지 않는다.
    // 티어 2를 지정가 99.99로 floor(1,500 ÷ 99.99) = 15주 = $1,499.85
    const state = createState({ holdings: [TIERS_1_TO_5[0]] });

    expect(seedCutLimits(state, 100)).toEqual({ closedCash: 9_000, cashIfTodayBuyFills: 7_500.15 });
  });

  it("오늘이 시드 감액으로 사이클을 끝내는 날이면 두 경계가 모두 0이어야 한다", () => {
    expect(seedCutLimits(effectiveDayState(8_500), 100)).toEqual({
      closedCash: 0,
      cashIfTodayBuyFills: 0,
    });
  });
});

describe("classifySeedChange - 시드 변경의 분류", () => {
  // 직전 마감 예수금 $1,000, 오늘 매수가 체결되면 $0.10
  const limits = { closedCash: 1_000, cashIfTodayBuyFills: 0.1 };

  it.each([
    ["늘리면 increase", 12_000, "increase"],
    ["지금 시드와 같으면 keep", 10_000, "keep"],
    ["오늘 매수가 체결돼도 남는 예수금 이내로 줄이면 keep", 9_999.9, "keep"],
    ["오늘 매수가 체결돼야만 넘는 감액은 depends", 9_999.89, "depends"],
    ["직전 마감 예수금과 같은 감액은 depends", 9_000, "depends"],
    ["직전 마감 예수금보다 큰 감액은 ends", 8_999.99, "ends"],
  ])("%s", (_label, newSeed, kind) => {
    expect(classifySeedChange(10_000, newSeed, limits)).toBe(kind);
  });

  it("오늘 매수가 없는 날은 depends가 나오지 않아야 한다", () => {
    const sameLimits = { closedCash: 1_000, cashIfTodayBuyFills: 1_000 };

    expect(classifySeedChange(10_000, 9_000, sameLimits)).toBe("keep");
    expect(classifySeedChange(10_000, 8_999.99, sameLimits)).toBe("ends");
  });

  it("예수금이 0이면 어떤 감액도 ends여야 한다", () => {
    const zero = { closedCash: 0, cashIfTodayBuyFills: 0 };

    expect(classifySeedChange(10_000, 9_999.99, zero)).toBe("ends");
  });
});

describe("mayEndCycle - 사이클을 끝낼 수 있어 확인을 받는 분류", () => {
  it.each([
    ["increase", false],
    ["keep", false],
    ["depends", true],
    ["ends", true],
  ] as const)("%s는 %s", (kind, expected) => {
    expect(mayEndCycle(kind)).toBe(expected);
  });
});

describe("needsSeedChangeConfirmation - 저장하기 전에 다시 확인받아야 하는지", () => {
  // 사이클을 끝낼 가능성은 이어감 < 오늘 매수에 달림 < 사이클 끝 순서로 커진다.
  // 사용자가 확인한 것보다 더 끝날 수 있는 분류가 되면 다시 묻고, 덜 끝나는 분류가 되면 저장한다
  it.each([
    ["increase", null, false],
    ["keep", null, false],
    ["depends", null, true],
    ["ends", null, true],
    ["increase", "depends", false],
    ["keep", "depends", false],
    ["depends", "depends", false],
    ["ends", "depends", true],
    ["keep", "ends", false],
    ["depends", "ends", false],
    ["ends", "ends", false],
  ] as const)("서버의 분류가 %s이고 확인한 분류가 %s이면 %s", (kind, confirmed, expected) => {
    expect(needsSeedChangeConfirmation(kind, confirmed)).toBe(expected);
  });
});

describe("isCycleInProgress - 사이클 중인지", () => {
  it("보유 티어가 있으면 사이클 중이고, 없으면 사이클 사이다", () => {
    expect(isCycleInProgress(createState({ holdings: TIERS_1_TO_5 }))).toBe(true);
    expect(isCycleInProgress(createState({ holdings: [] }))).toBe(false);
  });
});

describe("cashBreakdown - 시드 감액으로 사이클을 끝내는 날", () => {
  it("시드 감액으로 사이클을 끝내는 날이면 그날의 감액분을 아직 출금하지 않은 돈으로 내야 한다", () => {
    // 이날 계좌 현금은 8,500 - 9,000 = -500으로 계산된다. 화면은 총자산을
    // 계좌 현금 + 감액분 + 평가금으로 보인다
    const breakdown = cashBreakdown(effectiveDayState(8_500));

    expect(breakdown.endsCycleBySeedCut).toBe(true);
    expect(breakdown.unwithdrawnCut).toBe(1_500);
    expect(breakdown.accountCash).toBe(-500);
    expect(breakdown.availableCash).toBe(0);
  });

  it("예수금 이내 감액의 적용일은 시드 감액으로 사이클을 끝내는 날이 아니고 감액분도 0이어야 한다", () => {
    const breakdown = cashBreakdown(effectiveDayState(9_000));

    expect(breakdown.endsCycleBySeedCut).toBe(false);
    expect(breakdown.unwithdrawnCut).toBe(0);
  });

  it("사이클 자본이 줄지 않은 날은 시드 감액으로 사이클을 끝내는 날이 아니어야 한다", () => {
    const breakdown = cashBreakdown(createState({ holdings: TIERS_1_TO_5 }));

    expect(breakdown.endsCycleBySeedCut).toBe(false);
    expect(breakdown.unwithdrawnCut).toBe(0);
  });
});
