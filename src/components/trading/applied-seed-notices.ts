/**
 * 새 시드가 쓰이기 시작한 뒤 설정 카드가 보일 안내 (#118, ADR-0006)
 *
 * - 새 시드가 처음 쓰이는 날(사이클이 이어질 때): 감액이면 이제 출금, 증액이면 아직이면 입금
 * - 시드 감액으로 끝난 다음 사이클 동안: 시드 감액 정산의 제목과 계산 과정
 *
 * 계산 과정의 금액은 모두 계좌 상세 응답의 seedCutSettlement 값이다 - 파생값은 서버가 내고
 * 화면은 다시 계산하지 않는다(ADR-0003).
 */

import Decimal from "decimal.js";

import type { SeedCutSettlement } from "@/trading";
import type { SeedStatus } from "@/types/trading";

import { formatCurrency, formatSeedAmount, subjectParticleAfterNumber } from "./format";

/**
 * 새 시드가 처음 쓰이는 날의 안내. 감액이면 이제 출금해도 된다, 증액이면 아직이면 입금하라.
 *
 * 감액분은 적용일 전 거래일의 주문이 체결된 뒤에 출금해야 기록이 증권사 잔고와 맞으므로
 * 적용일에야 출금을 안내한다. 시드 감액으로 사이클을 끝내는 날에는 감액분이 아직 팔지 않은
 * 주식에 있어 출금할 수 없으므로 안내하지 않는다 - 그날은 주문표 위 안내가 맡는다(ADR-0006).
 *
 * @param seed - 시드 상태 (appliedToday가 오늘 처음 쓰인 새 시드)
 * @param endsCycleBySeedCut - 오늘이 시드 감액으로 사이클을 끝내는 날인지 (cashBreakdown)
 * @returns 안내 문장. 오늘 처음 쓰인 새 시드가 없거나 시드 감액으로 사이클을 끝내는 날이면 null
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

/** 시드 감액 정산 안내의 제목 */
export function seedCutSettlementTitle(endedCycleNumber: number): string {
  const particle = subjectParticleAfterNumber(endedCycleNumber);
  return `사이클 ${endedCycleNumber}${particle} 시드 감액으로 끝났습니다. 증권사 잔고를 새 시드에 맞추세요.`;
}

/** 시드 감액 정산 계산 과정의 한 줄. tone은 값의 색: 실현손익의 손익, 마지막 줄(출금·입금할 금액) */
export interface SettlementLine {
  label: string;
  value: string;
  tone: "default" | "profit" | "loss" | "total";
}

/**
 * 시드 감액 정산의 계산 과정 (ADR-0006)
 * `옛 시드 + 끝난 사이클 실현손익 = 사이클이 끝났을 때 증권사에 있어야 할 현금`,
 * `- 새 시드 = 출금할 금액`. 출금할 금액이 음수이면 그만큼 입금할 금액으로 보인다.
 *
 * 다음 사이클 내내 보이는 안내라 "지금 증권사에 있어야 할 현금"이라 하지 않는다 - 다음 사이클의
 * 매수가 체결되면 지금 증권사의 현금은 그만큼 줄어 있다.
 */
export function seedCutSettlementLines(settlement: SeedCutSettlement): SettlementLine[] {
  const { endedCycleNumber, previousSeed, realizedPnl, cashAtCycleEnd, newSeed, withdrawal } =
    settlement;
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
    { label: "- 새 시드", value: formatCurrency(newSeed), tone: "default" },
    {
      label: withdrawal < 0 ? "= 입금할 금액" : "= 출금할 금액",
      value: formatCurrency(Math.abs(withdrawal)),
      tone: "total",
    },
  ];
}
