/**
 * 유사도 계산 모듈 테스트
 * #55: 전역 상태 없이 SimilarityConfig 인자로 가중치·허용치를 받는다
 */
import { describe, it, expect } from "vitest";

import type { TechnicalMetrics } from "@/backtest/types";

import { calculateExponentialSimilarity, findSimilarPeriodsWithDates } from "../similarity";
import type { HistoricalMetrics, SimilarityConfig } from "../types";

/** 테스트용 기술적 지표 생성 (미지정 필드는 기준값과 동일) */
function metrics(overrides: Partial<TechnicalMetrics> = {}): TechnicalMetrics {
  return {
    goldenCross: 0,
    isGoldenCross: false,
    maSlope: 0,
    disparity: 100,
    rsi14: 50,
    roc12: 0,
    volatility20: 0.3,
    ...overrides,
  };
}

function historical(date: string, dateIndex: number, m: TechnicalMetrics): HistoricalMetrics {
  return { date, dateIndex, metrics: m };
}

describe("calculateExponentialSimilarity", () => {
  it("config 없이 호출하면 기본 가중치로 계산한다 (동일 벡터는 100점)", () => {
    const vector = [10, 100, 50, 5, 30];

    // 기본 가중치 합이 1이므로 sum(w_i * 100 * exp(0)) = 100
    expect(calculateExponentialSimilarity(vector, vector)).toBe(100);
  });

  it("SimilarityConfig를 인자로 받아 해당 가중치·허용치로 계산한다", () => {
    const config: SimilarityConfig = {
      weights: [1, 0, 0, 0, 0],
      tolerances: [10, 1, 1, 1, 1],
    };

    // 첫 지표만 가중치 1, 차이 10, 허용치 10
    // 유사도 = 1 * 100 * exp(-10/10) = 100 * exp(-1) = 36.7879... → 36.79
    const similarity = calculateExponentialSimilarity([10, 0, 0, 0, 0], [0, 0, 0, 0, 0], config);

    expect(similarity).toBe(36.79);
  });
});

describe("findSimilarPeriodsWithDates", () => {
  // 기준: maSlope=0, rsi14=50
  // 후보 A: rsi14는 기준과 일치, maSlope는 크게 다름
  // 후보 B: maSlope는 기준과 일치, rsi14는 크게 다름
  const reference = metrics();
  const candidateA = historical("2024-01-02", 0, metrics({ maSlope: 50 }));
  const candidateB = historical("2024-03-04", 40, metrics({ rsi14: 90 }));
  const candidates = [candidateA, candidateB];

  it("similarityConfig의 가중치에 따라 상위 구간이 달라진다", () => {
    const rsiOnly: SimilarityConfig = {
      weights: [0, 0, 1, 0, 0],
      tolerances: [10, 10, 10, 10, 10],
    };
    const maSlopeOnly: SimilarityConfig = {
      weights: [1, 0, 0, 0, 0],
      tolerances: [10, 10, 10, 10, 10],
    };

    const byRsi = findSimilarPeriodsWithDates(reference, candidates, 1, {
      similarityConfig: rsiOnly,
    });
    const byMaSlope = findSimilarPeriodsWithDates(reference, candidates, 1, {
      similarityConfig: maSlopeOnly,
    });

    expect(byRsi[0].endDate).toBe(candidateA.date);
    expect(byMaSlope[0].endDate).toBe(candidateB.date);
  });

  it("커스텀 설정으로 호출한 뒤에도 기본 설정 결과가 변하지 않는다 (전역 상태 없음)", () => {
    const before = findSimilarPeriodsWithDates(reference, candidates, 2);

    findSimilarPeriodsWithDates(reference, candidates, 2, {
      similarityConfig: {
        weights: [1, 0, 0, 0, 0],
        tolerances: [1, 1, 1, 1, 1],
      },
    });

    const after = findSimilarPeriodsWithDates(reference, candidates, 2);

    expect(after).toEqual(before);
  });
});
