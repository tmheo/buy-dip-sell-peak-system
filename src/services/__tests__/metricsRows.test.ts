/**
 * DB 지표 행 변환 어댑터 테스트 (#73)
 *
 * 코어(src/metrics)는 null을 보존하고, DB 적재 정책("행 스킵 + 0 치환")은
 * 이 어댑터가 소유한다. DB에 쓰이는 내용은 구 배치 계산과 동일해야 한다.
 */
import { describe, it, expect } from "vitest";
import type { DailyPrice } from "@/types";
import { buildDailyMetricRows } from "@/services/metricsRows";
import { computeIndicatorSeries } from "@/metrics";
import { FIXTURE_PRICES, FIXTURE_DATES } from "@/metrics/__tests__/__fixtures__/prices";
import { GOLDEN_INDICATOR_ROWS } from "@/metrics/__tests__/__fixtures__/indicators-golden";

const lastIndex = FIXTURE_PRICES.length - 1;

/** 픽스처의 adjClose·날짜로 DailyPrice 시계열을 만든다 (나머지 필드는 지표 계산과 무관) */
function makeSeries(adjClosePrices: number[], dates: string[]): DailyPrice[] {
  return adjClosePrices.map((adjClose, i) => ({
    date: dates[i],
    open: adjClose,
    high: adjClose,
    low: adjClose,
    close: adjClose,
    adjClose,
    volume: 1_000_000,
  }));
}

const FIXTURE_SERIES = makeSeries(FIXTURE_PRICES, FIXTURE_DATES);

describe("buildDailyMetricRows", () => {
  it("골든 픽스처 전 구간에서 index 59부터 행을 만들고 값이 골든 값과 일치한다", () => {
    const rows = buildDailyMetricRows(FIXTURE_SERIES, "FIXTURE");

    expect(rows).toHaveLength(lastIndex - 59 + 1);
    for (const [offset, row] of rows.entries()) {
      const index = 59 + offset;
      const golden = GOLDEN_INDICATOR_ROWS[index];
      expect(row.ticker).toBe("FIXTURE");
      expect(row.date).toBe(FIXTURE_DATES[index]);
      expect(row.ma20, `index ${index} ma20`).toBe(golden.ma20);
      expect(row.ma60, `index ${index} ma60`).toBe(golden.ma60);
      expect(row.goldenCross, `index ${index} goldenCross`).toBe(golden.goldenCross);
      expect(row.isGoldenCross, `index ${index} isGoldenCross`).toBe(golden.isGoldenCross);
      expect(row.maSlope, `index ${index} maSlope`).toBe(golden.maSlope);
      expect(row.disparity, `index ${index} disparity`).toBe(golden.disparity);
      expect(row.rsi14, `index ${index} rsi14`).toBe(golden.rsi14);
      expect(row.roc12, `index ${index} roc12`).toBe(golden.roc12);
      expect(row.volatility20, `index ${index} volatility20`).toBe(golden.volatility20);
    }
  });

  it("필수 지표가 null인 날은 행을 스킵한다 (roc12 계산 불가)", () => {
    // index 50의 가격이 0이면 index 62의 roc12(12일 전 가격 0)가 null이 된다
    const prices = FIXTURE_PRICES.slice(0, 70);
    prices[50] = 0;
    const dates = FIXTURE_DATES.slice(0, 70);

    const rows = buildDailyMetricRows(makeSeries(prices, dates), "FIXTURE");

    expect(rows.map((r) => r.date)).not.toContain(dates[62]);
    expect(rows).toHaveLength(69 - 59 + 1 - 1);
    // 스킵과 0 치환 정책은 어댑터 소유이고, 코어는 같은 날 null을 보존한다
    const coreRow = computeIndicatorSeries(prices, 62, 62)[0];
    expect(coreRow.roc12).toBeNull();
  });

  it("60 거래일 미만이면 빈 배열을 반환한다 (MA60 계산 불가)", () => {
    expect(buildDailyMetricRows(FIXTURE_SERIES.slice(0, 59), "FIXTURE")).toEqual([]);
    expect(buildDailyMetricRows([], "FIXTURE")).toEqual([]);
  });

  it("정확히 60 거래일이면 index 59 하루짜리 행을 만든다", () => {
    const rows = buildDailyMetricRows(FIXTURE_SERIES.slice(0, 60), "FIXTURE");
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(FIXTURE_DATES[59]);
  });
});
