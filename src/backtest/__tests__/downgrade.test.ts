/**
 * downgrade.ts 단위 테스트
 * SOXL 전략 하향 규칙
 */
import { describe, it, expect, vi } from "vitest";
import { applySOXLDowngrade, checkDivergenceCondition, formatDowngradeReason } from "../downgrade";
import type { TechnicalMetrics } from "../types";
import type { DowngradeResult } from "../downgrade";
import * as divergenceModule from "../divergence";

/** 기본 기술적 지표 (테스트용) */
function createMetrics(overrides: Partial<TechnicalMetrics> = {}): TechnicalMetrics {
  return {
    goldenCross: 0,
    isGoldenCross: false,
    maSlope: 0,
    disparity: 0,
    rsi14: 50,
    roc12: 0,
    volatility20: 0,
    ...overrides,
  };
}

/** 테스트용 가격 배열 생성 (60일치) */
function createTestPrices(): number[] {
  const prices: number[] = [];
  for (let i = 0; i < 60; i++) {
    prices.push(100 + i * 0.5);
  }
  return prices;
}

describe("applySOXLDowngrade", () => {
  it("조건이 없으면 원본 전략을 반환해야 한다", () => {
    const metrics = createMetrics({ rsi14: 50, isGoldenCross: true });
    const prices = createTestPrices();

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    expect(result.strategy).toBe("Pro3");
    expect(result.applied).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.hasDivergenceCondition).toBe(false);
  });

  it("조건 1 (RSI >= 60 AND 역배열) 충족 시 하향해야 한다", () => {
    const metrics = createMetrics({ rsi14: 65, isGoldenCross: false });
    const prices = createTestPrices();

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    expect(result.strategy).toBe("Pro2");
    expect(result.applied).toBe(true);
    expect(result.originalStrategy).toBe("Pro3");
    expect(result.reasons).toContain("RSI≥60 & 역배열");
  });

  it("Pro2에서 조건 1 충족 시 Pro1으로 하향해야 한다", () => {
    const metrics = createMetrics({ rsi14: 60, isGoldenCross: false });
    const prices = createTestPrices();

    const result = applySOXLDowngrade("Pro2", metrics, prices, 59);

    expect(result.strategy).toBe("Pro1");
    expect(result.applied).toBe(true);
    expect(result.originalStrategy).toBe("Pro2");
  });

  it("Pro1은 하향하지 않아야 한다", () => {
    const metrics = createMetrics({ rsi14: 70, isGoldenCross: false });
    const prices = createTestPrices();

    const result = applySOXLDowngrade("Pro1", metrics, prices, 59);

    expect(result.strategy).toBe("Pro1");
    expect(result.applied).toBe(false);
    expect(result.originalStrategy).toBeUndefined();
    expect(result.reasons).toContain("RSI≥60 & 역배열");
  });

  it("정배열 시 조건 1이 충족되지 않아야 한다", () => {
    const metrics = createMetrics({ rsi14: 70, isGoldenCross: true });
    const prices = createTestPrices();

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    // 정배열이면 조건 1 미충족
    expect(result.reasons).not.toContain("RSI≥60 & 역배열");
  });

  it("RSI < 60 시 조건 1이 충족되지 않아야 한다", () => {
    const metrics = createMetrics({ rsi14: 59, isGoldenCross: false });
    const prices = createTestPrices();

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    expect(result.reasons).not.toContain("RSI≥60 & 역배열");
  });

  it("조건 2 (다이버전스 AND 이격도<120 AND RSI>=60) 충족 시 하향해야 한다", () => {
    const metrics = createMetrics({ rsi14: 65, disparity: 15, isGoldenCross: true });
    const prices = createTestPrices();

    // detectBearishDivergence를 모킹
    vi.spyOn(divergenceModule, "detectBearishDivergence").mockReturnValue({
      hasBearishDivergence: true,
      priceHighIndices: [50, 55],
      priceHighs: [120, 125],
      rsiHighs: [70, 65],
    });

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    expect(result.strategy).toBe("Pro2");
    expect(result.applied).toBe(true);
    expect(result.reasons).toContain("RSI 다이버전스 & 이격도<120");
    expect(result.hasDivergenceCondition).toBe(true);

    vi.restoreAllMocks();
  });

  it("이격도 >= 20 시 조건 2가 충족되지 않아야 한다", () => {
    const metrics = createMetrics({ rsi14: 65, disparity: 25, isGoldenCross: true });
    const prices = createTestPrices();

    vi.spyOn(divergenceModule, "detectBearishDivergence").mockReturnValue({
      hasBearishDivergence: true,
      priceHighIndices: [50, 55],
      priceHighs: [120, 125],
      rsiHighs: [70, 65],
    });

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    expect(result.hasDivergenceCondition).toBe(false);
    expect(result.reasons).not.toContain("RSI 다이버전스 & 이격도<120");

    vi.restoreAllMocks();
  });

  it("RSI < 60 시 조건 2가 충족되지 않아야 한다", () => {
    const metrics = createMetrics({ rsi14: 55, disparity: 15, isGoldenCross: true });
    const prices = createTestPrices();

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    expect(result.hasDivergenceCondition).toBe(false);
    expect(result.reasons).not.toContain("RSI 다이버전스 & 이격도<120");
  });

  it("두 조건 모두 충족 시 한 번만 하향해야 한다", () => {
    const metrics = createMetrics({ rsi14: 65, disparity: 15, isGoldenCross: false });
    const prices = createTestPrices();

    vi.spyOn(divergenceModule, "detectBearishDivergence").mockReturnValue({
      hasBearishDivergence: true,
      priceHighIndices: [50, 55],
      priceHighs: [120, 125],
      rsiHighs: [70, 65],
    });

    const result = applySOXLDowngrade("Pro3", metrics, prices, 59);

    // Pro3 -> Pro2 (한 단계만 하향)
    expect(result.strategy).toBe("Pro2");
    expect(result.applied).toBe(true);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons).toContain("RSI≥60 & 역배열");
    expect(result.reasons).toContain("RSI 다이버전스 & 이격도<120");

    vi.restoreAllMocks();
  });
});

