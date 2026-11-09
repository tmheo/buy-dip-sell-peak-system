/**
 * 떨사오팔 매매 규칙의 계산 원시 함수
 * utils/trading-core.ts에서 이동 (#45).
 *
 * 모든 금융 계산은 decimal.js를 사용하여 부동소수점 오차를 방지한다.
 * 입력 가격은 분할·배당 조정된 연속 시계열(adjClose)이어야 한다.
 */
import Decimal from "decimal.js";
import { floorToDecimal } from "@/utils/decimal";
import type { CashBreakdown, CycleState, TierCash, TierHolding } from "./types";
import { BASE_TIER_COUNT, MIN_TIER_NUMBER, RESERVE_TIER_NUMBER } from "./types";

// =====================================================
// 가격 계산 함수
// =====================================================

/**
 * 지정가 공통 계산: floor(기준가 × (1 + threshold), 소수점 2자리)
 */
function applyThreshold(basePrice: number, threshold: number): number {
  const price = new Decimal(basePrice).mul(new Decimal(1).add(threshold));
  return price.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * LOC 매수 지정가 계산
 * 매수 지정가 = floor(전일 종가 × (1 + buyThreshold), 소수점 2자리)
 *
 * @param prevClose - 전일 종가 (adjClose)
 * @param threshold - 매수 임계값 (소수, 예: -0.0001 = -0.01%)
 * @returns 매수 지정가
 */
export function calculateBuyLimitPrice(prevClose: number, threshold: number): number {
  return applyThreshold(prevClose, threshold);
}

/**
 * LOC 매도 지정가 계산
 * 매도 지정가 = floor(매수 체결가 × (1 + sellThreshold), 소수점 2자리)
 *
 * @param buyPrice - 매수 체결가
 * @param threshold - 매도 임계값 (소수, 예: 0.015 = +1.5%)
 * @returns 매도 지정가
 */
export function calculateSellLimitPrice(buyPrice: number, threshold: number): number {
  return applyThreshold(buyPrice, threshold);
}

/**
 * 매수 수량 계산
 * 매수 수량 = floor(티어 금액 ÷ 매수 지정가, 정수)
 *
 * @param amount - 티어 금액
 * @param limitPrice - 매수 지정가
 * @returns 매수 수량 (정수)
 */
export function calculateBuyQuantity(amount: number, limitPrice: number): number {
  if (limitPrice <= 0) {
    throw new Error("limitPrice must be greater than 0");
  }
  if (amount <= 0) return 0;
  return floorToDecimal(amount / limitPrice, 0);
}

// =====================================================
// 체결 판정 함수
// =====================================================

/**
 * LOC 매수 체결 여부 판정
 * 당일 종가 <= 매수 지정가 → 체결
 *
 * @param closePrice - 당일 종가
 * @param limitPrice - 매수 지정가
 * @returns 체결 여부
 */
export function shouldExecuteBuy(closePrice: number, limitPrice: number): boolean {
  return closePrice <= limitPrice;
}

/**
 * LOC 매도 체결 여부 판정
 * 당일 종가 >= 매도 지정가 → 체결
 *
 * @param closePrice - 당일 종가
 * @param limitPrice - 매도 지정가
 * @returns 체결 여부
 */
export function shouldExecuteSell(closePrice: number, limitPrice: number): boolean {
  return closePrice >= limitPrice;
}

// =====================================================
// 사이클 상태 파생 계산
// =====================================================

/**
 * 활성 티어 매수금액 합계 (Decimal)
 */
function totalInvested(holdings: TierHolding[]): Decimal {
  return holdings.reduce(
    (sum, holding) => sum.add(new Decimal(holding.buyPrice).mul(holding.shares)),
    new Decimal(0)
  );
}

/**
 * 아직 티어에 투자되지 않은 사이클 자본 (Decimal)
 * 사이클 자본 - Σ(활성 티어 매수금액)
 */
function uninvestedCapital(state: CycleState): Decimal {
  return new Decimal(state.cycleCapital).sub(totalInvested(state.holdings));
}

/**
 * 계좌 현금 계산 (ADR-0003)
 * 계좌 현금 = 사이클 자본 - Σ(활성 티어 매수금액) + 이번 사이클 실현손익
 * 주문표대로 집행했을 때 증권사 계좌에 실제로 남아 있어야 할 현금이다.
 * 옛 규칙으로 이미 체결된 매수가 있으면 음수일 수 있다.
 *
 * @param state - 사이클 상태
 * @returns 계좌 현금 (소수점 2자리 내림)
 */
export function accountCash(state: CycleState): number {
  return uninvestedCapital(state)
    .add(state.realizedPnl)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();
}

/**
 * 예수금 계산 (ADR-0001, ADR-0003)
 * 예수금 = max(0, min(사이클 자본 - Σ(활성 티어 매수금액), 계좌 현금))
 * 매도 시 티어 매수금액은 즉시 회복되고, 실현 수익은 사이클 종료까지 재투자하지 않는다.
 * 사이클 안 실현손익의 합이 마이너스일 때만 그만큼 빠진다 - 이익은 앞선 손실을 상계한다.
 *
 * @param state - 사이클 상태
 * @returns 예수금 (소수점 2자리 내림, 음수면 0)
 */
export function availableCash(state: CycleState): number {
  const uninvested = uninvestedCapital(state);
  const cash = Decimal.min(uninvested, uninvested.add(state.realizedPnl));
  if (cash.lte(0)) return 0;
  return cash.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 비어 있는 가장 낮은 기본 티어 (내부 헬퍼)
 * 없으면(기본 티어 1-6이 모두 보유 중이면) null - 예비 티어는 이때만 매수 차례가 되고,
 * 화면의 할당 시드도 이때만 있다.
 */
function lowestEmptyBaseTier(heldTiers: Set<number>): number | null {
  for (let tier = MIN_TIER_NUMBER; tier <= BASE_TIER_COUNT; tier++) {
    if (!heldTiers.has(tier)) return tier;
  }
  return null;
}

/**
 * 다음 매수 티어 번호 결정 (티어 고정 방식)
 * 티어 1-6 중 가장 낮은 빈 티어를 반환한다.
 * 티어 1-6이 모두 활성화되고 예수금이 있으면 예비 티어(7)를 반환한다.
 *
 * @param state - 사이클 상태
 * @returns 다음 매수 티어 번호 또는 null (매수 불가)
 */
export function nextBuyTier(state: CycleState): number | null {
  const heldTiers = new Set(state.holdings.map((h) => h.tier));

  const emptyBaseTier = lowestEmptyBaseTier(heldTiers);
  if (emptyBaseTier !== null) {
    return emptyBaseTier;
  }

  if (!heldTiers.has(RESERVE_TIER_NUMBER) && availableCash(state) > 0) {
    return RESERVE_TIER_NUMBER;
  }

  return null;
}

/**
 * 티어 금액 계산
 * 기본 티어(1-6)는 사이클 자본 × 전략 비율, 예비 티어(7)는 잔여 예수금 전액.
 * 기본 티어도 예수금을 초과할 수 없다 (ADR-0001: 실현 수익은 매수 여력에 포함되지 않는다).
 * 순실현손실로 예수금이 줄면 모자란 몫은 그다음에 사는 티어가 떠안는다 (ADR-0003).
 *
 * @param state - 사이클 상태
 * @param tier - 티어 번호 (1-7)
 * @returns 티어 금액 (소수점 2자리 내림)
 */
export function tierAmount(state: CycleState, tier: number): number {
  const cash = availableCash(state);
  if (tier === RESERVE_TIER_NUMBER) {
    return cash;
  }

  if (tier < MIN_TIER_NUMBER || tier > BASE_TIER_COUNT) {
    throw new Error(`Invalid tier number: ${tier}`);
  }

  return Math.min(nominalTierAmount(state, tier), cash);
}

/**
 * 기본 티어의 비율대로의 금액: 사이클 자본 × 전략 비율 (소수점 2자리 내림)
 * 예수금으로 줄기 전의 금액이다. tierAmount는 이 값과 예수금 중 작은 쪽이다.
 */
export function nominalTierAmount(state: CycleState, tier: number): number {
  return new Decimal(state.cycleCapital)
    .mul(state.strategy.tierRatios[tier - 1])
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();
}

/**
 * 화면용 현금 내역 (ADR-0003, #98)
 * 예수금과 그 계산식의 항목(사이클 자본, 투자 중, 이번 사이클 순실현손실), 계좌 현금,
 * 티어 1-7의 할당 시드를 함께 낸다. 화면은 이 값을 보이기만 하고 규칙을 다시 계산하지 않는다.
 *
 * 할당 시드:
 * - 보유 중인 기본 티어: 비율대로의 금액 (사이클 자본 × 비율)
 * - 아직 안 산 기본 티어: 지금 사면 쓰일 금액 min(사이클 자본 × 비율, 예수금).
 *   비율대로의 금액보다 작으면 예수금 때문에 축소된 것이다.
 * - 예비 티어: 기본 티어 1-6이 모두 보유 중이면 예수금 전액, 아니면 0
 *
 * @param state - 사이클 상태
 * @returns 현금 내역
 */
export function cashBreakdown(state: CycleState): CashBreakdown {
  const heldTiers = new Set(state.holdings.map((h) => h.tier));
  const cash = availableCash(state);

  const tiers: TierCash[] = [];
  for (let tier = MIN_TIER_NUMBER; tier <= BASE_TIER_COUNT; tier++) {
    const nominalAmount = nominalTierAmount(state, tier);
    const amount = heldTiers.has(tier) ? nominalAmount : tierAmount(state, tier);
    tiers.push({ tier, amount, nominalAmount, isReduced: amount < nominalAmount });
  }
  tiers.push({
    tier: RESERVE_TIER_NUMBER,
    amount: lowestEmptyBaseTier(heldTiers) === null ? cash : 0,
    nominalAmount: null,
    isReduced: false,
  });

  const netRealizedLoss = Math.max(0, -state.realizedPnl);
  return {
    availableCash: cash,
    accountCash: accountCash(state),
    cycleCapital: state.cycleCapital,
    investedAmount: totalInvested(state.holdings).toNumber(),
    netRealizedLoss,
    isCashReduced: netRealizedLoss > 0,
    tiers,
  };
}
