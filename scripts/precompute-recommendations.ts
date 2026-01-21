/**
 * 추천 전략 사전 계산 스크립트
 * 전체 날짜에 대해 추천 전략을 계산하고 DB에 저장
 */
import {
  initTables,
  getPricesByDateRange,
  bulkSaveRecommendations,
  getRecommendationCacheCount,
} from "@/database";
import type { RecommendationCacheItem } from "@/database";
import type { DailyPrice } from "@/types";
import { getQuickRecommendation, clearRecommendationCache } from "@/backtest-recommend";

// 설정
const TICKERS = ["SOXL", "TQQQ"] as const;
const START_DATE = "2010-01-01";
const BATCH_SIZE = 100; // 배치 저장 크기

/**
 * 진행률 표시
 */
function showProgress(current: number, total: number, ticker: string): void {
  const percent = ((current / total) * 100).toFixed(1);
  const bar = "█".repeat(Math.floor(current / total * 30)) + "░".repeat(30 - Math.floor(current / total * 30));
  process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total}) - ${ticker}`);
}

/**
 * 특정 티커에 대한 추천 사전 계산
 */
async function precomputeForTicker(ticker: "SOXL" | "TQQQ"): Promise<number> {
  console.log(`\n\n=== ${ticker} 추천 사전 계산 시작 ===`);

  // 전체 가격 데이터 로드
  const endDate = new Date().toISOString().split("T")[0];
  const allPrices: DailyPrice[] = getPricesByDateRange(
    { startDate: START_DATE, endDate },
    ticker
  );

  if (allPrices.length === 0) {
    console.log(`${ticker}: 가격 데이터 없음`);
    return 0;
  }

  console.log(`${ticker}: ${allPrices.length}일 가격 데이터 로드 완료`);

  // 날짜-인덱스 맵 생성
  const dateToIndexMap = new Map<string, number>();
  allPrices.forEach((price, index) => {
    dateToIndexMap.set(price.date, index);
  });

  // 인메모리 캐시 초기화
  clearRecommendationCache();

  // 계산 시작 (최소 60일 데이터 필요)
  const startIndex = 59;
  const totalDays = allPrices.length - startIndex;
  let processedCount = 0;
  let cachedCount = 0;

  const cacheItems: RecommendationCacheItem[] = [];

  for (let i = startIndex; i < allPrices.length; i++) {
    const referenceDate = allPrices[i].date;

    // 추천 계산
    const result = getQuickRecommendation(ticker, referenceDate, allPrices, dateToIndexMap);

    if (result) {
      cacheItems.push({
        ticker,
        date: referenceDate,
        strategy: result.strategy,
        reason: result.reason,
        metrics: {
          rsi14: result.metrics.rsi14,
          isGoldenCross: result.metrics.isGoldenCross,
          maSlope: result.metrics.maSlope,
          disparity: result.metrics.disparity,
          roc12: result.metrics.roc12,
          volatility20: result.metrics.volatility20,
          goldenCross: result.metrics.goldenCross,
        },
      });
      cachedCount++;

      // 배치 저장
      if (cacheItems.length >= BATCH_SIZE) {
        bulkSaveRecommendations(cacheItems);
        cacheItems.length = 0;
      }
    }

    processedCount++;
    showProgress(processedCount, totalDays, ticker);
  }

  // 남은 데이터 저장
  if (cacheItems.length > 0) {
    bulkSaveRecommendations(cacheItems);
  }

  console.log(`\n${ticker}: ${cachedCount}개 추천 결과 저장 완료`);
  return cachedCount;
}

/**
 * 메인 실행
 */
async function main(): Promise<void> {
  console.log("=== 추천 전략 사전 계산 시작 ===");
  console.log(`시작 날짜: ${START_DATE}`);
  console.log(`대상 티커: ${TICKERS.join(", ")}`);

  // 테이블 초기화
  initTables();

  let totalCached = 0;

  for (const ticker of TICKERS) {
    const count = await precomputeForTicker(ticker);
    totalCached += count;
  }

  // 결과 출력
  console.log("\n\n=== 사전 계산 완료 ===");
  console.log(`총 캐시된 추천: ${totalCached}개`);

  for (const ticker of TICKERS) {
    const count = getRecommendationCacheCount(ticker);
    console.log(`  ${ticker}: ${count}개`);
  }
}

// 실행
main().catch(console.error);
