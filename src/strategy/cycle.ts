/**
 * 사이클 경계 처리
 * #43: 사이클 자본은 외부에서 공급된다.
 * 백테스트는 직전 사이클 종료 시점의 현금 전액(복리), 실계좌는 사용자 설정 시드 금액.
 * 시드·전략 변경은 사이클 경계에서만 허용된다.
 */
import type { CycleState, StrategyParams } from "./types";

/**
 * 새 사이클 시작
 * CYCLE_COMPLETED 이벤트를 받은 호출자가 다음 사이클 자본을 공급하며 호출한다.
 *
 * @param state - 완료된 사이클의 상태 (보유 티어가 없어야 한다)
 * @param cycleCapital - 새 사이클 자본
 * @param strategy - 새 사이클의 전략 (생략 시 기존 전략 유지)
 * @returns 새 사이클 상태
 */
export function startNextCycle(
  state: CycleState,
  cycleCapital: number,
  strategy: StrategyParams = state.strategy
): CycleState {
  if (state.holdings.length > 0) {
    throw new Error(`Cannot start next cycle: ${state.holdings.length} active tier(s) remaining`);
  }
  if (cycleCapital <= 0) {
    throw new Error("cycleCapital must be greater than 0");
  }

  return {
    strategy,
    cycleCapital,
    holdings: [],
    cycleNumber: state.cycleNumber + 1,
  };
}
