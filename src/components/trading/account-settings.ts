/**
 * 계좌 설정 카드의 편집 규칙 (#112)
 *
 * 종목은 계좌를 만들 때 정하므로 언제나 읽기 전용이다. 이 모듈은 그 밖에 계좌 상태나
 * 고른 값에 따라 달라지는 규칙만 담는다.
 */

import type { Strategy, TradingAccount } from "@/types/trading";

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
