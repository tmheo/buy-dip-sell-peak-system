/**
 * RPM 유사도 계산 테스트
 * SPEC-RPM-EXPERIMENT-001 TASK-007
 */
import { describe, it, expect } from "vitest";

import type { RpmIndicators, RpmSimilarityConfig } from "../types";
import {
  calculateIndicatorScore,
  calculateRpmSimilarity,
  findRpmSimilarPeriods,
  calculateScoreDifference,
  getTotalMaxScore,
  DEFAULT_RPM_CONFIG,
  MIN_PAST_GAP_DAYS,
  MIN_PERIOD_GAP_DAYS,
} from "../rpm-similarity";

// ============================================================
// Helper Functions
// ============================================================

/**
 * 테스트용 기본 RPM 지표 생성
 */
function createTestIndicators(overrides: Partial<RpmIndicators> = {}): RpmIndicators {
  return {
    rsi14: 50,
    disparity20: 0,
    roc10: 0,
    macdHistogram: 0,
    bollingerWidth: 0.2,
    atrPercent: 5,
    disparity60: 0,
    stochasticK: 50,
    ...overrides,
  };
}

/**
 * 테스트용 과거 데이터 생성
 */
function createHistoricalData(
  count: number,
  startDate: string = "2024-01-01"
): Array<{ date: string; indicators: RpmIndicators }> {
  const data: Array<{ date: string; indicators: RpmIndicators }> = [];
  const start = new Date(startDate);

  for (let i = 0; i < count; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];

    // 다양한 지표 값 생성
    data.push({
      date: dateStr,
      indicators: createTestIndicators({
        rsi14: 30 + (i % 40), // 30~70 변동
        disparity20: -10 + (i % 20), // -10~10 변동
        roc10: -15 + (i % 30), // -15~15 변동
        macdHistogram: -1 + (i % 10) * 0.2, // -1~1 변동
        bollingerWidth: 0.1 + (i % 10) * 0.05, // 0.1~0.6 변동
        atrPercent: 3 + (i % 10) * 0.5, // 3~8 변동
        disparity60: -20 + (i % 40), // -20~20 변동
        stochasticK: 20 + (i % 60), // 20~80 변동
      }),
    });
  }

  return data;
}

// ============================================================
// DEFAULT_RPM_CONFIG Tests
// ============================================================

describe("DEFAULT_RPM_CONFIG", () => {
  it("총 배점이 470점이어야 한다", () => {
    const totalScore = getTotalMaxScore(DEFAULT_RPM_CONFIG);
    expect(totalScore).toBe(470);
  });

  it("8개 지표에 대한 가중치가 정의되어야 한다", () => {
    const weights = DEFAULT_RPM_CONFIG.weights;
    expect(weights).toHaveProperty("rsi14");
    expect(weights).toHaveProperty("disparity20");
    expect(weights).toHaveProperty("roc10");
    expect(weights).toHaveProperty("macdHistogram");
    expect(weights).toHaveProperty("bollingerWidth");
    expect(weights).toHaveProperty("atrPercent");
    expect(weights).toHaveProperty("disparity60");
    expect(weights).toHaveProperty("stochasticK");
  });

  it("RSI 14 배점이 120점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.rsi14.maxScore).toBe(120);
    expect(DEFAULT_RPM_CONFIG.weights.rsi14.tolerance).toBe(30);
  });

  it("이격도 20 배점이 80점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.disparity20.maxScore).toBe(80);
    expect(DEFAULT_RPM_CONFIG.weights.disparity20.tolerance).toBe(10);
  });

  it("ROC 10 배점이 80점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.roc10.maxScore).toBe(80);
    expect(DEFAULT_RPM_CONFIG.weights.roc10.tolerance).toBe(15);
  });

  it("MACD Histogram 배점이 50점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.macdHistogram.maxScore).toBe(50);
    expect(DEFAULT_RPM_CONFIG.weights.macdHistogram.tolerance).toBe(2.0);
  });

  it("변동성폭 배점이 50점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.bollingerWidth.maxScore).toBe(50);
    expect(DEFAULT_RPM_CONFIG.weights.bollingerWidth.tolerance).toBe(0.3);
  });

  it("ATR % 배점이 50점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.atrPercent.maxScore).toBe(50);
    expect(DEFAULT_RPM_CONFIG.weights.atrPercent.tolerance).toBe(5);
  });

  it("이격도 60 배점이 20점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.disparity60.maxScore).toBe(20);
    expect(DEFAULT_RPM_CONFIG.weights.disparity60.tolerance).toBe(20);
  });

  it("스토캐스틱 K 배점이 20점이어야 한다", () => {
    expect(DEFAULT_RPM_CONFIG.weights.stochasticK.maxScore).toBe(20);
    expect(DEFAULT_RPM_CONFIG.weights.stochasticK.tolerance).toBe(30);
  });
});

