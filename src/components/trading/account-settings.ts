/**
 * 계좌 설정 카드의 편집 규칙 (#112, ADR-0005)
 *
 * 종목은 계좌를 만들 때 정하므로 언제나 읽기 전용이다. 이 모듈은 그 밖에 계좌 상태나
 * 고른 값에 따라 달라지는 규칙만 담는다. 새 시드가 쓰이기 시작한 뒤의 안내는
 * applied-seed-notices.ts가 맡는다.
 */

import type { SeedStatus, Strategy, TradingAccount } from "@/types/trading";

import { formatMonthDayWithWeekday, formatSeedAmount } from "./format";

const STRATEGY_CHANGE_WARNING =
  "이미 이 전략으로 1번 티어 매수 주문을 냈다면 바꾸지 마세요. 바꾼 전략으로 체결이 기록되어 증권사 잔고와 어긋납니다.";

/**
 * 운용 시작일을 편집할 수 있는지 - 첫 일일 마감 전에만 바꿀 수 있다.
 * 그 뒤에는 일일 마감이 이 값을 읽지 않아 바꿔도 처리할 거래일이 달라지지 않는다.
 */
export function canEditTradingStartDate(
  account: Pick<TradingAccount, "lastProcessedDate">
): boolean {
  return account.lastProcessedDate === null;
}

/**
 * 고른 전략이 지금 전략과 다를 때 보일 경고. 같으면 null.
 * 전략은 바꾸는 즉시 적용되므로, 이미 낸 1번 티어 매수 주문은 바꾼 전략으로 체결이 기록된다.
 * 주문을 낸 뒤 바꾸는 것은 사용자의 책임이라 저장은 막지 않는다.
 */
export function strategyChangeWarning(current: Strategy, selected: Strategy): string | null {
  return current === selected ? null : STRATEGY_CHANGE_WARNING;
}

/**
 * 적용 전 시드 변경을 보일 문장, 예: "$10,000 → $3,000, 11월 11일(수) 주문표부터".
 * 적용 전 변경이 없으면 null.
 * 바꾼 시드는 다음 거래일 주문표부터 쓰이므로, 그 전까지는 지금 시드로 주문표가 만들어진다.
 */
export function pendingSeedChangeText(seed: SeedStatus): string | null {
  if (!seed.pending) return null;
  const { seedCapital, effectiveDate } = seed.pending;
  return `${formatSeedAmount(seed.current)} → ${formatSeedAmount(seedCapital)}, ${formatMonthDayWithWeekday(effectiveDate)} 주문표부터`;
}

/**
 * 적용 전 변경이 있을 때 주문표 위에 적을 문장 - 오늘 주문표는 지금 시드로 만들어졌다.
 * 새 시드와 적용일은 설정 카드가 보이므로 되풀이하지 않는다. 적용 전 변경이 없으면 null.
 */
export function pendingSeedOrdersNote(seed: SeedStatus): string | null {
  if (!seed.pending) return null;
  return `오늘 주문표는 지금 시드 ${formatSeedAmount(seed.current)} 기준입니다.`;
}

/** 시드 칸의 시작 값 - 적용 전 변경이 있으면 그 값이다(다시 바꾸면 그 변경을 덮어쓴다). */
export function seedInputValue(seed: SeedStatus): number {
  return seed.pending?.seedCapital ?? seed.current;
}

/**
 * 저장할 때 보낼 시드. 시드 칸이 시작 값 그대로이면 null(보내지 않는다).
 * 적용 전 변경이 있을 때 지금 시드를 보내면 서버가 그 변경을 지운다(되돌리기).
 */
export function seedChangeToSend(seed: SeedStatus, entered: number): number | null {
  return entered === seedInputValue(seed) ? null : entered;
}
