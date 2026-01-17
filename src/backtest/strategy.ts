/**
 * 전략 매개변수 정의
 * SPEC-BACKTEST-001 REQ-001
 */
import type { StrategyConfig, StrategyName } from "./types";

/**
 * Pro 전략 설정 상수
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
    tierRatios: [0.05, 0.1, 0.15, 0.2, 0.25, 0.25],
    buyThreshold: -0.0001, // -0.01%
    sellThreshold: 0.0001, // +0.01%
    stopLossDay: 10,
  },
  Pro2: {
    name: "Pro2",
    tierRatios: [0.1, 0.15, 0.2, 0.25, 0.2, 0.1],
    buyThreshold: -0.0001, // -0.01%
    sellThreshold: 0.015, // +1.50%
    stopLossDay: 10,
  },
  Pro3: {
    name: "Pro3",
    tierRatios: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
    buyThreshold: -0.001, // -0.10%
    sellThreshold: 0.02, // +2.00%
    stopLossDay: 12,
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
