/**
 * 전략 파라미터 표
 * #43: 흩어져 있던 전략 파라미터를 이 모듈이 단일 소유한다.
 *
 * | Parameter     | Pro1                        | Pro2                         | Pro3      |
 * |---------------|-----------------------------|------------------------------|-----------|
 * | tierRatios    | 5%, 10%, 15%, 20%, 25%, 25% | 10%, 15%, 20%, 25%, 20%, 10% | 1/6 x 6   |
 * | buyThreshold  | -0.01%                      | -0.01%                       | -0.10%    |
 * | sellThreshold | +0.01%                      | +1.50%                       | +2.00%    |
 * | stopLossDays  | 10                          | 10                           | 12        |
 */
import type { Strategy } from "@/types/trading";
import type { StrategyParams } from "./types";

/** Pro3 균등 분할 비율 (1/6) */
const PRO3_TIER_RATIO = 1 / 6;

/**
 * Pro 전략 파라미터 상수
 */
export const PRO_STRATEGIES: Record<Strategy, StrategyParams> = {
  Pro1: {
    name: "Pro1",
    tierRatios: [0.05, 0.1, 0.15, 0.2, 0.25, 0.25],
    buyThreshold: -0.0001,
    sellThreshold: 0.0001,
    stopLossDays: 10,
  },
  Pro2: {
    name: "Pro2",
    tierRatios: [0.1, 0.15, 0.2, 0.25, 0.2, 0.1],
    buyThreshold: -0.0001,
    sellThreshold: 0.015,
    stopLossDays: 10,
  },
  Pro3: {
    name: "Pro3",
    tierRatios: [
      PRO3_TIER_RATIO,
      PRO3_TIER_RATIO,
      PRO3_TIER_RATIO,
      PRO3_TIER_RATIO,
      PRO3_TIER_RATIO,
      PRO3_TIER_RATIO,
    ],
    buyThreshold: -0.001,
    sellThreshold: 0.02,
    stopLossDays: 12,
  },
};

/**
 * 전략 이름으로 파라미터를 반환
 *
 * @param name - 전략 이름 (Pro1, Pro2, Pro3)
 * @returns 해당 전략의 파라미터
 */
export function getStrategyParams(name: Strategy): StrategyParams {
  return PRO_STRATEGIES[name];
}