describe("checkDivergenceCondition", () => {
  it("조건 2 충족 시 true를 반환해야 한다", () => {
    const metrics = createMetrics({ rsi14: 65, disparity: 15 });
    const prices = createTestPrices();

    vi.spyOn(divergenceModule, "detectBearishDivergence").mockReturnValue({
      hasBearishDivergence: true,
      priceHighIndices: [50, 55],
      priceHighs: [120, 125],
      rsiHighs: [70, 65],
    });

    const result = checkDivergenceCondition(metrics, prices, 59);

    expect(result).toBe(true);

    vi.restoreAllMocks();
  });

  it("이격도 >= 20 시 false를 반환해야 한다", () => {
    const metrics = createMetrics({ rsi14: 65, disparity: 25 });
    const prices = createTestPrices();

    const result = checkDivergenceCondition(metrics, prices, 59);

    expect(result).toBe(false);
  });

  it("RSI < 60 시 false를 반환해야 한다", () => {
    const metrics = createMetrics({ rsi14: 55, disparity: 15 });
    const prices = createTestPrices();

    const result = checkDivergenceCondition(metrics, prices, 59);

    expect(result).toBe(false);
  });

  it("다이버전스가 없으면 false를 반환해야 한다", () => {
    const metrics = createMetrics({ rsi14: 65, disparity: 15 });
    const prices = createTestPrices();

    vi.spyOn(divergenceModule, "detectBearishDivergence").mockReturnValue({
      hasBearishDivergence: false,
      priceHighIndices: [],
      priceHighs: [],
      rsiHighs: [],
    });

    const result = checkDivergenceCondition(metrics, prices, 59);

    expect(result).toBe(false);

    vi.restoreAllMocks();
  });
});

describe("formatDowngradeReason", () => {
  it("하향이 적용되지 않으면 원본 reason을 반환해야 한다", () => {
    const baseReason = "평균 점수 10.5점";
    const result: DowngradeResult = {
      strategy: "Pro3",
      applied: false,
      reasons: [],
      hasDivergenceCondition: false,
    };

    const formatted = formatDowngradeReason(baseReason, result);

    expect(formatted).toBe(baseReason);
  });

  it("하향이 적용되면 하향 정보를 포함해야 한다", () => {
    const baseReason = "평균 점수 10.5점";
    const result: DowngradeResult = {
      strategy: "Pro2",
      applied: true,
      originalStrategy: "Pro3",
      reasons: ["RSI≥60 & 역배열"],
      hasDivergenceCondition: false,
    };

    const formatted = formatDowngradeReason(baseReason, result);

    expect(formatted).toBe("평균 점수 10.5점 (RSI≥60 & 역배열로 Pro3→Pro2 하향)");
  });

  it("여러 사유가 있으면 모두 포함해야 한다", () => {
    const baseReason = "평균 점수 10.5점";
    const result: DowngradeResult = {
      strategy: "Pro2",
      applied: true,
      originalStrategy: "Pro3",
      reasons: ["RSI≥60 & 역배열", "RSI 다이버전스 & 이격도<120"],
      hasDivergenceCondition: true,
    };

    const formatted = formatDowngradeReason(baseReason, result);

    expect(formatted).toContain("RSI≥60 & 역배열");
    expect(formatted).toContain("RSI 다이버전스 & 이격도<120");
    expect(formatted).toContain("Pro3→Pro2 하향");
  });
});
