/**
 * 보유 현황 티어 줄 테스트 (#98)
 *
 * 티어별 할당 시드와 축소 여부는 계좌 상세 응답 cashBreakdown의 tiers가 정한다 - 화면은
 * 그 값을 티어 줄에 옮기기만 하고, 예비 티어를 살 차례인지 같은 규칙을 다시 따지지 않는다.
 *
 * 기준 시나리오 (Pro2, 시드 $10,000, 비율 10/15/20/25/20/10%):
 * 티어 1-5 보유, 이번 사이클 순실현손실 $400 → 예수금 $600, 티어 6은 $1,000 대신 $600
 */
import { describe, it, expect } from "vitest";
import { buildTierRows, reductionNotice } from "../tier-rows";
import type { CashBreakdown, TierCash } from "@/strategy";
import type { TierHolding } from "@/types/trading";

function holding(tier: number, shares: number): TierHolding {
  return {
    id: `h${tier}`,
    accountId: "a",
    tier,
    buyPrice: shares > 0 ? 100 : null,
    shares,
    buyDate: shares > 0 ? "2026-04-01" : null,
    sellTargetPrice: null,
    createdAt: "",
    updatedAt: "",
  };
}

const TIERS_1_TO_5 = [
  holding(1, 10),
  holding(2, 15),
  holding(3, 20),
  holding(4, 25),
  holding(5, 20),
];

/** Pro2 시드 $10,000의 비율대로의 금액 (티어 1-6) */
const NOMINAL = [1_000, 1_500, 2_000, 2_500, 2_000, 1_000];

/** 티어 1-7의 할당 시드. overrides로 티어별 값을 바꾼다 */
function tiers(overrides: Partial<Record<number, Partial<TierCash>>> = {}): TierCash[] {
  return [1, 2, 3, 4, 5, 6, 7].map((tier) => ({
    tier,
    amount: tier === 7 ? 0 : NOMINAL[tier - 1],
    nominalAmount: tier === 7 ? null : NOMINAL[tier - 1],
    isReduced: false,
    ...overrides[tier],
  }));
}

/** 기준 시나리오의 현금 내역: 티어 1-5 보유(투자 중 $9,000), 순실현손실 $400 → 예수금 $600 */
function reducedCash(overrides: Partial<CashBreakdown> = {}): CashBreakdown {
  return {
    availableCash: 600,
    accountCash: 600,
    cycleCapital: 10_000,
    investedAmount: 9_000,
    netRealizedLoss: 400,
    isCashReduced: true,
    tiers: tiers({ 6: { amount: 600, isReduced: true } }),
    ...overrides,
  };
}

describe("buildTierRows", () => {
  it("예수금 때문에 비율대로 못 사는 티어는 실제 금액과 축소 표시를 보인다", () => {
    const rows = buildTierRows([...TIERS_1_TO_5, holding(6, 0)], "Pro2", reducedCash());

    expect(rows.find((row) => row.tier === 6)).toMatchObject({
      allocatedSeed: 600,
      reducedFrom: 1_000,
      hasShares: false,
    });
  });

  it("비율대로 살 수 있는 티어는 축소 표시가 없다", () => {
    const rows = buildTierRows([...TIERS_1_TO_5, holding(6, 0)], "Pro2", reducedCash());

    expect(rows.find((row) => row.tier === 4)).toMatchObject({
      allocatedSeed: 2_500,
      reducedFrom: null,
      hasShares: true,
      ratioPercent: 25,
    });
  });

  it("예비 티어의 할당 시드는 응답이 정한 금액을 그대로 쓰고 비율은 0이다", () => {
    const full = reducedCash({
      availableCash: 100,
      accountCash: 100,
      tiers: tiers({ 7: { amount: 100 } }),
    });

    const rows = buildTierRows([...TIERS_1_TO_5, holding(6, 5)], "Pro2", full);

    expect(rows.find((row) => row.tier === 7)).toMatchObject({
      allocatedSeed: 100,
      reducedFrom: null,
      isReserveTier: true,
      ratioPercent: 0,
    });
  });

  it("보유 중인 예비 티어처럼 할당 시드를 알 수 없으면 null을 그대로 옮긴다", () => {
    const full = reducedCash({ tiers: tiers({ 7: { amount: null } }) });

    const rows = buildTierRows([...TIERS_1_TO_5, holding(6, 5), holding(7, 3)], "Pro2", full);

    expect(rows.find((row) => row.tier === 7)?.allocatedSeed).toBeNull();
  });

  it("티어 1-7을 순서대로 한 줄씩 낸다", () => {
    const rows = buildTierRows(TIERS_1_TO_5, "Pro2", reducedCash());

    expect(rows.map((row) => row.tier)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("reductionNotice - 표 아래 축소 안내", () => {
  it("순실현손실로 비율보다 덜 사는 티어가 있으면 손실 금액과 함께 안내한다", () => {
    expect(reductionNotice(reducedCash())).toBe(
      "이번 사이클 순실현손실 $400.00만큼 예수금이 줄어, 축소 표시된 티어는 비율보다 적게 삽니다. " +
        "앞 티어를 비율대로 산다고 쳤을 때의 금액입니다."
    );
  });

  it("첫 번째로 살 티어는 비율대로 사고 뒤 티어만 줄어도 안내한다 (#108)", () => {
    // 티어 1-3 보유(투자 중 $4,500), 순실현손실 $3,000 → 예수금 $2,500.
    // 티어 4가 비율대로 $2,500을 사고 나면 티어 5, 6은 남은 예수금이 없다.
    const laterReduced = reducedCash({
      availableCash: 2_500,
      accountCash: 2_500,
      investedAmount: 4_500,
      netRealizedLoss: 3_000,
      tiers: tiers({
        5: { amount: 0, isReduced: true },
        6: { amount: 0, isReduced: true },
      }),
    });

    expect(reductionNotice(laterReduced)).toContain("순실현손실 $3,000.00만큼");
  });

  it("순실현손실이 있어도 모든 티어가 비율대로 사면 안내하지 않는다", () => {
    // 손실 $400이 있어도 예수금이 남은 티어의 비율대로의 금액보다 크면 덜 사지 않는다
    const enough = reducedCash({
      availableCash: 1_100,
      accountCash: 1_100,
      investedAmount: 8_500,
      tiers: tiers({ 6: { amount: 1_000, isReduced: false } }),
    });

    expect(reductionNotice(enough)).toBeNull();
  });

  it("예수금이 줄지 않았으면 안내하지 않는다", () => {
    const notReduced = reducedCash({ netRealizedLoss: 0, isCashReduced: false });

    expect(reductionNotice(notReduced)).toBeNull();
  });
});
