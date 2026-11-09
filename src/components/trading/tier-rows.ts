/**
 * 보유 현황 티어 줄 (#98)
 *
 * 데스크톱 표와 휴대폰 카드가 같은 정보를 보이도록 티어별 표시 값을 한 곳에서 만든다.
 * 할당 시드와 축소 여부는 계좌 상세 응답 cashBreakdown의 tiers를 그대로 쓴다 - 아직 안 산 티어가
 * 얼마를 살지(앞 티어부터 차례로 산다고 쳤을 때의 금액, #108), 예비 티어를 살 차례인지는 매매 규칙이
 * 정한다(ADR-0003). 화면은 다시 따지지 않는다.
 */
import type { CashBreakdown } from "@/strategy";
import { RESERVE_TIER_NUMBER, getStrategyParams } from "@/strategy";
import type { Strategy, TierHolding } from "@/types/trading";
import { formatCurrency } from "./format";

export interface TierRow {
  tier: number;
  holding: TierHolding | undefined;
  hasShares: boolean;
  isReserveTier: boolean;
  // 전략 비율(%). 예비 티어는 0
  ratioPercent: number;
  // 할당 시드 (cashBreakdown의 티어 금액). 보유 중인 예비 티어처럼 알 수 없으면 null
  allocatedSeed: number | null;
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

/**
 * 표 아래 축소 안내 문구.
 * 순실현손실로 예수금이 줄어 비율대로 못 사는 티어가 실제로 있을 때만 낸다 - 손실이 있어도
 * 예수금이 남은 티어의 비율대로의 금액보다 크면 덜 사는 티어가 없어 안내가 틀린 말이 된다.
 * 티어별 축소 여부는 cashBreakdown의 tiers가 정한다.
 *
 * 안 산 티어의 금액은 앞 티어부터 차례로 산다고 쳤을 때의 금액이라(#108), 첫 번째로 살 티어는
 * 비율대로 사고 뒤 티어만 줄 수 있다. 그래서 "다음에 사는 티어"가 아니라 축소 표시된 티어를 가리킨다.
 *
 * @returns 안내 문구. 안내하지 않으면 null
 */
export function reductionNotice(cash: CashBreakdown): string | null {
  if (!cash.isCashReduced || !cash.tiers.some((tier) => tier.isReduced)) {
    return null;
  }
  return (
    `이번 사이클 순실현손실 ${formatCurrency(cash.netRealizedLoss)}만큼 예수금이 줄어, ` +
    "축소 표시된 티어는 비율보다 적게 삽니다. 앞 티어를 비율대로 산다고 쳤을 때의 금액입니다."
  );
}
