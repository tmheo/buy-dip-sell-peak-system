/**
 * 계좌 설정 카드의 편집 규칙과 시드 안내 (#112, #118, ADR-0005, ADR-0006)
 *
 * 종목은 계좌를 만들 때 정하므로 언제나 읽기 전용이다. 이 모듈은 그 밖에 계좌 상태나
 * 고른 값에 따라 달라지는 규칙과, 새 시드가 쓰이기 시작한 뒤 설정 카드가 보일 안내를 담는다.
 */

import Decimal from "decimal.js";

import type { SeedCutSettlement } from "@/trading";
import type { SeedStatus, Strategy, TradingAccount } from "@/types/trading";

import {
  formatCurrency,
  formatMonthDayWithWeekday,
  formatSeedAmount,
  subjectParticleAfterNumber,
} from "./format";

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

/**
 * 새 시드가 처음 쓰이는 날의 안내. 감액이면 이제 출금해도 된다, 증액이면 아직이면 입금하라.
 *
 * 감액분은 적용일 전 거래일의 주문이 체결된 뒤에 출금해야 기록이 증권사 잔고와 맞으므로
 * 적용일에야 출금을 안내한다. 시드 감액으로 모두 파는 날에는 감액분이 아직 팔지 않은 주식에
 * 있어 출금할 수 없으므로 안내하지 않는다 - 그날은 주문표 위 안내가 맡는다(ADR-0006).
 *
 * @param seed - 시드 상태 (appliedToday가 오늘 처음 쓰인 새 시드)
 * @param endsCycleBySeedCut - 오늘이 시드 감액으로 모두 파는 날인지 (cashBreakdown)
 * @returns 안내 문장. 오늘 처음 쓰인 새 시드가 없거나 모두 파는 날이면 null
 */
export function appliedSeedNotice(seed: SeedStatus, endsCycleBySeedCut: boolean): string | null {
  if (!seed.appliedToday || endsCycleBySeedCut) return null;
  const { previous, current } = seed.appliedToday;
  const change = new Decimal(current).sub(previous);
  const amount = formatSeedAmount(change.abs().toNumber());
  const from = `오늘부터 시드는 ${formatSeedAmount(current)}입니다.`;
  return change.lt(0)
    ? `${from} 전 거래일 주문이 체결됐으니 이제 ${amount}를 출금해도 됩니다.`
    : `${from} 아직 입금하지 않았다면 ${amount}를 입금하세요.`;
}

/** 시드 감액으로 끝난 사이클의 정산 안내 제목 */
export function seedCutSettlementTitle(endedCycleNumber: number): string {
  const particle = subjectParticleAfterNumber(endedCycleNumber);
  return `사이클 ${endedCycleNumber}${particle} 시드 감액으로 끝났습니다. 증권사 잔고를 새 시드에 맞추세요.`;
}

/** 정산 계산 과정의 한 줄. tone은 값의 색: 실현손익의 손익, 마지막 줄(출금·입금할 금액) */
export interface SettlementLine {
  label: string;
  value: string;
  tone: "default" | "profit" | "loss" | "total";
}

/**
 * 시드 감액으로 끝난 사이클의 출금액 계산 과정 (ADR-0006)
 * `옛 시드 + 끝난 사이클 실현손익 = 사이클이 끝났을 때 증권사에 있어야 할 현금`,
 * `- 새 시드 = 출금할 금액`. 출금할 금액이 음수이면 그만큼 입금할 금액으로 보인다.
 *
 * 다음 사이클 내내 보이는 안내라 "지금 증권사에 있어야 할 현금"이라 하지 않는다 - 다음 사이클의
 * 매수가 체결되면 지금 증권사의 현금은 그만큼 줄어 있다.
 */
export function seedCutSettlementLines(settlement: SeedCutSettlement): SettlementLine[] {
  const { endedCycleNumber, previousSeed, realizedPnl, newSeed, withdrawal } = settlement;
  const cashAtCycleEnd = new Decimal(previousSeed).add(realizedPnl).toNumber();
  return [
    { label: "옛 시드", value: formatCurrency(previousSeed), tone: "default" },
    {
      label: `+ 사이클 ${endedCycleNumber} 실현손익`,
      value: formatCurrency(realizedPnl),
      tone: realizedPnl < 0 ? "loss" : "profit",
    },
    {
      label: "= 사이클이 끝났을 때 증권사에 있어야 할 현금",
      value: formatCurrency(cashAtCycleEnd),
      tone: "default",
    },
    { label: "− 새 시드", value: formatCurrency(newSeed), tone: "default" },
    {
      label: withdrawal < 0 ? "= 입금할 금액" : "= 출금할 금액",
      value: formatCurrency(Math.abs(withdrawal)),
      tone: "total",
    },
  ];
}
