/**
 * 시드 이력 (ADR-0005, #116)
 *
 * 시드 금액은 적용일이 붙은 이력으로 남는다. 바꾼 시드는 바꾼 날(서버의 UTC 날짜)의
 * 다음 평일 주문표부터 쓰이고, 그 전까지의 주문표와 체결은 옛 시드로 한다.
 * 어느 날의 사이클 자본은 언제나 이 이력에서 그날의 시드를 읽는다 - 계좌에 "지금 시드"를
 * 두지 않아, 지난 날짜에 지금 시드를 쓰는 길이 구조로 막힌다.
 */

import { getNextWeekday } from "@/lib/date";
import type { SeedHistoryEntry, SeedStatus } from "@/types/trading";

/**
 * 어느 날의 시드 - 적용일이 그날 이하인 가장 최근 줄, 없으면 첫 줄.
 * 첫 시드는 첫 변경 전의 모든 날짜에 쓰인다. 그래서 사이클 시작일이 계좌를 만든 날보다
 * 앞이든 뒤든 이력을 고칠 일이 없다.
 *
 * @param history - 계좌의 시드 이력 (순서는 상관없다)
 * @param date - 기준일 (YYYY-MM-DD)
 */
export function seedCapitalOn(history: readonly SeedHistoryEntry[], date: string): number {
  if (history.length === 0) {
    throw new Error("시드 이력이 없다 - 계좌를 만들 때 첫 줄을 쓴다");
  }

  const sorted = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const applied = sorted.filter((entry) => entry.effectiveDate <= date);
  return (applied.at(-1) ?? sorted[0]).seedCapital;
}

/**
 * 시드를 바꾼 뒤의 이력.
 * 적용일은 오늘의 다음 평일이다 - 휴장일은 알 수 없으므로 주말만 건너뛴다.
 * 적용 전 줄(적용일이 오늘 뒤)은 많아야 하나이고, 새 변경이 그 줄을 지우고 쓴다.
 * 새 시드가 오늘의 시드와 같으면 적용 전 줄만 지운다(되돌리기).
 * 오늘 이하의 줄은 이미 주문표에 쓰였을 수 있으므로 고치지 않는다.
 *
 * @param history - 지금의 시드 이력
 * @param seedCapital - 새 시드
 * @param today - 오늘 (서버의 UTC 날짜, YYYY-MM-DD)
 */
export function changeSeedHistory(
  history: readonly SeedHistoryEntry[],
  seedCapital: number,
  today: string
): SeedHistoryEntry[] {
  const kept = history.filter((entry) => entry.effectiveDate <= today);
  if (seedCapital === seedCapitalOn(history, today)) {
    return kept;
  }
  return [...kept, { effectiveDate: getNextWeekday(today), seedCapital }];
}

/**
 * 화면에 보일 시드 상태.
 * 오늘 새 시드가 처음 적용됐는지는 "직전 거래일의 시드 ≠ 오늘의 시드"로 판정한다 -
 * 적용일이 휴장일이면 그다음 거래일이 실제 첫 적용일이기 때문이다.
 *
 * @param history - 계좌의 시드 이력
 * @param today - 오늘 (서버의 UTC 날짜, YYYY-MM-DD)
 * @param previousTradingDate - 오늘의 직전 거래일 (가격 행 기준). 모르면 null
 */
export function seedStatus(
  history: readonly SeedHistoryEntry[],
  today: string,
  previousTradingDate: string | null
): SeedStatus {
  const current = seedCapitalOn(history, today);
  const pending = history.find((entry) => entry.effectiveDate > today) ?? null;
  const previous =
    previousTradingDate === null ? current : seedCapitalOn(history, previousTradingDate);

  return {
    current,
    pending: pending && { ...pending },
    appliedToday: previous === current ? null : { previous, current },
  };
}
