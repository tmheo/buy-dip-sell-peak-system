/**
 * 주가 데이터베이스 관리 CLI 도구
 * PostgreSQL (Drizzle ORM) 버전
 */

import {
  getAllPricesByTicker,
  getCount,
  getLatestDate,
  getPriceRange,
  getTotalCount,
  insertDailyPrices,
} from "./database/prices.js";
import { getMetricsCount, insertMetrics, upsertMetrics } from "./database/metrics.js";
import { closeConnection } from "./database/db-drizzle.js";
import {
  fetchAllHistory,
  fetchSince,
  getSupportedTickers,
  type SupportedTicker,
} from "./services/dataFetcher.js";
import { calculateMetricsBatch, verifyMetrics } from "./services/metricsCalculator.js";
import type { DailyMetricRow, DailyPrice } from "./types/index.js";

const SUPPORTED_TICKERS = getSupportedTickers();
const DEFAULT_TICKER: SupportedTicker = "SOXL";

/**
 * 도움말 출력
 */
function showHelp(): void {
  console.log(`
주가 데이터베이스 관리 도구 (PostgreSQL)

사용법:
  npx tsx src/index.ts <command> [options]

명령어:
  init [--ticker TICKER]  전체 히스토리 다운로드 (지표 포함)
  init-all                모든 티커의 전체 히스토리 다운로드 (지표 포함)
  update [--ticker TICKER] 최신 데이터로 업데이트 (증분, 지표 포함)
  update-all              모든 티커 업데이트 (지표 포함)
  init-metrics [--ticker]  기존 가격 데이터로 기술적 지표 일괄 계산
  verify-metrics [--ticker] 지표 계산 결과 검증
  query [--ticker] [--start] [--end] 데이터 조회
  help                    도움말 표시

옵션:
  --ticker TICKER         티커 심볼 (${SUPPORTED_TICKERS.join(", ")}) 기본값: ${DEFAULT_TICKER}
  --start YYYY-MM-DD      조회 시작일
  --end YYYY-MM-DD        조회 종료일

예시:
  npx tsx src/index.ts init --ticker SOXL
  npx tsx src/index.ts init-all
  npx tsx src/index.ts update --ticker TQQQ
  npx tsx src/index.ts init-metrics --ticker SOXL
  npx tsx src/index.ts verify-metrics --ticker SOXL
  npx tsx src/index.ts query --ticker SOXL --start 2024-01-01 --end 2024-12-31
`);
}

/**
 * 인자에서 특정 옵션의 값을 추출
 */
function getArgValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

/**
 * 인자에서 티커 추출
 */
function getTickerFromArgs(args: string[]): SupportedTicker {
  const tickerArg = getArgValue(args, "--ticker");

  if (tickerArg) {
    const ticker = tickerArg.toUpperCase() as SupportedTicker;
    if (SUPPORTED_TICKERS.includes(ticker)) {
      return ticker;
    }
    console.warn(`지원하지 않는 티커: ${tickerArg}. 기본값 ${DEFAULT_TICKER} 사용.`);
  }

  return DEFAULT_TICKER;
}

/**
 * DailyPrice를 PostgreSQL INSERT용 형식으로 변환
 */
function convertToPgPrices(
  prices: DailyPrice[],
  ticker: string
): Array<{
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}> {
  return prices.map((p) => ({
    ticker,
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    adjClose: p.adjClose,
    volume: p.volume,
  }));
}

/**
 * DailyMetricRow를 PostgreSQL INSERT용 형식으로 변환
 */
function convertToPgMetrics(
  metrics: DailyMetricRow[],
  ticker: string
): Array<{
  ticker: string;
  date: string;
  ma20: number | null;
  ma60: number | null;
  maSlope: number | null;
  disparity: number | null;
  rsi14: number | null;
  roc12: number | null;
  volatility20: number | null;
  goldenCross: number | null;
  isGoldenCross: boolean | null;
}> {
  return metrics.map((m) => ({
    ticker,
    date: m.date,
    ma20: m.ma20 ?? null,
    ma60: m.ma60 ?? null,
    maSlope: m.maSlope ?? null,
    disparity: m.disparity ?? null,
    rsi14: m.rsi14 ?? null,
    roc12: m.roc12 ?? null,
    volatility20: m.volatility20 ?? null,
    goldenCross: m.goldenCross ?? null,
    isGoldenCross: m.isGoldenCross ?? null,
  }));
}

/**
 * init 명령어: 전체 히스토리 다운로드 (지표 포함)
 */
