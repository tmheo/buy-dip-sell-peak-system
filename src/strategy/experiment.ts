/**
 * #88 실험 전용: 실현 손실 반영 방식 변형 스위치와 계측 카운터.
 * 버리는 브랜치(research/88-loss-cash-variants)에만 존재하며 머지하지 않는다.
 */
export type CashVariant = "current" | "A_i" | "A_ii" | "B_i";

export const experiment = {
  variant: "current" as CashVariant,
};

export function setCashVariant(variant: CashVariant): void {
  experiment.variant = variant;
}

/** #88 실험 계측: 백테스트 엔진이 한 번의 run 동안 누적한다 */
export interface ExperimentStats {
  // 제출된 매수 주문 중 주문 금액(지정가 × 수량)이 계좌 현금을 넘은 건수
  ordersOverCash: number;
  // 체결된 매수 중 주문 금액이 계좌 현금을 넘은 건수
  executedOverCash: number;
  // 주문 금액 - 계좌 현금의 최대값
  maxExcess: number;
  // 최대 초과액이 나온 날
  maxExcessDate: string | null;
  // 초과액 / 그날의 사이클 자본 최대값
  maxExcessPct: number;
  // 체결된 손절(MOC 매도) 횟수
  stopLossCount: number;
  // 손실로 끝난 손절 매도 횟수
  stopLossLossCount: number;
  // 순손익이 마이너스로 끝난 완료 사이클 수
  losingCycles: number;
}

export function emptyStats(): ExperimentStats {
  return {
    ordersOverCash: 0,
    executedOverCash: 0,
    maxExcess: 0,
    maxExcessDate: null,
    maxExcessPct: 0,
    stopLossCount: 0,
    stopLossLossCount: 0,
    losingCycles: 0,
  };
}

export let lastStats: ExperimentStats = emptyStats();

export function resetStats(): ExperimentStats {
  lastStats = emptyStats();
  return lastStats;
}
