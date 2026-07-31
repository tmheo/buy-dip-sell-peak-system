/**
 * 전략 파라미터 표 테스트
 * #43: 흩어진 전략 파라미터 표를 src/strategy가 단일 소유한다.
 *
 * 기대값 출처: #43 확정 파라미터 표
 * | Parameter     | Pro1                        | Pro2                         | Pro3      |
 * |---------------|-----------------------------|------------------------------|-----------|
 * | tierRatios    | 5%, 10%, 15%, 20%, 25%, 25% | 10%, 15%, 20%, 25%, 20%, 10% | 1/6 x 6   |
 * | buyThreshold  | -0.01%                      | -0.01%                       | -0.10%    |
 * | sellThreshold | +0.01%                      | +1.50%                       | +2.00%    |
 * | stopLossDays  | 10                          | 10                           | 12        |
 */
import { describe, it, expect } from "vitest";
import { getStrategyParams, PRO_STRATEGIES } from "../params";

describe("전략 파라미터 표", () => {
  it("Pro1 파라미터를 반환해야 한다", () => {
    const params = getStrategyParams("Pro1");
    expect(params.name).toBe("Pro1");
    expect(params.tierRatios).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.25]);
    expect(params.buyThreshold).toBe(-0.0001);
    expect(params.sellThreshold).toBe(0.0001);
    expect(params.stopLossDays).toBe(10);
  });

  it("Pro2 파라미터를 반환해야 한다", () => {
    const params = getStrategyParams("Pro2");
    expect(params.name).toBe("Pro2");
    expect(params.tierRatios).toEqual([0.1, 0.15, 0.2, 0.25, 0.2, 0.1]);
    expect(params.buyThreshold).toBe(-0.0001);
    expect(params.sellThreshold).toBe(0.015);
    expect(params.stopLossDays).toBe(10);
  });

  it("Pro3 파라미터를 반환해야 한다", () => {
    const params = getStrategyParams("Pro3");
    expect(params.name).toBe("Pro3");
    // 균등 분할: 각 티어 1/6
    for (const ratio of params.tierRatios) {
      expect(ratio).toBeCloseTo(1 / 6, 10);
    }
    expect(params.buyThreshold).toBe(-0.001);
    expect(params.sellThreshold).toBe(0.02);
    expect(params.stopLossDays).toBe(12);
  });

  it("기본 티어 비율의 합은 1이어야 한다 (사이클 자본 전액 배분)", () => {
    for (const strategy of ["Pro1", "Pro2", "Pro3"] as const) {
      const sum = PRO_STRATEGIES[strategy].tierRatios.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});
