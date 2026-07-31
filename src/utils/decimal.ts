/**
 * 소수점 처리 공용 함수
 * 금융 계산의 부동소수점 오차를 decimal.js로 제거한다.
 */
import Decimal from "decimal.js";

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