async function handleInit(ticker: SupportedTicker): Promise<void> {
  console.log(`=== ${ticker} 데이터베이스 초기화 ===\n`);

  const prices = await fetchAllHistory(ticker);

  if (prices.length > 0) {
    const pgPrices = convertToPgPrices(prices, ticker);
    await insertDailyPrices(pgPrices);
    console.log(`\n${prices.length}개의 가격 레코드가 저장되었습니다.`);

    // 기술적 지표 계산 및 저장
    console.log("\n기술적 지표 계산 중...");
    const adjClosePrices = prices.map((p) => p.adjClose);
    const dates = prices.map((p) => p.date);
    const metrics = calculateMetricsBatch(adjClosePrices, dates, ticker, 59, prices.length - 1);

    if (metrics.length > 0) {
      const pgMetrics = convertToPgMetrics(metrics, ticker);
      await insertMetrics(pgMetrics);
      console.log(`✅ ${metrics.length}개의 기술적 지표가 저장되었습니다.`);
    }
  }

  const tickerCount = await getCount(ticker);
  const metricsCount = await getMetricsCount(ticker);
  console.log(`\n${ticker} 총 저장된 가격 레코드 수: ${tickerCount}`);
  console.log(`${ticker} 총 저장된 지표 레코드 수: ${metricsCount}`);
}

/**
 * init-all 명령어: 모든 티커 초기화
 */
async function handleInitAll(): Promise<void> {
  console.log("=== 모든 티커 데이터베이스 초기화 ===\n");

  for (const ticker of SUPPORTED_TICKERS) {
    await handleInit(ticker);
    console.log("");
  }

  const totalCount = await getTotalCount();
  console.log(`\n전체 저장된 레코드 수: ${totalCount}`);
}

/**
 * update 명령어: 증분 업데이트 (지표 포함)
 */
async function handleUpdate(ticker: SupportedTicker): Promise<void> {
  console.log(`=== ${ticker} 데이터 업데이트 ===\n`);

  const latestDate = await getLatestDate(ticker);

  if (!latestDate) {
    console.log(`${ticker}의 저장된 데이터가 없습니다. init 명령어를 먼저 실행하세요.`);
    return;
  }

  console.log(`마지막 저장 날짜: ${latestDate}`);

  const prices = await fetchSince(latestDate, ticker);

  if (prices.length > 0) {
    const pgPrices = convertToPgPrices(prices, ticker);
    await insertDailyPrices(pgPrices);
    console.log(`\n${prices.length}개의 새 가격 레코드가 저장되었습니다.`);

    // 지표 재계산
    // 새 데이터 추가 시 영향받는 지표도 업데이트 (MA60 등으로 인해 과거 60일 영향)
    console.log("\n기술적 지표 업데이트 중...");
    const allPrices = await getAllPricesByTicker(ticker);
    const adjClosePrices = allPrices.map((p) => p.adjClose);
    const dates = allPrices.map((p) => p.date);

    // 새 데이터 + 영향받는 과거 데이터 재계산 (MA60 기준 60일)
    const startIdx = Math.max(59, allPrices.length - prices.length - 60);
    const metrics = calculateMetricsBatch(
      adjClosePrices,
      dates,
      ticker,
      startIdx,
      allPrices.length - 1
    );

    if (metrics.length > 0) {
      const pgMetrics = convertToPgMetrics(metrics, ticker);
      await upsertMetrics(pgMetrics);
      console.log(`✅ ${metrics.length}개의 기술적 지표가 업데이트되었습니다.`);
    }
  } else {
    console.log("\n새 데이터가 없습니다.");
  }

  const tickerCount = await getCount(ticker);
  const metricsCount = await getMetricsCount(ticker);
  console.log(`\n${ticker} 총 저장된 가격 레코드 수: ${tickerCount}`);
  console.log(`${ticker} 총 저장된 지표 레코드 수: ${metricsCount}`);
}

/**
 * update-all 명령어: 모든 티커 업데이트
 */
async function handleUpdateAll(): Promise<void> {
  console.log("=== 모든 티커 데이터 업데이트 ===\n");

  for (const ticker of SUPPORTED_TICKERS) {
    await handleUpdate(ticker);
    console.log("");
  }

  const totalCount = await getTotalCount();
  console.log(`\n전체 저장된 레코드 수: ${totalCount}`);
}

/**
 * 가격 데이터 한 줄 출력
 */
function formatPriceRow(price: {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}): string {
  return `${price.date}\t${price.open.toFixed(2)}\t${price.high.toFixed(2)}\t${price.low.toFixed(2)}\t${price.close.toFixed(2)}\t${price.adjClose.toFixed(2)}\t${price.volume.toLocaleString()}`;
}

/**
 * 가격 목록 출력 (처음/마지막 N개)
 */
