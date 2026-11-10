/**
 * 트레이딩 화면 공용 표시 형식
 * 계좌 상세의 자산 현황, 보유 현황, 주문표, 수익 현황이 같은 형식으로 금액·비율·티어·날짜를 보인다.
 */
import { RESERVE_TIER_NUMBER } from "@/strategy";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeDollarFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 시드 금액 - 센트가 없으면 달러까지만, 있으면 센트까지, 예: "$10,000", "$3,000.50" */
export function formatSeedAmount(value: number): string {
  return Number.isInteger(value)
    ? wholeDollarFormatter.format(value)
    : currencyFormatter.format(value);
}

/** 달러 금액 (소수 둘째 자리). 값이 없으면 "-" */
export function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return currencyFormatter.format(value);
}

/**
 * 저장된 "YYYY-MM-DD" 날짜를 그 날짜의 현지 자정으로 읽는다.
 * new Date("YYYY-MM-DD")는 UTC 자정으로 읽어 UTC보다 늦은 시간대에서 하루 앞당겨 보인다.
 */
function parseStoredDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** 날짜 (두 자리 월·일), 예: "2026. 01. 05.". 값이 없으면 "-" */
export function formatDate(date: string | null): string {
  if (!date) return "-";
  return parseStoredDate(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 날짜 (년 월 일), 예: "2026년 1월 5일" */
export function formatLongDate(date: string): string {
  return parseStoredDate(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** 월·일과 요일, 예: "11월 11일(수)" */
export function formatMonthDayWithWeekday(date: string): string {
  const parsed = parseStoredDate(date);
  const monthDay = parsed.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  const weekday = parsed.toLocaleDateString("ko-KR", { weekday: "short" });
  return `${monthDay}(${weekday})`;
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
