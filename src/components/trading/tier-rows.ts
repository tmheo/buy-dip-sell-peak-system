/**
 * 보유 현황 티어 줄 (#98, #118)
 *
 * 데스크톱 표와 휴대폰 카드가 같은 정보를 보이도록 티어별 표시 값을 한 곳에서 만든다. 할당 시드
 * 아래 배지와 매도목표처럼 무엇을 보일지도 여기서 정한다 - 표와 카드는 그대로 그리기만 한다.
 * 할당 시드와 축소 여부는 계좌 상세 응답 cashBreakdown의 tiers를 그대로 쓴다 - 아직 안 산 티어가
 * 얼마를 살지, 예비 티어를 살 차례인지는 매매 규칙이 정한다(ADR-0003). 화면은 다시 따지지 않는다.
 *
 * 보유 중인 기본 티어의 할당 시드는 시드를 바꿨든 안 바꿨든 늘 비워 둔다 - 산 금액은 매수시드
 * 열에 있다. 사이클 중 시드를 바꾸면(ADR-0004) 지금 시드 × 비율은 그 티어를 산 금액이 아니다.
 *
 * 시드 감액으로 사이클을 끝내는 날(cashBreakdown.endsCycleBySeedCut, ADR-0006)에는 아무것도
 * 사지 않으므로 안 산 티어의 금액과 축소 표시를 비우고, 보유 티어에 "오늘 모두 매도"와 매도목표
 * MOC를 보인다.
 */
import type { CashBreakdown } from "@/strategy";
import { RESERVE_TIER_NUMBER, getStrategyParams } from "@/strategy";
import type { Strategy, TierHolding } from "@/types/trading";
import { formatCurrency } from "./format";

/**
 * 할당 시드 아래 배지
 * - reduced: 예수금 부족으로 비율보다 덜 사는 티어 ("예수금 부족으로 축소")
 * - sellAllToday: 시드 감액으로 사이클을 끝내는 날 MOC로 파는 보유 티어 ("오늘 모두 매도")
 */
export type TierRowBadge = "reduced" | "sellAllToday";

export interface TierRow {
  tier: number;
  holding: TierHolding | undefined;
  hasShares: boolean;
  isReserveTier: boolean;
  // 전략 비율(%). 예비 티어는 0
  ratioPercent: number;
  // 아직 안 산 티어의 할당 시드 (cashBreakdown의 티어 금액). 보유 중인 티어와, 시드 감액으로
  // 사이클을 끝내는 날의 안 산 티어는 null
  allocatedSeed: number | null;
  // 예수금 부족으로 비율보다 덜 사는 티어의 비율대로의 금액. 축소되지 않았으면 null
  reducedFrom: number | null;
  // 할당 시드 아래 배지. 없으면 null
  badge: TierRowBadge | null;
  // 매도목표: 보유 티어의 매도 지정가. 시드 감액으로 사이클을 끝내는 날의 보유 티어는 "MOC"
  sellTarget: number | "MOC" | null;
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
    const hasShares = (holding?.shares ?? 0) > 0;
    // 할당 시드를 보이는 티어: 아직 안 샀고, 오늘이 시드 감액으로 사이클을 끝내는 날이 아니다
    const canBuy = !hasShares && !cash.endsCycleBySeedCut;
    const isSellingAllToday = hasShares && cash.endsCycleBySeedCut;
    const isReducedBuy = canBuy && isReduced;
    return {
      tier,
      holding,
      hasShares,
      isReserveTier,
      ratioPercent: isReserveTier ? 0 : ratios[tier - 1] * 100,
      allocatedSeed: canBuy ? amount : null,
      reducedFrom: isReducedBuy ? nominalAmount : null,
      badge: isSellingAllToday ? "sellAllToday" : isReducedBuy ? "reduced" : null,
      sellTarget: isSellingAllToday ? "MOC" : (holding?.sellTargetPrice ?? null),
    };
  });
}

/**
 * 표 아래 축소 안내 문구.
 * 순실현손실로 예수금이 줄어 비율대로 못 사는 티어가 실제로 있을 때만 낸다 - 손실이 있어도
 * 예수금이 남은 티어의 비율대로의 금액보다 크면 덜 사는 티어가 없어 안내가 틀린 말이 된다.
 * 티어별 축소 여부는 cashBreakdown의 tiers가 정한다. 시드 감액으로 사이클을 끝내는 날에는
 * 아무것도 사지 않으므로 내지 않는다.
 *
 * 첫 번째로 살 티어는 비율대로 사고 뒤 티어만 줄 수 있어서(cashBreakdown 참고), 문구는
 * "다음에 사는 티어"가 아니라 축소 표시된 티어를 가리킨다.
 *
 * @returns 안내 문구. 안내하지 않으면 null
 */
export function reductionNotice(cash: CashBreakdown): string | null {
  if (
    cash.endsCycleBySeedCut ||
    !cash.isCashReduced ||
    !cash.tiers.some((tier) => tier.isReduced)
  ) {
    return null;
  }
  return (
    `이번 사이클 순실현손실 ${formatCurrency(cash.netRealizedLoss)}만큼 예수금이 줄어, ` +
    "축소 표시된 티어는 비율보다 적게 삽니다. 앞 티어를 비율대로 산다고 쳤을 때의 금액입니다."
  );
}
