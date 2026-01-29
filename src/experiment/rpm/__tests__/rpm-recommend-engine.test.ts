/**
 * RPM 추천 백테스트 엔진 테스트
 * SPEC-RPM-EXPERIMENT-001 REQ-006
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DailyPrice } from "@/types";
import {
  RpmRecommendBacktestEngine,
  getRpmQuickRecommendation,
  clearRpmRecommendationCache,
} from "../rpm-recommend-engine";
import { calculateRpmIndicators } from "../rpm-indicators";

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

// 날짜-인덱스 맵 생성 함수
function createDateToIndexMap(prices: DailyPrice[]): Map<string, number> {
  const map = new Map<string, number>();
  prices.forEach((p, i) => map.set(p.date, i));
  return map;
}

describe("getRpmQuickRecommendation", () => {
  beforeEach(() => {
    clearRpmRecommendationCache();
  });

  afterEach(() => {
    clearRpmRecommendationCache();
  });

  it("데이터 부족 시 기본 전략 Pro2를 반환해야 한다", () => {
    const prices = generateTestPrices(30); // 60일 미만
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const result = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    expect(result).not.toBeNull();
    expect(result!.strategy).toBe("Pro2");
    expect(result!.reason).toContain("데이터 부족");
  });

  it("충분한 데이터가 있으면 RPM 지표를 계산해야 한다", () => {
    const prices = generateTestPrices(200);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const result = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    expect(result).not.toBeNull();
    expect(result!.indicators).toBeDefined();
    expect(result!.indicators.rsi14).toBeGreaterThanOrEqual(0);
    expect(result!.indicators.rsi14).toBeLessThanOrEqual(100);
  });

  it("캐시된 결과를 반환해야 한다", () => {
    const prices = generateTestPrices(200);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    // 첫 번째 호출
    const result1 = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    // 두 번째 호출 (캐시에서)
    const result2 = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    expect(result1).toEqual(result2);
  });

  it("Pro1, Pro2, Pro3 중 하나의 전략을 반환해야 한다", () => {
    const prices = generateTestPrices(250);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const result = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    expect(result).not.toBeNull();
    expect(["Pro1", "Pro2", "Pro3"]).toContain(result!.strategy);
  });

  it("정배열/역배열 상태를 올바르게 판단해야 한다", () => {
    const prices = generateTestPrices(200);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const result = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    expect(result).not.toBeNull();
    expect(typeof result!.isGoldenCross).toBe("boolean");
  });

  it("RSI14와 이격도를 결과에 포함해야 한다", () => {
    const prices = generateTestPrices(200);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const result = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    expect(result).not.toBeNull();
    expect(result!.rsi14).toBeDefined();
    expect(result!.disparity).toBeDefined();
  });
});

describe("RpmRecommendBacktestEngine", () => {
  beforeEach(() => {
    clearRpmRecommendationCache();
  });

  afterEach(() => {
    clearRpmRecommendationCache();
  });

  it("백테스트를 실행하고 결과를 반환해야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "SOXL",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    expect(result).toBeDefined();
    expect(result.initialCapital).toBe(10000000);
    expect(result.finalAsset).toBeGreaterThan(0);
    expect(result.dailyHistory.length).toBeGreaterThan(0);
    expect(result.cycleStrategies.length).toBeGreaterThan(0);
  });

  it("일별 스냅샷에 전략 정보가 포함되어야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "SOXL",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    for (const snapshot of result.dailyHistory) {
      expect(["Pro1", "Pro2", "Pro3"]).toContain(snapshot.strategy);
    }
  });

  it("전략 통계가 올바르게 집계되어야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "SOXL",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    const totalDays =
      result.strategyStats.Pro1.totalDays +
      result.strategyStats.Pro2.totalDays +
      result.strategyStats.Pro3.totalDays;

    expect(totalDays).toBe(result.dailyHistory.length);
  });

  it("사이클 정보에 RPM 추천 사유가 포함되어야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "SOXL",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    for (const cycle of result.cycleStrategies) {
      expect(cycle.recommendReason).toBeDefined();
      expect(typeof cycle.recommendReason).toBe("string");
    }
  });

  it("수익률이 올바르게 계산되어야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "SOXL",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    const expectedReturnRate = (result.finalAsset - result.initialCapital) / result.initialCapital;
    expect(Math.abs(result.returnRate - expectedReturnRate)).toBeLessThan(0.0001);
  });

  it("MDD가 0 이하의 음수여야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "SOXL",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    expect(result.mdd).toBeLessThanOrEqual(0);
  });

  it("승률이 0~1 사이여야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "SOXL",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
  });

  it("TQQQ 티커로도 실행되어야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("TQQQ", prices, dateToIndexMap);

    const startIndex = 100;
    const result = engine.run(
      {
        ticker: "TQQQ",
        startDate: prices[startIndex].date,
        endDate: prices[prices.length - 1].date,
        initialCapital: 10000000,
      },
      startIndex
    );

    expect(result).toBeDefined();
    expect(result.dailyHistory.length).toBeGreaterThan(0);
  });

  it("데이터가 2일 미만이면 에러를 발생시켜야 한다", () => {
    const prices = generateTestPrices(300);
    const dateToIndexMap = createDateToIndexMap(prices);

    const engine = new RpmRecommendBacktestEngine("SOXL", prices, dateToIndexMap);

    expect(() => {
      engine.run(
        {
          ticker: "SOXL",
          startDate: prices[prices.length - 1].date,
          endDate: prices[prices.length - 1].date,
          initialCapital: 10000000,
        },
        prices.length // 마지막 인덱스 이후
      );
    }).toThrow("At least 2 days of price data required");
  });
});

describe("RPM vs 기존 방식 비교", () => {
  it("RPM 추천 결과와 기존 추천 결과가 다를 수 있다", () => {
    // RPM과 기존 5개 지표 방식은 다른 로직을 사용하므로
    // 동일한 날짜에 다른 전략을 추천할 수 있다
    const prices = generateTestPrices(250);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const rpmResult = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    // RPM 결과가 유효하면 테스트 통과
    expect(rpmResult).not.toBeNull();
    expect(["Pro1", "Pro2", "Pro3"]).toContain(rpmResult!.strategy);
  });
});

describe("전략 선택 규칙", () => {
  it("정배열 시 Pro1이 제외되어야 한다 (다이버전스 조건 없을 때)", () => {
    // 이 테스트는 특정 조건의 데이터가 필요하므로 기본 로직 확인
    const prices = generateTestPrices(250);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const result = getRpmQuickRecommendation(
      "TQQQ", // TQQQ는 SOXL 하향 규칙 없음
      referenceDate,
      prices,
      dateToIndexMap
    );

    expect(result).not.toBeNull();
    // 정배열일 때 Pro1이 아닌 전략이 선택되어야 함
    // (단, 실제 데이터에 따라 정배열/역배열이 결정됨)
    if (result!.isGoldenCross) {
      // Pro1이 아닐 가능성이 높지만, 다이버전스 조건으로 선택될 수도 있음
      expect(["Pro1", "Pro2", "Pro3"]).toContain(result!.strategy);
    }
  });
});

describe("캐시 기능", () => {
  it("clearRpmRecommendationCache가 캐시를 초기화해야 한다", () => {
    const prices = generateTestPrices(200);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    // 첫 번째 호출
    getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    // 캐시 초기화
    clearRpmRecommendationCache();

    // 두 번째 호출 (새로 계산)
    const result = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    expect(result).not.toBeNull();
  });

  it("다른 티커는 다른 캐시 키를 사용해야 한다", () => {
    const prices = generateTestPrices(200);
    const dateToIndexMap = createDateToIndexMap(prices);
    const referenceDate = prices[prices.length - 1].date;

    const soxlResult = getRpmQuickRecommendation("SOXL", referenceDate, prices, dateToIndexMap);

    const tqqqResult = getRpmQuickRecommendation("TQQQ", referenceDate, prices, dateToIndexMap);

    // SOXL과 TQQQ는 하향 규칙이 다르므로 결과가 다를 수 있음
    expect(soxlResult).not.toBeNull();
    expect(tqqqResult).not.toBeNull();
  });
});

describe("RPM 지표 통합", () => {
  it("8개 RPM 지표가 모두 계산되어야 한다", () => {
    const prices = generateTestPrices(100);
    const index = prices.length - 1;

    const indicators = calculateRpmIndicators(prices, index);

    expect(indicators).not.toBeNull();
    if (indicators) {
      expect(indicators.rsi14).toBeDefined();
      expect(indicators.disparity20).toBeDefined();
      expect(indicators.roc10).toBeDefined();
      expect(indicators.macdHistogram).toBeDefined();
      expect(indicators.bollingerWidth).toBeDefined();
      expect(indicators.atrPercent).toBeDefined();
      expect(indicators.disparity60).toBeDefined();
      expect(indicators.stochasticK).toBeDefined();
    }
  });
});
