/**
 * 보유 현황 티어 줄 (#98)
 *
 * 데스크톱 표와 휴대폰 카드가 같은 정보를 보이도록 티어별 표시 값을 한 곳에서 만든다.
 * 할당 시드와 축소 여부는 계좌 상세 응답 cashBreakdown의 tiers를 그대로 쓴다 - 아직 안 산 티어가
 * 얼마를 살지, 예비 티어를 살 차례인지는 매매 규칙이 정한다(ADR-0003). 화면은 다시 따지지 않는다.
 */
import type { CashBreakdown } from "@/strategy";
import { RESERVE_TIER_NUMBER, getStrategyParams } from "@/strategy";
import type { Strategy, TierHolding } from "@/types/trading";

export interface TierRow {
  tier: number;
  holding: TierHolding | undefined;
  hasShares: boolean;
  isReserveTier: boolean;
  // 전략 비율(%). 예비 티어는 0
  ratioPercent: number;
  // 할당 시드 (cashBreakdown의 티어 금액)
  allocatedSeed: number;
  // 예수금 부족으로 비율보다 덜 사는 티어의 비율대로의 금액. 축소되지 않았으면 null
  reducedFrom: number | null;
}

export function buildTierRows(
  holdings: TierHolding[],
  strategy: Strategy,
  cash: CashBreakdown
): TierRow[] {
  // 티어 비율은 src/strategy의 전략 파라미터 표가 단일 소유한다 (#43)
  const ratios = getStrategyParams(strategy).tierRatios;
  const holdingsByTier = new Map(holdings.map((h) => [h.tier, h]));

  return cash.tiers.map(({ tier, amount, nominalAmount, isReduced }) => {
    const holding = holdingsByTier.get(tier);
    const isReserveTier = tier === RESERVE_TIER_NUMBER;
    return {
      tier,
      holding,
      hasShares: (holding?.shares ?? 0) > 0,
      isReserveTier,
      ratioPercent: isReserveTier ? 0 : ratios[tier - 1] * 100,
      allocatedSeed: amount,
      reducedFrom: isReduced ? nominalAmount : null,
    };
  });
}
