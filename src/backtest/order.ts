/**
 * LOC/MOC 주문 계산 함수
 * SPEC-BACKTEST-001 REQ-002, REQ-003, REQ-004, REQ-005
 */

/**
 * 소수점 자릿수로 내림
 * 부동소수점 정밀도 문제를 해결하기 위해 정수 연산 사용
 *
 * @param value - 내림할 값
 * @param decimals - 소수점 자릿수
 * @returns 내림된 값
 */
export function floorToDecimal(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  // 부동소수점 정밀도 문제 해결: 10자리까지 반올림 후 내림
  // 예: 100 * 1.015 = 101.49999999999999 -> 반올림 -> 101.5 -> 내림 -> 101.5
  const rounded = Math.round(value * 1e10) / 1e10;
  return Math.floor(rounded * multiplier) / multiplier;
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
  const rawPrice = prevClose * (1 + threshold);
  return floorToDecimal(rawPrice, 2);
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
  const rawPrice = buyPrice * (1 + threshold);
  return floorToDecimal(rawPrice, 2);
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
