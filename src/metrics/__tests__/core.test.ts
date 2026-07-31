/**
 * src/metrics 코어 단위 테스트
 *
 * null 보존 계약과 개별 지표 함수의 경계 조건을 검증한다.
 * 구 구현과의 수치 동등성은 equivalence.test.ts가 담당한다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateSMA,
  calculateRSI,
  calculateROC,
  calculateVolatility,
  computeIndicatorSeries,
  computeIndicatorsAt,
} from "../index";
import { FIXTURE_PRICES } from "./__fixtures__/prices";

describe("calculateSMA", () => {
  it("20일 SMA를 올바르게 계산해야 한다", () => {
    const prices = Array(20).fill(100);
    expect(calculateSMA(prices, 20, 19)).toBe(100);
  });

  it("다양한 가격에서 SMA를 올바르게 계산해야 한다", () => {
    const prices = [10, 20, 30, 40, 50];
    expect(calculateSMA(prices, 5, 4)).toBe(30);
  });

  it("index가 period-1보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(30).fill(100);
    expect(calculateSMA(prices, 20, 18)).toBeNull();
  });

  it("index가 배열 범위를 벗어나면 null을 반환해야 한다", () => {
    const prices = Array(20).fill(100);
    expect(calculateSMA(prices, 20, 20)).toBeNull();
  });

  it("소수점 4자리로 내림해야 한다", () => {
    // 4 / 3 = 1.33333... 을 반올림이 아니라 내림으로 잘라야 한다
    const prices = [1, 1, 2];
    expect(calculateSMA(prices, 3, 2)).toBe(1.3333);
  });

  it("이진 부동소수점 대신 Decimal로 계산해야 한다", () => {
    // 0.1 + 0.2 + 0.3 = 0.6000000000000001이 아니라 정확히 0.6
    const prices = [0.1, 0.2, 0.3];
    expect(calculateSMA(prices, 3, 2)).toBe(0.2);
  });
});

describe("calculateRSI", () => {
  it("index가 14보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(30).fill(100);
    expect(calculateRSI(prices, 13)).toBeNull();
  });

  it("index가 배열 범위를 벗어나면 null을 반환해야 한다", () => {
    const prices = Array(15).fill(100);
    expect(calculateRSI(prices, 15)).toBeNull();
  });

  it("하락이 없으면 RSI 100을 반환해야 한다", () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(calculateRSI(prices, 14)).toBe(100);
    expect(calculateRSI(prices, 19)).toBe(100);
  });

  it("상승이 없으면 RSI 0을 반환해야 한다", () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(calculateRSI(prices, 14)).toBe(0);
  });
});

describe("calculateROC", () => {
  it("index가 12보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(30).fill(100);
    expect(calculateROC(prices, 11)).toBeNull();
  });

  it("12일 전 가격이 0이면 null을 반환해야 한다", () => {
    const prices = [0, ...Array(12).fill(100)];
    expect(calculateROC(prices, 12)).toBeNull();
  });

  it("12일 변화율을 %로 반환해야 한다", () => {
    const prices = [...Array(12).fill(100), 110];
    expect(calculateROC(prices, 12)).toBe(10);
  });
});

describe("calculateVolatility", () => {
  it("index가 20보다 작으면 null을 반환해야 한다", () => {
    const prices = Array(30).fill(100);
    expect(calculateVolatility(prices, 19)).toBeNull();
  });

  it("가격 변동이 없으면 0을 반환해야 한다", () => {
    const prices = Array(30).fill(100);
    expect(calculateVolatility(prices, 20)).toBe(0);
  });
});

describe("computeIndicatorSeries", () => {
  const prices = FIXTURE_PRICES;

  it("startIndex가 endIndex보다 크면 빈 배열을 반환한다", () => {
    expect(computeIndicatorSeries(prices, 10, 9)).toEqual([]);
  });

  it("요청 구간 길이만큼 행을 반환한다", () => {
    const rows = computeIndicatorSeries(prices, 0, prices.length - 1);
    expect(rows).toHaveLength(prices.length);
  });

  it("데이터 부족 구간은 null을 그대로 보존한다", () => {
    const rows = computeIndicatorSeries(prices, 0, 60);

    // ma20: index 19부터
    expect(rows[18].ma20).toBeNull();
    expect(rows[19].ma20).not.toBeNull();

    // ma60: index 59부터
    expect(rows[58].ma60).toBeNull();
    expect(rows[59].ma60).not.toBeNull();

    // rsi14: index 14부터
    expect(rows[13].rsi14).toBeNull();
    expect(rows[14].rsi14).not.toBeNull();

    // roc12: index 12부터
    expect(rows[11].roc12).toBeNull();
    expect(rows[12].roc12).not.toBeNull();

    // volatility20: index 20부터
    expect(rows[19].volatility20).toBeNull();
    expect(rows[20].volatility20).not.toBeNull();

    // 골든크로스·정배열: ma60이 생기는 index 59부터
    expect(rows[58].goldenCross).toBeNull();
    expect(rows[58].isGoldenCross).toBeNull();
    expect(rows[59].goldenCross).not.toBeNull();
    expect(rows[59].isGoldenCross).not.toBeNull();

    // maSlope: ma20[t-10]이 생기는 index 29부터
    expect(rows[28].maSlope).toBeNull();
    expect(rows[29].maSlope).not.toBeNull();

    // 이격도: ma20이 생기는 index 19부터
    expect(rows[18].disparity).toBeNull();
    expect(rows[19].disparity).not.toBeNull();
  });

  it("배열 범위를 벗어난 인덱스는 전부 null인 행을 반환한다", () => {
    const rows = computeIndicatorSeries(prices, prices.length, prices.length);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      ma20: null,
      ma60: null,
      goldenCross: null,
      isGoldenCross: null,
      maSlope: null,
      disparity: null,
      rsi14: null,
      roc12: null,
      volatility20: null,
    });
  });

  it("픽스처에서 정배열 참/거짓이 모두 나타난다", () => {
    const rows = computeIndicatorSeries(prices, 59, prices.length - 1);
    const flags = rows.map((r) => r.isGoldenCross);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
  });
});

describe("computeIndicatorsAt", () => {
  it("computeIndicatorSeries의 해당 행과 동일한 결과를 반환한다", () => {
    const prices = FIXTURE_PRICES;
    const series = computeIndicatorSeries(prices, 0, prices.length - 1);

    for (const index of [0, 13, 14, 19, 29, 58, 59, 100, prices.length - 1]) {
      expect(computeIndicatorsAt(prices, index)).toEqual(series[index]);
    }
  });
});
