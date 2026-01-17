/**
 * LOC/MOC 주문 계산 함수
 * SPEC-BACKTEST-001 REQ-002, REQ-003, REQ-004, REQ-005
 */
import Decimal from "decimal.js";

/**
 * 소수점 자릿수로 내림 (decimal.js 사용)
 * 부동소수점 정밀도 문제를 해결하기 위해 decimal.js 사용
 *
 * @param value - 내림할 값
 * @param decimals - 소수점 자릿수
 * @returns 내림된 값
 */
export function floorToDecimal(value: number, decimals: number): number {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 소수점 자릿수로 반올림 (decimal.js 사용)
 * 금융 계산에서 사용 (현금 합계 등)
 *
 * @param value - 반올림할 값
 * @param decimals - 소수점 자릿수
 * @returns 반올림된 값
 */
export function roundToDecimal(value: number, decimals: number): number {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * LOC 매수 지정가 계산
 * REQ-002: 매수 지정가 = floor(전일 종가 × (1 + buyThreshold), 소수점 2자리)
 *
 * @param prevClose - 전일 종가
 * @param threshold - 매수 임계값 (음수, 예: -0.0001 = -0.01%)
 * @returns 매수 지정가
 */
export function calculateBuyLimitPrice(prevClose: number, threshold: number): number {
  // decimal.js를 사용하여 부동소수점 오차 방지
  const price = new Decimal(prevClose).mul(new Decimal(1).add(threshold));
  return price.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * LOC 매도 지정가 계산
 * REQ-004: 매도 지정가 = floor(매수 체결가 × (1 + sellThreshold), 소수점 2자리)
 *
 * @param buyPrice - 매수 체결가
 * @param threshold - 매도 임계값 (양수, 예: 0.015 = +1.5%)
 * @returns 매도 지정가
 */
export function calculateSellLimitPrice(buyPrice: number, threshold: number): number {
  // decimal.js를 사용하여 부동소수점 오차 방지
  const price = new Decimal(buyPrice).mul(new Decimal(1).add(threshold));
  return price.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 매수 수량 계산
 * REQ-002: 매수 수량 = floor(티어 금액 ÷ 매수 지정가, 정수)
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

/**
 * LOC 매수 체결 여부 판정
 * REQ-003: IF 당일 종가 ≤ 매수 지정가 THEN 매수 체결
 *
 * @param close - 당일 종가
 * @param limitPrice - 매수 지정가
 * @returns 체결 여부
 */
export function shouldExecuteBuy(close: number, limitPrice: number): boolean {
  return close <= limitPrice;
}

/**
 * LOC 매도 체결 여부 판정
 * REQ-005: IF 당일 종가 ≥ 매도 지정가 THEN 매도 체결
 *
 * @param close - 당일 종가
 * @param limitPrice - 매도 지정가
 * @returns 체결 여부
 */
export function shouldExecuteSell(close: number, limitPrice: number): boolean {
  return close >= limitPrice;
}