// ============================================================
// calculateIndicatorScore Tests
// ============================================================

describe("calculateIndicatorScore", () => {
  it("동일한 값이면 최대 점수를 반환해야 한다", () => {
    const score = calculateIndicatorScore(50, 50, 120, 30);
    expect(score).toBe(120);
  });

  it("차이가 허용오차와 같으면 0점을 반환해야 한다", () => {
    // 차이 = 30, 허용오차 = 30
    // 점수 = 120 * (1 - 30/30) = 120 * 0 = 0
    const score = calculateIndicatorScore(50, 80, 120, 30);
    expect(score).toBe(0);
  });

  it("차이가 허용오차보다 크면 음수를 반환해야 한다", () => {
    // 차이 = 60, 허용오차 = 30
    // 점수 = 120 * (1 - 60/30) = 120 * (1 - 2) = 120 * -1 = -120
    const score = calculateIndicatorScore(50, 110, 120, 30);
    expect(score).toBe(-120);
  });

  it("차이가 허용오차의 절반이면 절반 점수를 반환해야 한다", () => {
    // 차이 = 15, 허용오차 = 30
    // 점수 = 120 * (1 - 15/30) = 120 * 0.5 = 60
    const score = calculateIndicatorScore(50, 65, 120, 30);
    expect(score).toBe(60);
  });

  it("음수 값도 올바르게 처리해야 한다", () => {
    // 차이 = |-10 - 10| = 20, 허용오차 = 10
    // 점수 = 80 * (1 - 20/10) = 80 * (1 - 2) = -80
    const score = calculateIndicatorScore(-10, 10, 80, 10);
    expect(score).toBe(-80);
  });

  it("소수점 2자리까지 정밀도를 유지해야 한다", () => {
    // 차이 = 10, 허용오차 = 30
    // 점수 = 120 * (1 - 10/30) = 120 * 0.6666... = 79.99...
    const score = calculateIndicatorScore(50, 60, 120, 30);
    expect(score).toBeCloseTo(80, 1);
  });
});

// ============================================================
// calculateRpmSimilarity Tests
// ============================================================

