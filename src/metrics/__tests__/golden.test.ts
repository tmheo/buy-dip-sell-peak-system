/**
 * src/metrics 골든 회귀 테스트 (#73)
 *
 * PR1(#72)의 동등성 테스트가 구 구현 두 벌(개별·배치)과의 일치를 증명한 시점의
 * 출력을 박제한 골든 픽스처와 대조한다. 구 구현이 삭제된 뒤에는 이 테스트가
 * 지표 계산의 수치 의미가 움직이지 않았음을 매 PR마다 증명한다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateSMA,
  calculateRSI,
  calculateROC,
  calculateVolatility,
  computeIndicatorSeries,
} from "../index";
import { FIXTURE_PRICES } from "./__fixtures__/prices";
import { GOLDEN_INDICATOR_ROWS } from "./__fixtures__/indicators-golden";

const prices = FIXTURE_PRICES;
const lastIndex = prices.length - 1;

describe("골든 픽스처 대조", () => {
  it("computeIndicatorSeries가 전 구간에서 골든 값과 완전 일치한다", () => {
    const series = computeIndicatorSeries(prices, 0, lastIndex);
    expect(series).toHaveLength(GOLDEN_INDICATOR_ROWS.length);
    for (let i = 0; i <= lastIndex; i++) {
      expect(series[i], `index ${i}`).toEqual(GOLDEN_INDICATOR_ROWS[i]);
    }
  });

  it("개별 지표 함수가 전 구간에서 골든 값과 완전 일치한다", () => {
    for (let i = 0; i <= lastIndex; i++) {
      const golden = GOLDEN_INDICATOR_ROWS[i];
      expect(calculateSMA(prices, 20, i), `index ${i} SMA20`).toBe(golden.ma20);
      expect(calculateSMA(prices, 60, i), `index ${i} SMA60`).toBe(golden.ma60);
      expect(calculateRSI(prices, i), `index ${i} RSI`).toBe(golden.rsi14);
      expect(calculateROC(prices, i), `index ${i} ROC`).toBe(golden.roc12);
      expect(calculateVolatility(prices, i), `index ${i} Volatility`).toBe(golden.volatility20);
    }
  });
});
