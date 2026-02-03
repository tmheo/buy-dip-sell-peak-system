/**
 * 추천 전략 사전 계산 스크립트
 * 전체 날짜에 대해 추천 전략을 계산하고 DB에 저장
 */
import { getPriceRange } from "@/database/prices";
import {
  bulkSaveRecommendations,
  getRecommendationCacheCount,
  type NewRecommendationCache,
} from "@/database/recommend-cache";
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
  const filled = Math.floor((current / total) * 30);
  const bar = "█".repeat(filled) + "░".repeat(30 - filled);
  process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total}) - ${ticker}`);
}

/**
 * 특정 티커에 대한 추천 사전 계산
 */
async function precomputeForTicker(ticker: "SOXL" | "TQQQ"): Promise<number> {
  console.log(`\n\n=== ${ticker} 추천 사전 계산 시작 ===`);

  // 전체 가격 데이터 로드
  const endDate = new Date().toISOString().split("T")[0];
  const allPrices: DailyPrice[] = await getPriceRange(ticker, START_DATE, endDate);

  if (allPrices.length === 0) {
    console.log(`${ticker}: 가격 데이터 없음`);
    return 0;
  }

  console.log(`${ticker}: ${allPrices.length}일 가격 데이터 로드 완료`);

  // 날짜-인덱스 맵 생성
  const dateToIndexMap = new Map<string, number>();
  for (let index = 0; index < allPrices.length; index++) {
    dateToIndexMap.set(allPrices[index].date, index);
  }

  // 인메모리 캐시 초기화
  clearRecommendationCache();

  // 계산 시작 (최소 60일 데이터 필요)
  const startIndex = 59;
  const totalDays = allPrices.length - startIndex;
  let processedCount = 0;
  let cachedCount = 0;

  const cacheItems: NewRecommendationCache[] = [];

  for (let i = startIndex; i < allPrices.length; i++) {
    const referenceDate = allPrices[i].date;

    // 추천 계산 (DB 저장은 bulkSaveRecommendations에서 일괄 처리하므로 persistToDb: false)
    const result = await getQuickRecommendation(ticker, referenceDate, allPrices, dateToIndexMap, {
      persistToDb: false,
    });

    if (result) {
      cacheItems.push({
        ticker,
        date: referenceDate,
        strategy: result.strategy,
        reason: result.reason,
        rsi14: result.metrics.rsi14 ?? null,
        isGoldenCross: result.metrics.isGoldenCross ?? false,
        maSlope: result.metrics.maSlope ?? null,
        disparity: result.metrics.disparity ?? null,
        roc12: result.metrics.roc12 ?? null,
        volatility20: result.metrics.volatility20 ?? null,
        goldenCross: result.metrics.goldenCross ?? null,
      });
      cachedCount++;

      // 배치 저장
      if (cacheItems.length >= BATCH_SIZE) {
        await bulkSaveRecommendations(cacheItems);
        cacheItems.length = 0;
      }
    }

    processedCount++;
    showProgress(processedCount, totalDays, ticker);
  }

  // 남은 데이터 저장
  if (cacheItems.length > 0) {
    await bulkSaveRecommendations(cacheItems);
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

  let totalCached = 0;

  for (const ticker of TICKERS) {
    const count = await precomputeForTicker(ticker);
    totalCached += count;
  }

  // 결과 출력
  console.log("\n\n=== 사전 계산 완료 ===");
  console.log(`총 캐시된 추천: ${totalCached}개`);

  for (const ticker of TICKERS) {
    const count = await getRecommendationCacheCount(ticker);
    console.log(`  ${ticker}: ${count}개`);
  }
}

// 실행
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
