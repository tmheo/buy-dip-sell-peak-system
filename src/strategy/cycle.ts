/**
 * 사이클 경계 처리
 * #43: 사이클 자본은 외부에서 공급된다.
 * 백테스트는 직전 사이클 종료 시점의 현금 전액(복리), 실계좌는 사용자 설정 시드 금액.
 * 전략 변경은 사이클 경계에서만 허용된다. 실계좌의 시드는 사이클 중에도 바뀐다 (ADR-0004).
 */
import type { CycleState, StrategyParams } from "./types";

/**
 * 사이클 중인지 - 보유 티어가 하나라도 있으면 사이클 중이다.
 * 보유 티어를 모두 팔면 사이클이 끝나고, 다음 사이클은 첫 매수로 시작된다.
 *
 * @param state - 사이클 상태
 */
export function isCycleInProgress(state: Pick<CycleState, "holdings">): boolean {
  return state.holdings.length > 0;
}

/**
 * 새 사이클 시작
 * CYCLE_COMPLETED 이벤트를 받은 호출자가 다음 사이클 자본을 공급하며 호출한다.
 * 이번 사이클 실현손익은 0으로 되돌린다 (ADR-0003).
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
  if (isCycleInProgress(state)) {
    throw new Error(`Cannot start next cycle: ${state.holdings.length} active tier(s) remaining`);
  }
  if (cycleCapital <= 0) {
    throw new Error("cycleCapital must be greater than 0");
  }

  return {
    strategy,
    cycleCapital,
    // 사이클 자본이 줄어든 날은 그 거래일 하나다. 실계좌는 날마다 상태를 새로 조립하므로
    // 새 사이클에 넘기지 않고, 백테스트는 시드를 바꾸지 않으므로 늘 0이다 (ADR-0006)
    capitalCut: 0,
    holdings: [],
    cycleNumber: state.cycleNumber + 1,
    // 실현손익은 호출자가 다음 사이클 자본에 반영한다 - 새 사이클은 0에서 시작
    realizedPnl: 0,
  };
}
