/**
 * 트레이딩 화면 공용 표시 형식
 * 계좌 상세의 자산 현황, 보유 현황, 주문표, 수익 현황이 같은 형식으로 금액·비율·티어를 보인다.
 */
import { RESERVE_TIER_NUMBER } from "@/strategy";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 달러 금액 (소수 둘째 자리). 값이 없으면 "-" */
export function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return currencyFormatter.format(value);
}

/** 부호를 붙인 백분율 (소수 둘째 자리), 예: "+1.50%" */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** 티어 표시 이름: 예비 티어는 "예비", 기본 티어는 번호 */
export function getTierLabel(tier: number): string {
  if (tier === RESERVE_TIER_NUMBER) return "예비";
  return `${tier}`;
}
