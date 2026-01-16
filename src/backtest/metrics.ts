/**
 * 성과 지표 계산 함수
 * SPEC-BACKTEST-001 REQ-009
 */
import type { DailySnapshot } from "./types";
import { floorToDecimal } from "./order";

/**
 * 수익률 계산
 *
 * @param initial - 초기 투자금
 * @param final - 최종 자산
 * @returns 수익률 (소수점, 예: 0.3 = 30%)
 */
export function calculateReturn(initial: number, final: number): number {
  if (initial === 0) return 0;
  return floorToDecimal((final - initial) / initial, 4);
}

/**
 * MDD (Maximum Drawdown) 계산
 * 고점 대비 최대 낙폭을 계산
 *
 * @param history - 일별 스냅샷 배열
 * @returns MDD (음수, 예: -0.25 = -25%)
 */
export function calculateMDD(history: DailySnapshot[]): number {
  if (history.length === 0) return 0;

  let peak = history[0].totalAsset;
  let maxDrawdown = 0;

  for (const snapshot of history) {
    if (snapshot.totalAsset > peak) {
      peak = snapshot.totalAsset;
    }
    const drawdown = (peak - snapshot.totalAsset) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // -0 대신 0을 반환하기 위해 명시적 처리
  if (maxDrawdown === 0) return 0;
  return floorToDecimal(-maxDrawdown, 4); // 음수로 반환
}

/**
 * 승률 계산
 * 수익이 0보다 큰 사이클의 비율
 *
 * @param cycles - 사이클별 수익 배열
 * @returns 승률 (소수점, 예: 0.8667 = 86.67%)
 */
export function calculateWinRate(cycles: { profit: number }[]): number {
  if (cycles.length === 0) return 0;

  const wins = cycles.filter((c) => c.profit > 0).length;
  return floorToDecimal(wins / cycles.length, 4);
}
