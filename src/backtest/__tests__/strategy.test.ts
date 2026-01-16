/**
 * strategy.ts 단위 테스트
 * SPEC-BACKTEST-001 REQ-001
 */
import { describe, it, expect } from "vitest";
import { PRO_STRATEGIES, getStrategy } from "../strategy";
import type { StrategyName } from "../types";

describe("PRO_STRATEGIES", () => {
  describe("Pro1 전략", () => {
    it("tierRatios가 5%, 10%, 15%, 20%, 25%, 25%이어야 한다", () => {
      const pro1 = PRO_STRATEGIES.Pro1;
      expect(pro1.tierRatios).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.25]);
    });

    it("tierRatios 합계가 100%이어야 한다", () => {
      const pro1 = PRO_STRATEGIES.Pro1;
      const sum = pro1.tierRatios.reduce((acc, ratio) => acc + ratio, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it("buyThreshold가 -0.01% (-0.0001)이어야 한다", () => {
      const pro1 = PRO_STRATEGIES.Pro1;
      expect(pro1.buyThreshold).toBe(-0.0001);
    });

    it("sellThreshold가 +0.01% (+0.0001)이어야 한다", () => {
      const pro1 = PRO_STRATEGIES.Pro1;
      expect(pro1.sellThreshold).toBe(0.0001);
    });

    it("stopLossDay가 10일이어야 한다", () => {
      const pro1 = PRO_STRATEGIES.Pro1;
      expect(pro1.stopLossDay).toBe(10);
    });

    it("name이 'Pro1'이어야 한다", () => {
      const pro1 = PRO_STRATEGIES.Pro1;
      expect(pro1.name).toBe("Pro1");
    });
  });

  describe("Pro2 전략", () => {
    it("tierRatios가 10%, 15%, 20%, 25%, 20%, 10%이어야 한다", () => {
      const pro2 = PRO_STRATEGIES.Pro2;
      expect(pro2.tierRatios).toEqual([0.1, 0.15, 0.2, 0.25, 0.2, 0.1]);
    });

    it("tierRatios 합계가 100%이어야 한다", () => {
      const pro2 = PRO_STRATEGIES.Pro2;
      const sum = pro2.tierRatios.reduce((acc, ratio) => acc + ratio, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it("buyThreshold가 -0.01% (-0.0001)이어야 한다", () => {
      const pro2 = PRO_STRATEGIES.Pro2;
      expect(pro2.buyThreshold).toBe(-0.0001);
    });

    it("sellThreshold가 +1.50% (+0.015)이어야 한다", () => {
      const pro2 = PRO_STRATEGIES.Pro2;
      expect(pro2.sellThreshold).toBe(0.015);
    });

    it("stopLossDay가 10일이어야 한다", () => {
      const pro2 = PRO_STRATEGIES.Pro2;
      expect(pro2.stopLossDay).toBe(10);
    });

    it("name이 'Pro2'이어야 한다", () => {
      const pro2 = PRO_STRATEGIES.Pro2;
      expect(pro2.name).toBe("Pro2");
    });
  });

  describe("Pro3 전략", () => {
    it("tierRatios가 16.7% x 6 (균등 분배)이어야 한다", () => {
      const pro3 = PRO_STRATEGIES.Pro3;
      const expectedRatio = 1 / 6;
      pro3.tierRatios.forEach((ratio) => {
        expect(ratio).toBeCloseTo(expectedRatio, 10);
      });
    });

    it("tierRatios 합계가 100%이어야 한다", () => {
      const pro3 = PRO_STRATEGIES.Pro3;
      const sum = pro3.tierRatios.reduce((acc, ratio) => acc + ratio, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it("buyThreshold가 -0.10% (-0.001)이어야 한다", () => {
      const pro3 = PRO_STRATEGIES.Pro3;
      expect(pro3.buyThreshold).toBe(-0.001);
    });

    it("sellThreshold가 +2.00% (+0.02)이어야 한다", () => {
      const pro3 = PRO_STRATEGIES.Pro3;
      expect(pro3.sellThreshold).toBe(0.02);
    });

    it("stopLossDay가 12일이어야 한다", () => {
      const pro3 = PRO_STRATEGIES.Pro3;
      expect(pro3.stopLossDay).toBe(12);
    });

    it("name이 'Pro3'이어야 한다", () => {
      const pro3 = PRO_STRATEGIES.Pro3;
      expect(pro3.name).toBe("Pro3");
    });
  });
});

describe("getStrategy", () => {
  it("Pro1 전략을 반환해야 한다", () => {
    const strategy = getStrategy("Pro1");
    expect(strategy).toBe(PRO_STRATEGIES.Pro1);
    expect(strategy.name).toBe("Pro1");
  });

  it("Pro2 전략을 반환해야 한다", () => {
    const strategy = getStrategy("Pro2");
    expect(strategy).toBe(PRO_STRATEGIES.Pro2);
    expect(strategy.name).toBe("Pro2");
  });

  it("Pro3 전략을 반환해야 한다", () => {
    const strategy = getStrategy("Pro3");
    expect(strategy).toBe(PRO_STRATEGIES.Pro3);
    expect(strategy.name).toBe("Pro3");
  });

  it("모든 전략 이름으로 호출 시 올바른 전략을 반환해야 한다", () => {
    const strategyNames: StrategyName[] = ["Pro1", "Pro2", "Pro3"];
    strategyNames.forEach((name) => {
      const strategy = getStrategy(name);
      expect(strategy.name).toBe(name);
    });
  });
});
