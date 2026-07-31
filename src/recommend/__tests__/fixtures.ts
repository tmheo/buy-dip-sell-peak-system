/**
 * recommend 테스트 공용 픽스처
 * DB 없이 추천 파이프라인을 통과할 수 있는 합성 가격·지표 데이터
 */
import type { DailyPrice } from "@/types";
import { calculateTechnicalMetrics } from "@/backtest/metrics";

import type { HistoricalMetrics } from "../types";

/** 합성 가격 시계열 (사인파 + 완만한 상승 추세, 결정적) */
export function createPrices(length: number): DailyPrice[] {
  const prices: DailyPrice[] = [];
  const start = new Date("2020-01-01T00:00:00Z");
  for (let i = 0; i < length; i++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    const adjClose = 100 + 15 * Math.sin(i / 7) + i * 0.05;
    prices.push({
      date: date.toISOString().split("T")[0],
      open: adjClose,
      high: adjClose,
      low: adjClose,
      close: adjClose + 3, // adjClose 불변식 검증: close를 쓰면 결과가 달라진다
      adjClose,
      volume: 1000000,
    });
  }
  return prices;
}

/** 실제 지표 모듈로 과거 지표 배열 생성 (DB 로드 껍데기가 하는 일의 순수 재현) */
export function buildHistoricalMetrics(
  prices: DailyPrice[],
  maxIndex: number
): HistoricalMetrics[] {
  const adjClosePrices = prices.map((p) => p.adjClose);
  const result: HistoricalMetrics[] = [];
  for (let i = 59; i <= maxIndex; i++) {
    const metrics = calculateTechnicalMetrics(adjClosePrices, i);
    if (metrics) {
      result.push({ date: prices[i].date, dateIndex: i, metrics });
    }
  }
  return result;
}
