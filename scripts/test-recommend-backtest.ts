/**
 * 추천 전략 백테스트 결과 확인 스크립트
 */
import { loadPriceData } from "../src/optimize/backtest-runner";
import { runRecommendBacktest } from "../src/backtest-recommend";
import type { RecommendBacktestRequest } from "../src/backtest-recommend";
import Decimal from "decimal.js";

import type { DailyPrice } from "../src/types";

async function main() {
  const ticker = "SOXL" as const;
  const startDate = "2025-01-01";
  const endDate = "2025-12-31";
  const initialCapital = 10000;

  console.log(`=== 추천 전략 백테스트 (${ticker}) ===`);
  console.log(`기간: ${startDate} ~ ${endDate}`);
  console.log(`초기 자본: $${initialCapital}\n`);

  // 가격 데이터 로드
  const priceData = await loadPriceData(ticker);
  const allPrices: DailyPrice[] = priceData.prices;

  if (allPrices.length === 0) {
    throw new Error(`No price data for ${ticker}`);
  }

  // 종료일 인덱스 찾기 (종료일까지만 사용)
  const endIndex = allPrices.findIndex((p) => p.date > endDate);
  const backtestPrices = endIndex > 0 ? allPrices.slice(0, endIndex) : allPrices;

  // 시작일 인덱스 찾기 (API와 동일하게 >= 조건 사용)
  const backtestStartIndex = backtestPrices.findIndex((p) => p.date >= startDate);
  if (backtestStartIndex < 0) {
    throw new Error(`Start date ${startDate} not found in price data`);
  }
  console.log(`실제 시작일: ${backtestPrices[backtestStartIndex].date}`);
  console.log(`실제 종료일: ${backtestPrices[backtestPrices.length - 1].date}`);

  // 백테스트 요청 (기본 유사도 설정: 메모리 캐시와 추천 기록 사용)
  const request: RecommendBacktestRequest = {
    ticker,
    startDate,
    endDate,
    initialCapital,
  };

  // 백테스트 실행
  const result = await runRecommendBacktest(request, backtestPrices, backtestStartIndex);

  // 결과 출력
  const formatPercent = (v: number) => new Decimal(v).mul(100).toDecimalPlaces(2).toNumber() + "%";

  console.log("[결과]");
  console.log(`  수익률: ${formatPercent(result.returnRate)}`);
  console.log(`  MDD: ${formatPercent(result.mdd)}`);
  console.log(`  CAGR: ${formatPercent(result.cagr)}`);
  console.log(`  승률: ${formatPercent(result.winRate)}`);
  console.log(`  총 사이클: ${result.totalCycles}개`);
  console.log(`  최종 자산: $${new Decimal(result.finalAsset).toDecimalPlaces(2).toNumber()}`);

  // 전략별 사용 통계
  console.log("\n[전략별 사용 통계]");
  for (const [strategy, stats] of Object.entries(result.strategyStats)) {
    console.log(`  ${strategy}: ${stats.cycles}회 사용, ${stats.totalDays}일`);
  }

  // 처음 5개 사이클 정보
  console.log("\n[처음 5개 사이클]");
  for (let i = 0; i < Math.min(5, result.cycleStrategies.length); i++) {
    const cycle = result.cycleStrategies[i];
    console.log(`  사이클 ${i + 1}: ${cycle.strategy} (${cycle.startDate} ~ ${cycle.endDate})`);
    console.log(`    추천 이유: ${cycle.recommendReason}`);
  }
}

main().catch(console.error);