describe("calculateRpmSimilarity", () => {
  it("동일한 지표면 총 배점(470점)을 반환해야 한다", () => {
    const indicators = createTestIndicators();
    const score = calculateRpmSimilarity(indicators, indicators);
    expect(score).toBe(470);
  });

  it("완전히 다른 지표면 음수 점수를 반환할 수 있다", () => {
    const ref = createTestIndicators({
      rsi14: 20,
      disparity20: -20,
      roc10: -30,
      macdHistogram: -3,
      bollingerWidth: 0.1,
      atrPercent: 2,
      disparity60: -40,
      stochasticK: 10,
    });
    const compare = createTestIndicators({
      rsi14: 80,
      disparity20: 30,
      roc10: 30,
      macdHistogram: 3,
      bollingerWidth: 0.9,
      atrPercent: 15,
      disparity60: 40,
      stochasticK: 90,
    });

    const score = calculateRpmSimilarity(ref, compare);
    expect(score).toBeLessThan(0);
  });

  it("점수 범위가 -500 ~ +500 근처여야 한다", () => {
    // 최대 점수: 470 (모든 지표 동일)
    // 최소 점수: 차이가 매우 크면 음수
    const ref = createTestIndicators();
    const same = createTestIndicators();
    const maxScore = calculateRpmSimilarity(ref, same);

    expect(maxScore).toBe(470);
    expect(maxScore).toBeLessThanOrEqual(500);
    expect(maxScore).toBeGreaterThanOrEqual(-500);
  });

  it("부분적으로 유사한 지표면 중간 점수를 반환해야 한다", () => {
    const ref = createTestIndicators({ rsi14: 50, disparity20: 0 });
    const compare = createTestIndicators({ rsi14: 65, disparity20: 5 }); // RSI 차이 15, 이격도 차이 5

    const score = calculateRpmSimilarity(ref, compare);

    // RSI: 120 * (1 - 15/30) = 60
    // 이격도20: 80 * (1 - 5/10) = 40
    // 나머지 6개 지표는 동일 = 50+50+50+20+20 = 190
    // 총: 60 + 40 + 190 + 80 = 370
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(470);
  });

  it("커스텀 설정을 사용할 수 있어야 한다", () => {
    const customConfig: RpmSimilarityConfig = {
      weights: {
        rsi14: { maxScore: 100, tolerance: 20 },
        disparity20: { maxScore: 100, tolerance: 10 },
        roc10: { maxScore: 100, tolerance: 15 },
        macdHistogram: { maxScore: 100, tolerance: 2 },
        bollingerWidth: { maxScore: 100, tolerance: 0.3 },
        atrPercent: { maxScore: 100, tolerance: 5 },
        disparity60: { maxScore: 100, tolerance: 20 },
        stochasticK: { maxScore: 100, tolerance: 30 },
      },
    };

    const indicators = createTestIndicators();
    const score = calculateRpmSimilarity(indicators, indicators, customConfig);

    // 커스텀 총 배점: 800
    expect(score).toBe(800);
  });

  it("소수점 2자리까지 정밀도를 유지해야 한다", () => {
    const ref = createTestIndicators({ rsi14: 50 });
    const compare = createTestIndicators({ rsi14: 53 });

    const score = calculateRpmSimilarity(ref, compare);
    const decimalPart = score.toString().split(".")[1] || "";
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================
// findRpmSimilarPeriods Tests
// ============================================================

describe("findRpmSimilarPeriods", () => {
  it("올바른 수의 유사 구간을 반환해야 한다", () => {
    const data = createHistoricalData(100);
    const refDate = "2024-04-10"; // 100일 중 대략 100번째
    const refIndicators = createTestIndicators({ rsi14: 50 });

    const results = findRpmSimilarPeriods(refDate, refIndicators, data, 5);

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("기준일보다 최소 40일 이전의 데이터만 검색해야 한다", () => {
    const data = createHistoricalData(100);
    const refDate = "2024-04-10"; // 인덱스 약 99
    const refIndicators = createTestIndicators();

    const results = findRpmSimilarPeriods(
      refDate,
      refIndicators,
      data,
      10,
      MIN_PERIOD_GAP_DAYS,
      MIN_PAST_GAP_DAYS
    );

    // 모든 결과가 기준일보다 40일 이전이어야 함
    const refIndex = data.findIndex((d) => d.date === refDate);
    for (const result of results) {
      expect(result.dateIndex).toBeLessThanOrEqual(refIndex - MIN_PAST_GAP_DAYS);
    }
  });

  it("유사 구간 간 최소 간격을 유지해야 한다", () => {
    const data = createHistoricalData(200);
    const refDate = "2024-07-18"; // 인덱스 약 199
    const refIndicators = createTestIndicators();

    const results = findRpmSimilarPeriods(refDate, refIndicators, data, 10, MIN_PERIOD_GAP_DAYS);

    // 선택된 구간들 간의 간격 확인
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const gap = Math.abs(results[i].dateIndex - results[j].dateIndex);
        expect(gap).toBeGreaterThanOrEqual(MIN_PERIOD_GAP_DAYS);
      }
    }
  });

  it("유사도 점수 내림차순으로 정렬되어야 한다", () => {
    const data = createHistoricalData(100);
    const refDate = "2024-04-10";
    const refIndicators = createTestIndicators();

    const results = findRpmSimilarPeriods(refDate, refIndicators, data, 5, 5); // 작은 간격으로 테스트

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarityScore).toBeGreaterThanOrEqual(results[i + 1].similarityScore);
    }
  });

  it("기준일이 데이터에 없으면 빈 배열을 반환해야 한다", () => {
    const data = createHistoricalData(50);
    const refDate = "2025-01-01"; // 데이터 범위 밖
    const refIndicators = createTestIndicators();

    const results = findRpmSimilarPeriods(refDate, refIndicators, data);

    expect(results).toEqual([]);
  });

  it("과거 데이터가 충분하지 않으면 빈 배열을 반환해야 한다", () => {
    const data = createHistoricalData(30); // 30일 데이터
    const refDate = "2024-01-30"; // 인덱스 29
    const refIndicators = createTestIndicators();

    // minDaysBack = 40이면 검색 불가
    const results = findRpmSimilarPeriods(refDate, refIndicators, data, 10, 20, 40);

    expect(results).toEqual([]);
  });

  it("결과에 날짜, 인덱스, 지표, 점수가 포함되어야 한다", () => {
    const data = createHistoricalData(100);
    const refDate = "2024-04-10";
    const refIndicators = createTestIndicators();

    const results = findRpmSimilarPeriods(refDate, refIndicators, data, 1);

    if (results.length > 0) {
      expect(results[0]).toHaveProperty("date");
      expect(results[0]).toHaveProperty("dateIndex");
      expect(results[0]).toHaveProperty("indicators");
      expect(results[0]).toHaveProperty("similarityScore");
      expect(results[0]).toHaveProperty("scoreDifference");
    }
  });

  it("커스텀 minGap을 사용할 수 있어야 한다", () => {
    const data = createHistoricalData(200);
    const refDate = "2024-07-18";
    const refIndicators = createTestIndicators();

    const customGap = 30;
    const results = findRpmSimilarPeriods(refDate, refIndicators, data, 10, customGap);

    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const gap = Math.abs(results[i].dateIndex - results[j].dateIndex);
        expect(gap).toBeGreaterThanOrEqual(customGap);
      }
    }
  });
});

