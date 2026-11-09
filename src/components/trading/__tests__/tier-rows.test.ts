/**
 * 보유 현황 티어 줄 테스트 (#98)
 *
 * 아직 안 산 티어의 할당 시드는 실제로 살 금액(계좌 상세 응답 cashBreakdown의 baseTiers)이고,
 * 비율대로 못 사는 티어에는 "예수금 부족으로 축소"를 붙인다.
 * 예비 티어는 기본 티어 1-6이 다 찼을 때 예수금 전액이다.
 *
 * 기준 시나리오 (Pro2, 시드 $10,000, 비율 10/15/20/25/20/10%):
 * 티어 1-5 보유, 이번 사이클 순실현손실 $400 → 예수금 $600, 티어 6은 $1,000 대신 $600
 */
import { describe, it, expect } from "vitest";
import { buildTierRows } from "../tier-rows";
import type { CashBreakdown } from "@/strategy";
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

describe("buildTierRows", () => {
  it("예수금 때문에 비율대로 못 사는 티어는 실제 금액과 축소 표시를 보인다", () => {
    const cash: CashBreakdown = {
      availableCash: 600,
      accountCash: 600,
      netRealizedLoss: 400,
      baseTiers: [{ tier: 6, amount: 600, nominalAmount: 1_000 }],
      reserveTierAmount: 600,
    };

    const rows = buildTierRows([...TIERS_1_TO_5, holding(6, 0)], 10_000, "Pro2", cash);

    const tier6 = rows.find((row) => row.tier === 6);
    expect(tier6?.allocatedSeed).toBe(600);
    expect(tier6?.reducedFrom).toBe(1_000);
  });

  it("비율대로 살 수 있는 티어는 축소 표시가 없다", () => {
    const cash: CashBreakdown = {
      availableCash: 7_500,
      accountCash: 7_500,
      netRealizedLoss: 0,
      baseTiers: [
        { tier: 3, amount: 2_000, nominalAmount: 2_000 },
        { tier: 4, amount: 2_500, nominalAmount: 2_500 },
      ],
      reserveTierAmount: 7_500,
    };

    const rows = buildTierRows([holding(1, 10), holding(2, 15)], 10_000, "Pro2", cash);

    expect(rows.find((row) => row.tier === 3)).toMatchObject({
      allocatedSeed: 2_000,
      reducedFrom: null,
    });
    expect(rows.find((row) => row.tier === 4)).toMatchObject({
      allocatedSeed: 2_500,
      reducedFrom: null,
    });
  });

  it("보유 중인 티어의 할당 시드는 시드 × 비율이다", () => {
    const cash: CashBreakdown = {
      availableCash: 600,
      accountCash: 600,
      netRealizedLoss: 400,
      baseTiers: [{ tier: 6, amount: 600, nominalAmount: 1_000 }],
      reserveTierAmount: 600,
    };

    const rows = buildTierRows(TIERS_1_TO_5, 10_000, "Pro2", cash);

    expect(rows.find((row) => row.tier === 4)).toMatchObject({
      allocatedSeed: 2_500,
      reducedFrom: null,
      hasShares: true,
    });
  });

  it("예비 티어는 기본 티어가 다 찼을 때만 예수금 전액을 할당한다", () => {
    const partial: CashBreakdown = {
      availableCash: 600,
      accountCash: 600,
      netRealizedLoss: 400,
      baseTiers: [{ tier: 6, amount: 600, nominalAmount: 1_000 }],
      reserveTierAmount: 600,
    };
    // 티어 6을 $100 × 5주로 산 뒤: 예수금 = 10,000 - 9,500 - 400 = $100
    const full: CashBreakdown = {
      ...partial,
      availableCash: 100,
      accountCash: 100,
      baseTiers: [],
      reserveTierAmount: 100,
    };

    const before = buildTierRows(TIERS_1_TO_5, 10_000, "Pro2", partial);
    const after = buildTierRows([...TIERS_1_TO_5, holding(6, 5)], 10_000, "Pro2", full);

    expect(before.find((row) => row.tier === 7)).toMatchObject({
      allocatedSeed: 0,
      isReserveTier: true,
    });
    expect(after.find((row) => row.tier === 7)).toMatchObject({
      allocatedSeed: 100,
      reducedFrom: null,
    });
  });
});
