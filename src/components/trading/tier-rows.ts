/**
 * 보유 현황 티어 줄 (#98)
 *
 * 데스크톱 표와 휴대폰 카드가 같은 정보를 보이도록 티어별 표시 값을 한 곳에서 만든다.
 * 아직 안 산 기본 티어의 할당 시드는 실제로 살 금액(계좌 상세 응답 cashBreakdown의 baseTiers)이다.
 * 그 금액은 매매 규칙이 정한다(ADR-0003: 예수금이 모자라면 그다음에 사는 티어가 덜 산다) -
 * 화면은 그 값을 그대로 쓰고 다시 계산하지 않는다.
 */
import type { CashBreakdown } from "@/strategy";
import {
  BASE_TIER_COUNT,
  MAX_TIER_NUMBER,
  RESERVE_TIER_NUMBER,
  getStrategyParams,
} from "@/strategy";
import type { Strategy, TierHolding } from "@/types/trading";

export interface TierRow {
  tier: number;
  holding: TierHolding | undefined;
  hasShares: boolean;
  isReserveTier: boolean;
  // 전략 비율(%). 예비 티어는 0
  ratioPercent: number;
  // 할당 시드: 보유 중이면 시드 × 비율, 아직 안 샀으면 실제로 살 금액
  allocatedSeed: number;
  // 예수금 부족으로 비율보다 덜 사는 티어의 비율대로의 금액. 축소되지 않았으면 null
  reducedFrom: number | null;
}

export function buildTierRows(
  holdings: TierHolding[],
  seedCapital: number,
  strategy: Strategy,
  cash: CashBreakdown
): TierRow[] {
  // 티어 비율은 src/strategy의 전략 파라미터 표가 단일 소유한다 (#43)
  const ratios = getStrategyParams(strategy).tierRatios;
  const holdingsByTier = new Map(holdings.map((h) => [h.tier, h]));
  const unboughtByTier = new Map(cash.baseTiers.map((t) => [t.tier, t]));
  const isHeld = (tier: number): boolean => (holdingsByTier.get(tier)?.shares ?? 0) > 0;

  // 예비 티어는 기본 티어 1-6이 모두 매수된 뒤에만 산다
  const allBaseTiersFilled = Array.from({ length: BASE_TIER_COUNT }, (_, i) => i + 1).every(isHeld);

  return Array.from({ length: MAX_TIER_NUMBER }, (_, i) => {
    const tier = i + 1;
    const holding = holdingsByTier.get(tier);
    const hasShares = isHeld(tier);
    const isReserveTier = tier === RESERVE_TIER_NUMBER;

    if (isReserveTier) {
      return {
        tier,
        holding,
        hasShares,
        isReserveTier,
        ratioPercent: 0,
        allocatedSeed: allBaseTiersFilled ? (cash.reserveTierAmount ?? cash.availableCash) : 0,
        reducedFrom: null,
      };
    }

    const unbought = hasShares ? undefined : unboughtByTier.get(tier);
    return {
      tier,
      holding,
      hasShares,
      isReserveTier,
      ratioPercent: ratios[tier - 1] * 100,
      allocatedSeed: unbought ? unbought.amount : seedCapital * ratios[tier - 1],
      reducedFrom:
        unbought && unbought.amount < unbought.nominalAmount ? unbought.nominalAmount : null,
    };
  });
}