// ============================================================
// calculateScoreDifference Tests
// ============================================================

describe("calculateScoreDifference", () => {
  it("동일한 지표면 차이가 0이어야 한다", () => {
    const indicators = createTestIndicators();
    const diff = calculateScoreDifference(indicators, indicators);
    expect(diff).toBe(0);
  });

  it("다른 지표면 양수 차이를 반환해야 한다", () => {
    const ref = createTestIndicators({ rsi14: 50 });
    const compare = createTestIndicators({ rsi14: 65 });

    const diff = calculateScoreDifference(ref, compare);
    expect(diff).toBeGreaterThan(0);
  });

  it("점수 차이는 항상 양수여야 한다 (절대값)", () => {
    const ref = createTestIndicators({ rsi14: 50 });
    const compare = createTestIndicators({ rsi14: 35 });

    const diff = calculateScoreDifference(ref, compare);
    expect(diff).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// getTotalMaxScore Tests
// ============================================================

describe("getTotalMaxScore", () => {
  it("기본 설정의 총 배점이 470점이어야 한다", () => {
    const total = getTotalMaxScore();
    expect(total).toBe(470);
  });

  it("커스텀 설정의 총 배점을 계산해야 한다", () => {
    const customConfig: RpmSimilarityConfig = {
      weights: {
        rsi14: { maxScore: 100, tolerance: 20 },
        disparity20: { maxScore: 100, tolerance: 10 },
        roc10: { maxScore: 100, tolerance: 15 },
        macdHistogram: { maxScore: 100, tolerance: 2 },
        bollingerWidth: { maxScore: 100, tolerance: 0.3 },
        atrPercent: { maxScore: 100, tolerance: 5 },
        disparity60: { maxScore: 100, tolerance: 20 },
        stochasticK: { maxScore: 100, tolerance: 30 },
      },
    };

    const total = getTotalMaxScore(customConfig);
    expect(total).toBe(800);
  });
});

// ============================================================
// Constants Tests
// ============================================================

describe("Constants", () => {
  it("MIN_PAST_GAP_DAYS가 40이어야 한다", () => {
    expect(MIN_PAST_GAP_DAYS).toBe(40);
  });

  it("MIN_PERIOD_GAP_DAYS가 20이어야 한다", () => {
    expect(MIN_PERIOD_GAP_DAYS).toBe(20);
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe("Integration: 유사도 점수 검증", () => {
  it("26.01.23 기준 유사도 점수 약 370점 검증 (근사치)", () => {
    // SPEC에서 정의한 검증 케이스 (블로그 값 기준)
    // 실제 검증은 실제 SOXL 데이터로 수행해야 하므로 여기서는 패턴만 테스트
    const reference = createTestIndicators({
      rsi14: 65.81,
      disparity20: 16.7,
      roc10: 24.1,
      macdHistogram: 0.93,
      bollingerWidth: 0.53,
      atrPercent: 6.86,
      disparity60: 34.62,
      stochasticK: 71.5,
    });

    // 유사한 과거 구간 (가상 데이터)
    const similar = createTestIndicators({
      rsi14: 60, // 차이 5.81
      disparity20: 12, // 차이 4.7
      roc10: 20, // 차이 4.1
      macdHistogram: 0.5, // 차이 0.43
      bollingerWidth: 0.45, // 차이 0.08
      atrPercent: 5.5, // 차이 1.36
      disparity60: 30, // 차이 4.62
      stochasticK: 65, // 차이 6.5
    });

    const score = calculateRpmSimilarity(reference, similar);

    // 대략적인 점수 계산:
    // RSI: 120 * (1 - 5.81/30) = 120 * 0.806 = 96.7
    // 이격도20: 80 * (1 - 4.7/10) = 80 * 0.53 = 42.4
    // ROC10: 80 * (1 - 4.1/15) = 80 * 0.726 = 58.1
    // MACD: 50 * (1 - 0.43/2) = 50 * 0.785 = 39.25
    // 변동성폭: 50 * (1 - 0.08/0.3) = 50 * 0.733 = 36.65
    // ATR: 50 * (1 - 1.36/5) = 50 * 0.728 = 36.4
    // 이격도60: 20 * (1 - 4.62/20) = 20 * 0.769 = 15.38
    // 스토캐스틱: 20 * (1 - 6.5/30) = 20 * 0.783 = 15.66
    // 총: 약 340.5점

    expect(score).toBeGreaterThan(300);
    expect(score).toBeLessThan(400);
  });

  it("완전 동일 지표는 470점을 반환해야 한다", () => {
    const indicators = createTestIndicators({
      rsi14: 65.81,
      disparity20: 16.7,
      roc10: 24.1,
      macdHistogram: 0.93,
      bollingerWidth: 0.53,
      atrPercent: 6.86,
      disparity60: 34.62,
      stochasticK: 71.5,
    });

    const score = calculateRpmSimilarity(indicators, indicators);
    expect(score).toBe(470);
  });
});
