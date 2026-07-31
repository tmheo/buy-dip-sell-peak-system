/**
 * src/metrics 동등성 테스트 (#70 PR1, #72)
 *
 * 체크인된 가격 픽스처로 새 모듈과 구 구현 두 벌을 대조한다.
 * - 구 개별 계산(src/backtest/metrics.ts)과는 완전 일치해야 한다 (수치 정본).
 * - 구 배치 계산(src/services/metricsCalculator.ts)과는 기본 지표 완전 일치,
 *   파생 지표(골든크로스·MA기울기·이격도)만 소수 4째 자리 차이를 허용하고
 *   차이 나는 행 수를 보고한다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateSMA as legacySMA,
  calculateRSI as legacyRSI,
  calculateROC as legacyROC,
  calculateVolatility as legacyVolatility,
  calculateDailyMetrics as legacyDailyMetrics,
  calculateTechnicalMetrics as legacyTechnicalMetrics,
} from "@/backtest/metrics";
import { calculateMetricsBatch as legacyMetricsBatch } from "@/services/metricsCalculator";
import {
  calculateSMA,
  calculateRSI,
  calculateROC,
  calculateVolatility,
  computeIndicatorSeries,
} from "../index";
import { FIXTURE_PRICES, FIXTURE_DATES } from "./__fixtures__/prices";

const prices = FIXTURE_PRICES;
const dates = FIXTURE_DATES;
const lastIndex = prices.length - 1;

describe("새 모듈 == 구 개별 계산 (완전 일치)", () => {
  const series = computeIndicatorSeries(prices, 0, lastIndex);

  it("기본 지표(ma20, ma60, rsi14, roc12, volatility20)가 전 구간에서 완전 일치한다", () => {
    for (let i = 0; i <= lastIndex; i++) {
      const row = series[i];
      expect(row.ma20, `index ${i} ma20`).toBe(legacySMA(prices, 20, i));
      expect(row.ma60, `index ${i} ma60`).toBe(legacySMA(prices, 60, i));
      expect(row.rsi14, `index ${i} rsi14`).toBe(legacyRSI(prices, i));
      expect(row.roc12, `index ${i} roc12`).toBe(legacyROC(prices, i));
      expect(row.volatility20, `index ${i} volatility20`).toBe(legacyVolatility(prices, i));
    }
  });

  it("개별 지표 함수가 구 함수와 전 구간에서 완전 일치한다", () => {
    for (let i = 0; i <= lastIndex; i++) {
      expect(calculateSMA(prices, 20, i), `index ${i} SMA20`).toBe(legacySMA(prices, 20, i));
      expect(calculateSMA(prices, 60, i), `index ${i} SMA60`).toBe(legacySMA(prices, 60, i));
      expect(calculateRSI(prices, i), `index ${i} RSI`).toBe(legacyRSI(prices, i));
      expect(calculateROC(prices, i), `index ${i} ROC`).toBe(legacyROC(prices, i));
      expect(calculateVolatility(prices, i), `index ${i} Volatility`).toBe(
        legacyVolatility(prices, i)
      );
    }
  });

  it("파생 지표(골든크로스, MA기울기, 이격도)가 calculateDailyMetrics와 null 포함 완전 일치한다", () => {
    for (let i = 0; i <= lastIndex; i++) {
      const row = series[i];
      const legacy = legacyDailyMetrics(prices, i, dates[i]);
      expect(row.goldenCross, `index ${i} goldenCross`).toBe(legacy.goldenCross);
      expect(row.maSlope, `index ${i} maSlope`).toBe(legacy.maSlope);
      expect(row.disparity, `index ${i} disparity`).toBe(legacy.disparity);
    }
  });

  it("종합 지표가 calculateTechnicalMetrics와 완전 일치한다 (index 59 이상)", () => {
    for (let i = 59; i <= lastIndex; i++) {
      const row = series[i];
      const legacy = legacyTechnicalMetrics(prices, i);
      expect(legacy, `index ${i} legacy`).not.toBeNull();
      if (legacy === null) continue;

      expect(row.goldenCross, `index ${i} goldenCross`).toBe(legacy.goldenCross);
      expect(row.isGoldenCross, `index ${i} isGoldenCross`).toBe(legacy.isGoldenCross);
      expect(row.maSlope, `index ${i} maSlope`).toBe(legacy.maSlope);
      expect(row.disparity, `index ${i} disparity`).toBe(legacy.disparity);
      expect(row.rsi14, `index ${i} rsi14`).toBe(legacy.rsi14);
      expect(row.roc12, `index ${i} roc12`).toBe(legacy.roc12);
      expect(row.volatility20, `index ${i} volatility20`).toBe(legacy.volatility20);
    }
  });
});

describe("새 모듈 vs 구 배치 계산 (파생 지표 소수 4째 자리 차이만 허용)", () => {
  const series = computeIndicatorSeries(prices, 59, lastIndex);
  const batch = legacyMetricsBatch(prices, dates, "FIXTURE", 59, lastIndex);

  it("픽스처 구간에서 배치가 행을 스킵하지 않는다", () => {
    expect(batch).toHaveLength(lastIndex - 59 + 1);
  });

  it("기본 지표와 정배열 여부는 완전 일치하고, 파생 지표는 4째 자리 차이만 허용한다", () => {
    // 소수 4째 자리 한 단위(0.0001)까지 허용. 부동소수점 표현 오차 여유분을 더한다.
    const TOLERANCE = 0.0001 + 1e-12;
    const derivedFields = ["goldenCross", "maSlope", "disparity"] as const;
    const diffRows = new Set<string>();

    for (const legacyRow of batch) {
      const index = dates.indexOf(legacyRow.date);
      expect(index, `date ${legacyRow.date}`).toBeGreaterThanOrEqual(59);
      const row = series[index - 59];

      // 기본 지표: 완전 일치
      expect(row.ma20, `${legacyRow.date} ma20`).toBe(legacyRow.ma20);
      expect(row.ma60, `${legacyRow.date} ma60`).toBe(legacyRow.ma60);
      expect(row.rsi14, `${legacyRow.date} rsi14`).toBe(legacyRow.rsi14);
      expect(row.roc12, `${legacyRow.date} roc12`).toBe(legacyRow.roc12);
      expect(row.volatility20, `${legacyRow.date} volatility20`).toBe(legacyRow.volatility20);
      expect(row.isGoldenCross, `${legacyRow.date} isGoldenCross`).toBe(legacyRow.isGoldenCross);

      // 파생 지표: 새 모듈은 null을 보존하지만 픽스처 구간에서는 항상 계산 가능해야 한다.
      for (const field of derivedFields) {
        const newValue = row[field];
        const legacyValue = legacyRow[field];
        expect(newValue, `${legacyRow.date} ${field}`).not.toBeNull();
        expect(legacyValue, `${legacyRow.date} ${field} (구 배치)`).not.toBeNull();
        if (newValue === null || legacyValue === null) continue;

        const diff = Math.abs(newValue - legacyValue);
        expect(diff, `${legacyRow.date} ${field}`).toBeLessThanOrEqual(TOLERANCE);
        if (diff > 0) diffRows.add(legacyRow.date);
      }
    }

    // 차이 나는 행 수 보고 (#72 요구사항)
    console.log(
      `[동등성 보고] 파생 지표가 구 배치 계산과 다른 행: ${diffRows.size}/${batch.length}`
    );
  });
});
