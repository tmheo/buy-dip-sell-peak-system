/**
 * 트레이딩 핵심 유틸리티 함수
 *
 * 매매 규칙 계산 원시 함수는 src/strategy/calculations.ts로 이동했다 (#45).
 * 기존 소비자를 위해 재수출하며, 이행 완료(#43 4단계) 후 이 파일은 정리된다.
 */
export {
  floorToDecimal,
  roundToDecimal,
  calculateBuyLimitPrice,
  calculateSellLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
  percentToThreshold,
} from "@/strategy/calculations";

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
 * 시작일부터 종료일까지의 거래일 수 (시작일 포함)
 * UTC 기준으로 계산하여 타임존 문제 방지
 * 예: 월요일 시작 → 다음 월요일 종료 = 6 거래일 (월~금 + 월)
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

  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      tradingDays++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return tradingDays;
}
