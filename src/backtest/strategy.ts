/**
 * 전략 매개변수 정의
 * SPEC-BACKTEST-001 REQ-001
 *
 * 전략 상수는 types/trading.ts에서 중앙 관리되며,
 * 이 파일에서는 백테스트용 형식으로 변환하여 제공합니다.
 */
import type { StrategyConfig, StrategyName } from "./types";
import { TIER_RATIOS, BUY_THRESHOLDS, SELL_THRESHOLDS, STOP_LOSS_DAYS } from "@/types/trading";
import { percentToThreshold } from "@/utils/trading-core";

/**
 * 퍼센트 배열을 소수점 비율 배열로 변환
 * 예: [5, 10, 15, 20, 25, 25, 0] -> [0.05, 0.1, 0.15, 0.2, 0.25, 0.25]
 */
function convertTierRatios(ratios: number[]): [number, number, number, number, number, number] {
  return ratios.slice(0, 6).map((r) => r / 100) as [number, number, number, number, number, number];
}

/**
 * Pro 전략 설정 상수
 * types/trading.ts의 중앙 상수에서 파생됨
 *
 * | Parameter     | Pro1                        | Pro2                        | Pro3         |
 * |---------------|-----------------------------|-----------------------------|--------------|
 * | tierRatios    | 5%, 10%, 15%, 20%, 25%, 25% | 10%, 15%, 20%, 25%, 20%, 10%| 16.7% x 6    |
 * | buyThreshold  | -0.01%                      | -0.01%                      | -0.10%       |
 * | sellThreshold | +0.01%                      | +1.50%                      | +2.00%       |
 * | stopLossDay   | 10                          | 10                          | 12           |
 */
export const PRO_STRATEGIES: Record<StrategyName, StrategyConfig> = {
  Pro1: {
    name: "Pro1",
    tierRatios: convertTierRatios(TIER_RATIOS.Pro1),
    buyThreshold: percentToThreshold(BUY_THRESHOLDS.Pro1),
    sellThreshold: percentToThreshold(SELL_THRESHOLDS.Pro1),
    stopLossDay: STOP_LOSS_DAYS.Pro1,
  },
  Pro2: {
    name: "Pro2",
    tierRatios: convertTierRatios(TIER_RATIOS.Pro2),
    buyThreshold: percentToThreshold(BUY_THRESHOLDS.Pro2),
    sellThreshold: percentToThreshold(SELL_THRESHOLDS.Pro2),
    stopLossDay: STOP_LOSS_DAYS.Pro2,
  },
  Pro3: {
    name: "Pro3",
    tierRatios: convertTierRatios(TIER_RATIOS.Pro3),
    buyThreshold: percentToThreshold(BUY_THRESHOLDS.Pro3),
    sellThreshold: percentToThreshold(SELL_THRESHOLDS.Pro3),
    stopLossDay: STOP_LOSS_DAYS.Pro3,
  },
};

/**
 * 전략 이름으로 전략 설정을 반환
 *
 * @param name - 전략 이름 (Pro1, Pro2, Pro3)
 * @returns 해당 전략의 설정
 */
export function getStrategy(name: StrategyName): StrategyConfig {
  return PRO_STRATEGIES[name];
}
