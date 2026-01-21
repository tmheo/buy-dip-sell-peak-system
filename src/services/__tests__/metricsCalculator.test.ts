/**
 * metricsCalculator.ts 단위 테스트
 * SPEC-PERFORMANCE-001
 * 배치 기술적 지표 계산 서비스 테스트
 */
import { describe, it, expect } from "vitest";
import { calculateMetricsBatch } from "../metricsCalculator";

// 테스트용 가격 데이터 생성 (100일치)
function generateTestPrices(count: number, startPrice: number = 100): number[] {
  const prices: number[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    // 랜덤 변동 (-2% ~ +2%)
    const change = 1 + (Math.random() * 0.04 - 0.02);
    price = price * change;
    prices.push(Number(price.toFixed(4)));
  }

  return prices;
}

// 테스트용 날짜 배열 생성
function generateTestDates(count: number): string[] {
  const dates: string[] = [];
  const startDate = new Date("2024-01-01");

  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }

  return dates;
}

describe("calculateMetricsBatch", () => {
  describe("기본 동작", () => {
    it("최소 60일 이상의 데이터가 있어야 결과를 반환한다", () => {
      const prices = generateTestPrices(100);
      const dates = generateTestDates(100);

      const result = calculateMetricsBatch(prices, dates, "TEST", 59, 99);

      expect(result.length).toBeGreaterThan(0);
    });

    it("60일 미만의 데이터는 빈 배열을 반환한다", () => {
      const prices = generateTestPrices(50);
      const dates = generateTestDates(50);

      const result = calculateMetricsBatch(prices, dates, "TEST", 0, 49);

      expect(result.length).toBe(0);
    });

    it("startIndex가 59 미만이면 자동으로 59로 보정된다", () => {
      const prices = generateTestPrices(100);
      const dates = generateTestDates(100);

      const result = calculateMetricsBatch(prices, dates, "TEST", 0, 99);

      // 첫 번째 결과의 날짜가 인덱스 59 이상이어야 함
      expect(result.length).toBeGreaterThan(0);
      const firstResultDate = result[0].date;
      const firstResultIndex = dates.indexOf(firstResultDate);
      expect(firstResultIndex).toBeGreaterThanOrEqual(59);
    });

    it("빈 가격 배열은 빈 결과를 반환한다", () => {
      const result = calculateMetricsBatch([], [], "TEST", 0, 0);
      expect(result).toEqual([]);
    });
  });

  describe("지표 값 검증", () => {
    // 안정적인 테스트를 위해 고정된 가격 데이터 사용
    const fixedPrices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
    const fixedDates = generateTestDates(100);

    it("MA20과 MA60이 양수여야 한다", () => {
      const result = calculateMetricsBatch(fixedPrices, fixedDates, "TEST", 59, 99);

      for (const metric of result) {
        expect(metric.ma20).toBeGreaterThan(0);
        expect(metric.ma60).toBeGreaterThan(0);
      }
    });

    it("RSI14가 0~100 범위 내에 있어야 한다", () => {
      const result = calculateMetricsBatch(fixedPrices, fixedDates, "TEST", 59, 99);

      for (const metric of result) {
        expect(metric.rsi14).toBeGreaterThanOrEqual(0);
        expect(metric.rsi14).toBeLessThanOrEqual(100);
      }
    });

    it("volatility20이 음수가 아니어야 한다", () => {
      const result = calculateMetricsBatch(fixedPrices, fixedDates, "TEST", 59, 99);

      for (const metric of result) {
        expect(metric.volatility20).toBeGreaterThanOrEqual(0);
      }
    });

    it("상승 추세에서 isGoldenCross가 true여야 한다", () => {
      // 계속 상승하는 가격: 단기 MA > 장기 MA
      const risingPrices = Array.from({ length: 100 }, (_, i) => 100 + i * 2);
      const result = calculateMetricsBatch(risingPrices, fixedDates, "TEST", 59, 99);

      // 상승 추세이므로 대부분 골든크로스 상태
      const goldenCrossCount = result.filter((m) => m.isGoldenCross).length;
      expect(goldenCrossCount).toBeGreaterThan(result.length * 0.5);
    });

    it("하락 추세에서 isGoldenCross가 false여야 한다", () => {
      // 계속 하락하는 가격: 단기 MA < 장기 MA
      const fallingPrices = Array.from({ length: 100 }, (_, i) => 200 - i * 1.5);
      const result = calculateMetricsBatch(fallingPrices, fixedDates, "TEST", 59, 99);

      // 하락 추세이므로 대부분 데드크로스 상태
      const deadCrossCount = result.filter((m) => !m.isGoldenCross).length;
      expect(deadCrossCount).toBeGreaterThan(result.length * 0.5);
    });
  });

  describe("ticker 및 date 필드", () => {
    it("반환된 결과에 올바른 ticker가 포함되어야 한다", () => {
      const prices = generateTestPrices(100);
      const dates = generateTestDates(100);
      const ticker = "SOXL";

      const result = calculateMetricsBatch(prices, dates, ticker, 59, 99);

      for (const metric of result) {
        expect(metric.ticker).toBe(ticker);
      }
    });

    it("반환된 결과에 올바른 date가 포함되어야 한다", () => {
      const prices = generateTestPrices(100);
      const dates = generateTestDates(100);

      const result = calculateMetricsBatch(prices, dates, "TEST", 59, 99);

      for (const metric of result) {
        expect(dates).toContain(metric.date);
      }
    });
  });

  describe("부분 범위 계산", () => {
    it("특정 범위만 계산할 수 있어야 한다", () => {
      const prices = generateTestPrices(200);
      const dates = generateTestDates(200);

      // 인덱스 100~150 범위만 계산
      const result = calculateMetricsBatch(prices, dates, "TEST", 100, 150);

      // 결과 개수 확인 (일부는 null 값으로 스킵될 수 있음)
      expect(result.length).toBeLessThanOrEqual(51); // 150 - 100 + 1
      expect(result.length).toBeGreaterThan(0);

      // 결과의 날짜가 지정된 범위 내에 있어야 함
      for (const metric of result) {
        const dateIndex = dates.indexOf(metric.date);
        expect(dateIndex).toBeGreaterThanOrEqual(100);
        expect(dateIndex).toBeLessThanOrEqual(150);
      }
    });
  });

  describe("SMA 슬라이딩 윈도우 최적화 검증", () => {
    it("연속된 SMA 값이 합리적인 변화를 보여야 한다", () => {
      // 천천히 상승하는 가격
      const prices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.1);
      const dates = generateTestDates(100);

      const result = calculateMetricsBatch(prices, dates, "TEST", 59, 99);

      // 연속된 MA20 값의 차이가 크지 않아야 함 (급격한 점프 없음)
      for (let i = 1; i < result.length; i++) {
        const diff = Math.abs(result[i].ma20! - result[i - 1].ma20!);
        // 가격이 0.1씩 상승하므로 MA20 변화도 작아야 함
        expect(diff).toBeLessThan(1);
      }
    });
  });

  describe("수치 정밀도", () => {
    it("모든 수치가 소수점 4자리 이하로 반올림되어야 한다", () => {
      const prices = generateTestPrices(100);
      const dates = generateTestDates(100);

      const result = calculateMetricsBatch(prices, dates, "TEST", 59, 99);

      for (const metric of result) {
        if (metric.ma20 !== null) {
          const decimals = (metric.ma20.toString().split(".")[1] || "").length;
          expect(decimals).toBeLessThanOrEqual(4);
        }
        if (metric.rsi14 !== null) {
          const decimals = (metric.rsi14.toString().split(".")[1] || "").length;
          expect(decimals).toBeLessThanOrEqual(4);
        }
      }
    });
  });
});
