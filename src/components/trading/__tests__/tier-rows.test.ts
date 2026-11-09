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
import { buildTierRows } from "../tier-rows";
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

  it("티어 1-7을 순서대로 한 줄씩 낸다", () => {
    const rows = buildTierRows(TIERS_1_TO_5, "Pro2", reducedCash());

    expect(rows.map((row) => row.tier)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
