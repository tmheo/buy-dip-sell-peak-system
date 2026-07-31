/**
 * 떨사오팔 매매 규칙의 계산 원시 함수
 * utils/trading-core.ts에서 이동 (#45).
 *
 * 모든 금융 계산은 decimal.js를 사용하여 부동소수점 오차를 방지한다.
 * 입력 가격은 분할·배당 조정된 연속 시계열(adjClose)이어야 한다.
 */
import Decimal from "decimal.js";
import type { CycleState, TierHolding } from "./types";
import { BASE_TIER_COUNT, MIN_TIER_NUMBER, RESERVE_TIER_NUMBER } from "./types";

// =====================================================
// 소수점 처리 함수
// =====================================================

/**
 * 소수점 자릿수로 내림
 *
 * @param value - 내림할 값
 * @param decimals - 소수점 자릿수
 * @returns 내림된 값
 */
export function floorToDecimal(value: number, decimals: number): number {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 소수점 자릿수로 반올림
 * 금융 계산에서 사용 (현금 합계 등)
 *
 * @param value - 반올림할 값
 * @param decimals - 소수점 자릿수
 * @returns 반올림된 값
 */
export function roundToDecimal(value: number, decimals: number): number {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
}

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
// 전략 임계값 변환 함수
// =====================================================

/**
 * 퍼센트 값을 소수점 임계값으로 변환
 * 예: -0.01 (%) → -0.0001 (소수점)
 *
 * @param percentValue - 퍼센트 값 (예: -0.01, 1.5)
 * @returns 소수점 임계값 (예: -0.0001, 0.015)
 */
export function percentToThreshold(percentValue: number): number {
  return new Decimal(percentValue).div(100).toNumber();
}

// =====================================================
// 사이클 상태 파생 계산
// =====================================================

/**
 * 활성 티어 투자원금 합계 (Decimal)
 */
function totalInvested(holdings: TierHolding[]): Decimal {
  return holdings.reduce(
    (sum, holding) => sum.add(new Decimal(holding.buyPrice).mul(holding.shares)),
    new Decimal(0)
  );
}

/**
 * 예수금 계산 (ADR-0001)
 * 예수금 = 사이클 자본 - Σ(활성 티어 투자원금)
 * 매도 시 원금은 즉시 회복되고, 실현 수익은 사이클 종료까지 재투자하지 않는다.
 *
 * @param state - 사이클 상태
 * @returns 예수금 (소수점 2자리 내림, 음수면 0)
 */
export function availableCash(state: CycleState): number {
  const remaining = new Decimal(state.cycleCapital).sub(totalInvested(state.holdings));
  if (remaining.lte(0)) return 0;
  return remaining.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
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

  for (let tier = MIN_TIER_NUMBER; tier <= BASE_TIER_COUNT; tier++) {
    if (!heldTiers.has(tier)) {
      return tier;
    }
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

  const ratio = new Decimal(state.strategy.tierRatios[tier - 1]);
  const nominal = new Decimal(state.cycleCapital)
    .mul(ratio)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();
  return Math.min(nominal, cash);
}
