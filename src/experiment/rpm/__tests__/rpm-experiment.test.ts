/**
 * RPM 실험 실행기 테스트
 * SPEC-RPM-EXPERIMENT-001 TASK-009
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DailyPrice } from "@/types";
import { clearRecommendationCache } from "@/backtest-recommend/recommend-helper";

import {
  runBaselineBacktest,
  runRpmBacktest,
  runExperiment,
  extractMetrics,
  compareResults,
  calculateImprovement,
  calculateMddImprovement,
  formatComparisonReport,
  DEFAULT_EXPERIMENT_CONFIG,
  type ExperimentRunnerConfig,
} from "../rpm-experiment-runner";
import { clearRpmRecommendationCache } from "../rpm-recommend-engine";

// 테스트용 가격 데이터 생성 함수
function generateTestPrices(
  days: number,
  startPrice: number = 50,
  volatility: number = 0.02
): DailyPrice[] {
  const prices: DailyPrice[] = [];
  let price = startPrice;

  const startDate = new Date("2024-01-01");

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    // 주말 건너뛰기
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    // 랜덤 변동
    const change = (Math.random() - 0.5) * 2 * volatility;
    price = price * (1 + change);

    // 약간의 상승 트렌드
    price = price * 1.001;

    const dateStr = date.toISOString().split("T")[0];

    prices.push({
      date: dateStr,
      open: price * 0.99,
      high: price * 1.02,
      low: price * 0.98,
      close: price,
      adjClose: price,
      volume: 1000000,
    });
  }

  return prices;
}

describe("calculateImprovement", () => {
  it("기본 개선율을 올바르게 계산해야 한다", () => {
    // 25에서 30으로 20% 개선
    expect(calculateImprovement(25, 30)).toBe(20);
    // 25에서 20으로 -20% 개선 (악화)
    expect(calculateImprovement(25, 20)).toBe(-20);
  });

  it("베이스라인이 0일 때 처리해야 한다", () => {
    expect(calculateImprovement(0, 10)).toBe(100);
    expect(calculateImprovement(0, -10)).toBe(-100);
    expect(calculateImprovement(0, 0)).toBe(0);
  });

  it("음수 값에 대해서도 계산해야 한다", () => {
    // -20에서 -15로 (덜 음수) -> 개선
    // (-15 - (-20)) / |-20| * 100 = 5/20 * 100 = 25
    expect(calculateImprovement(-20, -15)).toBe(25);
    // -20에서 -25로 (더 음수) -> 악화
    expect(calculateImprovement(-20, -25)).toBe(-25);
  });
});

describe("calculateMddImprovement", () => {
  it("MDD 개선율을 올바르게 계산해야 한다", () => {
    // MDD -20%에서 -15%로 개선 (덜 빠짐)
    // (|-20| - |-15|) / |-20| * 100 = 5/20 * 100 = 25%
    expect(calculateMddImprovement(-0.2, -0.15)).toBe(25);
  });

  it("MDD 악화를 음수로 표시해야 한다", () => {
    // MDD -15%에서 -20%로 악화 (더 빠짐)
    // (|-15| - |-20|) / |-15| * 100 = -5/15 * 100 = -33.33%
    const result = calculateMddImprovement(-0.15, -0.2);
    expect(result).toBeLessThan(0);
  });

  it("베이스라인 MDD가 0일 때 처리해야 한다", () => {
    expect(calculateMddImprovement(0, -0.1)).toBe(-100);
    expect(calculateMddImprovement(0, 0)).toBe(0);
  });
});

describe("extractMetrics", () => {
  beforeEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  afterEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  it("백테스트 결과에서 메트릭을 올바르게 추출해야 한다", () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const result = runBaselineBacktest(prices, config);
    const metrics = extractMetrics(result);

    expect(metrics.returnRate).toBeDefined();
    expect(metrics.mdd).toBeDefined();
    expect(metrics.cagr).toBeDefined();
    expect(metrics.winRate).toBeDefined();
    expect(metrics.totalCycles).toBeDefined();
    expect(metrics.strategyScore).toBeDefined();

    // 수익률이 백테스트 결과와 일치해야 함
    expect(metrics.returnRate).toBe(result.returnRate);
    expect(metrics.mdd).toBe(result.mdd);
  });

  it("전략 점수가 올바르게 계산되어야 한다", () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const result = runBaselineBacktest(prices, config);
    const metrics = extractMetrics(result);

    // 전략 점수 공식: 수익률(%) * e^(MDD(%) * 0.01)
    // MDD가 음수이므로 점수는 수익률보다 작아야 함 (대부분의 경우)
    expect(typeof metrics.strategyScore).toBe("number");
    expect(isFinite(metrics.strategyScore)).toBe(true);
  });
});

describe("runBaselineBacktest", () => {
  beforeEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  afterEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  it("베이스라인 백테스트가 유효한 결과를 반환해야 한다", () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const result = runBaselineBacktest(prices, config);

    expect(result).toBeDefined();
    expect(result.initialCapital).toBe(10000);
    expect(result.finalAsset).toBeGreaterThan(0);
    expect(result.dailyHistory.length).toBeGreaterThan(0);
    expect(result.cycleStrategies.length).toBeGreaterThan(0);
  });

  it("시작일이 유효하지 않으면 에러를 발생시켜야 한다", () => {
    const prices = generateTestPrices(100);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: "2099-01-01", // 가격 데이터에 없는 날짜
      endDate: "2099-12-31",
      seedCapital: 10000,
    };

    expect(() => runBaselineBacktest(prices, config)).toThrow();
  });
});

describe("runRpmBacktest", () => {
  beforeEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  afterEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  it("RPM 백테스트가 유효한 결과를 반환해야 한다", { timeout: 30000 }, () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const result = runRpmBacktest(prices, config);

    expect(result).toBeDefined();
    expect(result.initialCapital).toBe(10000);
    expect(result.finalAsset).toBeGreaterThan(0);
    expect(result.dailyHistory.length).toBeGreaterThan(0);
    expect(result.cycleStrategies.length).toBeGreaterThan(0);
  });

  it("TQQQ 티커로도 실행되어야 한다", { timeout: 30000 }, () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "TQQQ",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const result = runRpmBacktest(prices, config);

    expect(result).toBeDefined();
    expect(result.dailyHistory.length).toBeGreaterThan(0);
  });
});

describe("compareResults", () => {
  beforeEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  afterEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  it("두 백테스트 결과를 비교하고 개선율을 계산해야 한다", { timeout: 30000 }, () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const baselineResult = runBaselineBacktest(prices, config);
    const rpmResult = runRpmBacktest(prices, config);
    const comparison = compareResults(baselineResult, rpmResult);

    expect(comparison).toBeDefined();
    expect(comparison.baseline).toBeDefined();
    expect(comparison.experimental).toBeDefined();
    expect(comparison.improvement).toBeDefined();

    expect(comparison.improvement.returnRate).toBeDefined();
    expect(comparison.improvement.mdd).toBeDefined();
    expect(comparison.improvement.strategyScore).toBeDefined();
  });

  it("베이스라인과 실험군 메트릭이 모두 포함되어야 한다", { timeout: 30000 }, () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const baselineResult = runBaselineBacktest(prices, config);
    const rpmResult = runRpmBacktest(prices, config);
    const comparison = compareResults(baselineResult, rpmResult);

    // 베이스라인 메트릭 확인
    expect(comparison.baseline.returnRate).toBe(baselineResult.returnRate);
    expect(comparison.baseline.mdd).toBe(baselineResult.mdd);

    // 실험군 메트릭 확인
    expect(comparison.experimental.returnRate).toBe(rpmResult.returnRate);
    expect(comparison.experimental.mdd).toBe(rpmResult.mdd);
  });
});

describe("runExperiment (integration)", () => {
  beforeEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  afterEach(() => {
    clearRecommendationCache();
    clearRpmRecommendationCache();
  });

  it("전체 실험을 실행하고 결과를 반환해야 한다", { timeout: 30000 }, () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    const result = runExperiment(prices, config, { verbose: false });

    expect(result).toBeDefined();
    expect(result.baseline).toBeDefined();
    expect(result.experimental).toBeDefined();
    expect(result.improvement).toBeDefined();
  });

  it("verbose 옵션이 false면 콘솔에 출력하지 않아야 한다", { timeout: 30000 }, () => {
    const prices = generateTestPrices(400);
    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: prices[150].date,
      endDate: prices[prices.length - 1].date,
      seedCapital: 10000,
    };

    // 콘솔 로그 모킹
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runExperiment(prices, config, { verbose: false });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("formatComparisonReport", () => {
  it("비교 리포트 문자열을 올바르게 생성해야 한다", () => {
    const mockResult = {
      baseline: {
        returnRate: 0.2532,
        mdd: -0.1523,
        cagr: 0.25,
        winRate: 0.6,
        totalCycles: 10,
        strategyScore: 21.45,
      },
      experimental: {
        returnRate: 0.2845,
        mdd: -0.1287,
        cagr: 0.28,
        winRate: 0.65,
        totalCycles: 10,
        strategyScore: 25.12,
      },
      improvement: {
        returnRate: 12.36,
        mdd: 15.5,
        strategyScore: 17.11,
      },
    };

    const report = formatComparisonReport(mockResult);

    expect(report).toContain("RPM 실험 결과 비교");
    expect(report).toContain("베이스라인");
    expect(report).toContain("RPM 방식");
    expect(report).toContain("개선율");
    expect(report).toContain("수익률");
    expect(report).toContain("MDD");
    expect(report).toContain("전략 점수");
  });

  it("설정 정보를 리포트에 포함해야 한다", () => {
    const mockResult = {
      baseline: {
        returnRate: 0.2,
        mdd: -0.15,
        cagr: 0.2,
        winRate: 0.6,
        totalCycles: 10,
        strategyScore: 20,
      },
      experimental: {
        returnRate: 0.25,
        mdd: -0.12,
        cagr: 0.25,
        winRate: 0.65,
        totalCycles: 10,
        strategyScore: 25,
      },
      improvement: {
        returnRate: 25,
        mdd: 20,
        strategyScore: 25,
      },
    };

    const config: ExperimentRunnerConfig = {
      ticker: "SOXL",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      seedCapital: 50000,
    };

    const report = formatComparisonReport(mockResult, config);

    expect(report).toContain("2025-01-01");
    expect(report).toContain("2025-12-31");
    expect(report).toContain("SOXL");
    expect(report).toContain("50,000");
  });
});

describe("DEFAULT_EXPERIMENT_CONFIG", () => {
  it("기본 설정값이 올바르게 정의되어야 한다", () => {
    expect(DEFAULT_EXPERIMENT_CONFIG.ticker).toBe("SOXL");
    expect(DEFAULT_EXPERIMENT_CONFIG.startDate).toBe("2025-01-01");
    expect(DEFAULT_EXPERIMENT_CONFIG.endDate).toBe("2025-12-31");
    expect(DEFAULT_EXPERIMENT_CONFIG.seedCapital).toBe(10000);
  });
});

// vi import for mocking
import { vi } from "vitest";
