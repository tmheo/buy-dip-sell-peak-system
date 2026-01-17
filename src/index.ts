import {
  close,
  getCount,
  getLatestDate,
  getPricesByDateRange,
  getTotalCount,
  initTables,
  insertPrices,
} from "./database/index.js";
import {
  fetchAllHistory,
  fetchSince,
  getSupportedTickers,
  type SupportedTicker,
} from "./services/dataFetcher.js";
import type { DailyPrice } from "./types/index.js";

const SUPPORTED_TICKERS = getSupportedTickers();
const DEFAULT_TICKER: SupportedTicker = "SOXL";

/**
 * 도움말 출력
 */
function showHelp(): void {
  console.log(`
주가 데이터베이스 관리 도구

사용법:
  npx tsx src/index.ts <command> [options]

명령어:
  init [--ticker TICKER]  데이터베이스 초기화 및 전체 히스토리 다운로드
  init-all                모든 티커의 전체 히스토리 다운로드
  update [--ticker TICKER] 최신 데이터로 업데이트 (증분)
  update-all              모든 티커 업데이트
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
 * init 명령어: DB 초기화 및 전체 히스토리 다운로드
 */
async function handleInit(ticker: SupportedTicker): Promise<void> {
  console.log(`=== ${ticker} 데이터베이스 초기화 ===\n`);

  initTables();

  const prices = await fetchAllHistory(ticker);

  if (prices.length > 0) {
    const count = insertPrices(prices, ticker);
    console.log(`\n${count}개의 레코드가 저장되었습니다.`);
  }

  const tickerCount = getCount(ticker);
  console.log(`\n${ticker} 총 저장된 레코드 수: ${tickerCount}`);
}

/**
 * init-all 명령어: 모든 티커 초기화
 */
async function handleInitAll(): Promise<void> {
  console.log("=== 모든 티커 데이터베이스 초기화 ===\n");

  initTables();

  for (const ticker of SUPPORTED_TICKERS) {
    await handleInit(ticker);
    console.log("");
  }

  const totalCount = getTotalCount();
  console.log(`\n전체 저장된 레코드 수: ${totalCount}`);
}

/**
 * update 명령어: 증분 업데이트
 */
async function handleUpdate(ticker: SupportedTicker): Promise<void> {
  console.log(`=== ${ticker} 데이터 업데이트 ===\n`);

  initTables();

  const latestDate = getLatestDate(ticker);

  if (!latestDate) {
    console.log(`${ticker}의 저장된 데이터가 없습니다. init 명령어를 먼저 실행하세요.`);
    return;
  }

  console.log(`마지막 저장 날짜: ${latestDate}`);

  const prices = await fetchSince(latestDate, ticker);

  if (prices.length > 0) {
    const count = insertPrices(prices, ticker);
    console.log(`\n${count}개의 새 레코드가 저장되었습니다.`);
  }

  const tickerCount = getCount(ticker);
  console.log(`\n${ticker} 총 저장된 레코드 수: ${tickerCount}`);
}

/**
 * update-all 명령어: 모든 티커 업데이트
 */
async function handleUpdateAll(): Promise<void> {
  console.log("=== 모든 티커 데이터 업데이트 ===\n");

  initTables();

  for (const ticker of SUPPORTED_TICKERS) {
    await handleUpdate(ticker);
    console.log("");
  }

  const totalCount = getTotalCount();
  console.log(`\n전체 저장된 레코드 수: ${totalCount}`);
}

/**
 * 가격 데이터 한 줄 출력
 */
function formatPriceRow(price: DailyPrice): string {
  return `${price.date}\t${price.open.toFixed(2)}\t${price.high.toFixed(2)}\t${price.low.toFixed(2)}\t${price.close.toFixed(2)}\t${price.adjClose.toFixed(2)}\t${price.volume.toLocaleString()}`;
}

/**
 * 가격 목록 출력 (처음/마지막 N개)
 */
function printPrices(prices: DailyPrice[], displayCount: number): void {
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
 * query 명령어: 데이터 조회
 */
function handleQuery(args: string[]): void {
  const ticker = getTickerFromArgs(args);
  const startDate = getArgValue(args, "--start");
  const endDate = getArgValue(args, "--end");

  console.log(`=== ${ticker} 데이터 조회 ===\n`);

  const prices = getPricesByDateRange({ startDate, endDate }, ticker);

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
      case "query":
        handleQuery(args);
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
    close();
  }
}

main();