function printPrices(
  prices: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    adjClose: number;
    volume: number;
  }>,
  displayCount: number
): void {
  const header = "날짜\t\t시가\t고가\t저가\t종가\t수정종가\t거래량";

  console.log(`--- 처음 ${displayCount}개 ---`);
  console.log(header);
  prices.slice(0, displayCount).forEach((p) => console.log(formatPriceRow(p)));

  if (prices.length > displayCount * 2) {
    console.log(`\n... (${prices.length - displayCount * 2}개 생략) ...\n`);
  }

  if (prices.length > displayCount) {
    console.log(`--- 마지막 ${displayCount}개 ---`);
    console.log(header);
    prices.slice(-displayCount).forEach((p) => console.log(formatPriceRow(p)));
  }
}

/**
 * init-metrics 명령어: 기존 가격 데이터로 기술적 지표 일괄 계산
 */
async function handleInitMetrics(ticker: SupportedTicker): Promise<void> {
  console.log(`=== ${ticker} 기술적 지표 일괄 계산 ===\n`);

  const prices = await getAllPricesByTicker(ticker);

  if (prices.length === 0) {
    console.log(`${ticker}의 가격 데이터가 없습니다. init 명령어를 먼저 실행하세요.`);
    return;
  }

  console.log(`가격 데이터 수: ${prices.length}`);
  console.log("기술적 지표 계산 중...");

  const adjClosePrices = prices.map((p) => p.adjClose);
  const dates = prices.map((p) => p.date);
  const metrics = calculateMetricsBatch(adjClosePrices, dates, ticker, 59, prices.length - 1);

  if (metrics.length > 0) {
    const pgMetrics = convertToPgMetrics(metrics, ticker);
    await insertMetrics(pgMetrics);
    console.log(`\n✅ ${metrics.length}개의 기술적 지표가 저장되었습니다.`);
  } else {
    console.log("\n계산된 지표가 없습니다. (데이터 부족)");
  }

  const totalMetrics = await getMetricsCount(ticker);
  console.log(`${ticker} 총 저장된 지표 레코드 수: ${totalMetrics}`);
}

/**
 * verify-metrics 명령어: 지표 계산 결과 검증
 */
async function handleVerifyMetrics(ticker: SupportedTicker): Promise<void> {
  console.log(`=== ${ticker} 기술적 지표 검증 ===\n`);

  const prices = await getAllPricesByTicker(ticker);

  if (prices.length === 0) {
    console.log(`${ticker}의 가격 데이터가 없습니다.`);
    return;
  }
  if (prices.length <= 59) {
    console.log(`${ticker}의 가격 데이터가 60일 미만입니다. (검증 불가)`);
    return;
  }

  const adjClosePrices = prices.map((p) => p.adjClose);
  const dates = prices.map((p) => p.date);

  // 샘플 데이터로 검증 (전체 검증은 시간이 오래 걸림)
  const sampleSize = Math.min(100, prices.length - 59);
  const startIdx = prices.length - sampleSize;
  const endIdx = prices.length - 1;

  console.log(`검증 범위: ${dates[startIdx]} ~ ${dates[endIdx]} (${sampleSize}개)`);
  console.log("배치 계산 결과와 개별 계산 결과 비교 중...\n");

  const metrics = calculateMetricsBatch(adjClosePrices, dates, ticker, startIdx, endIdx);
  const result = await verifyMetrics(metrics, adjClosePrices, dates);

  if (result.passed) {
    console.log("✅ 검증 통과: 배치 계산 결과가 기존 로직과 일치합니다.");
  } else {
    console.log("❌ 검증 실패:");
    result.failures.slice(0, 10).forEach((f: string) => console.log(`  - ${f}`));
    if (result.failures.length > 10) {
      console.log(`  ... 외 ${result.failures.length - 10}개`);
    }
  }
}

/**
 * query 명령어: 데이터 조회
 */
async function handleQuery(args: string[]): Promise<void> {
  const ticker = getTickerFromArgs(args);
  const startDate = getArgValue(args, "--start");
  const endDate = getArgValue(args, "--end");

  console.log(`=== ${ticker} 데이터 조회 ===\n`);

  let prices;
  if (startDate && endDate) {
    prices = await getPriceRange(ticker, startDate, endDate);
  } else {
    prices = await getAllPricesByTicker(ticker);
  }

  if (prices.length === 0) {
    console.log("조회된 데이터가 없습니다.");
    return;
  }

  console.log(`조회된 레코드 수: ${prices.length}\n`);
  printPrices(prices, 5);
}

/**
 * 메인 함수
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  const ticker = getTickerFromArgs(args);

  try {
    switch (command) {
      case "init":
        await handleInit(ticker);
        break;
      case "init-all":
        await handleInitAll();
        break;
      case "update":
        await handleUpdate(ticker);
        break;
      case "update-all":
        await handleUpdateAll();
        break;
      case "init-metrics":
        await handleInitMetrics(ticker);
        break;
      case "verify-metrics":
        await handleVerifyMetrics(ticker);
        break;
      case "query":
        await handleQuery(args);
        break;
      case "help":
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error("오류 발생:", error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
