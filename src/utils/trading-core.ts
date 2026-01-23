/**
 * 트레이딩 핵심 유틸리티 함수
 * 백테스트와 실제 트레이딩에서 공통으로 사용되는 계산 로직
 *
 * 모든 금융 계산은 decimal.js를 사용하여 부동소수점 오차를 방지합니다.
 */
import Decimal from "decimal.js";

// =====================================================
// 소수점 처리 함수
// =====================================================

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

// =====================================================
// 가격 계산 함수
// =====================================================

/**
 * LOC 매수 지정가 계산
 * 매수 지정가 = floor(전일 종가 × (1 + buyThreshold), 소수점 2자리)
 *
 * @param prevClose - 전일 종가
 * @param threshold - 매수 임계값 (소수점, 예: -0.0001 = -0.01%)
 * @returns 매수 지정가
 */
export function calculateBuyLimitPrice(prevClose: number, threshold: number): number {
  const price = new Decimal(prevClose).mul(new Decimal(1).add(threshold));
  return price.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/**
 * LOC 매도 지정가 계산
 * 매도 지정가 = floor(매수 체결가 × (1 + sellThreshold), 소수점 2자리)
 *
 * @param buyPrice - 매수 체결가
 * @param threshold - 매도 임계값 (소수점, 예: 0.015 = +1.5%)
 * @returns 매도 지정가
 */
export function calculateSellLimitPrice(buyPrice: number, threshold: number): number {
  const price = new Decimal(buyPrice).mul(new Decimal(1).add(threshold));
  return price.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
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
// 날짜 유틸리티 함수
// =====================================================

/**
 * 이전 거래일 계산 (주말 제외)
 * UTC 기준으로 계산하여 타임존 문제 방지
 *
 * @param date - 기준 날짜 (YYYY-MM-DD)
 * @returns 이전 거래일 (YYYY-MM-DD)
 */
export function getPreviousTradingDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);

  const day = dt.getUTCDay();
  if (day === 0) dt.setUTCDate(dt.getUTCDate() - 2); // 일요일 -> 금요일
  if (day === 6) dt.setUTCDate(dt.getUTCDate() - 1); // 토요일 -> 금요일

  return dt.toISOString().slice(0, 10);
}

/**
 * 두 날짜 사이의 거래일 수 계산 (주말 제외)
 * 시작일 다음날부터 종료일까지의 거래일 수
 * UTC 기준으로 계산하여 타임존 문제 방지
 * 예: 월요일 시작 → 다음 월요일 종료 = 5 거래일 (화~금 + 월)
 *
 * @param startDate - 시작 날짜 (YYYY-MM-DD)
 * @param endDate - 종료 날짜 (YYYY-MM-DD)
 * @returns 거래일 수
 */
export function calculateTradingDays(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  let tradingDays = 0;
  const current = new Date(start);
  current.setUTCDate(current.getUTCDate() + 1); // 시작일 다음날부터 계산

  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      tradingDays++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return tradingDays;
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
