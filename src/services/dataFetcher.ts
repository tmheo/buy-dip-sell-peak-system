import YahooFinance from "yahoo-finance2";

import type { DailyPrice } from "../types/index.js";

const yahooFinance = new YahooFinance();

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// 지원하는 티커 목록과 상장일
const TICKER_CONFIG = {
  SOXL: { startDate: "2010-03-11" },
  TQQQ: { startDate: "2010-02-09" },
} as const;

export type SupportedTicker = keyof typeof TICKER_CONFIG;

interface ChartQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface ChartResult {
  quotes: ChartQuote[];
}

/**
 * 현재 시세 정보
 */
export interface CurrentQuote {
  price: number;
  change: number;
  changePercent: number;
}

/**
 * 날짜를 YYYY-MM-DD 형식 문자열로 변환
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * 오늘 날짜를 YYYY-MM-DD 형식으로 반환
 */
function getToday(): string {
  return formatDate(new Date());
}

/**
 * 지연 함수
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limit 에러인지 확인
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("Too Many Requests") || error.message.includes("429");
  }
  return false;
}

/**
 * 재시도 로직이 포함된 차트 데이터 조회
 */
async function fetchChartWithRetry(
  symbol: string,
  period1: string,
  period2: string,
  retries: number = MAX_RETRIES
): Promise<ChartResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: "1d",
      });
      return result as ChartResult;
    } catch (error: unknown) {
      if (isRateLimitError(error) && attempt < retries) {
        const waitTime = RETRY_DELAY_MS * attempt;
        console.log(`Rate limit 발생. ${waitTime / 1000}초 후 재시도... (${attempt}/${retries})`);
        await delay(waitTime);
        continue;
      }

      throw error;
    }
  }

  throw new Error("최대 재시도 횟수 초과");
}

/**
 * Yahoo Finance 원시 데이터를 DailyPrice 배열로 변환
 */
function convertQuotesToPrices(quotes: ChartQuote[]): DailyPrice[] {
  return quotes
    .filter((q) => q.close !== null && q.open !== null)
    .map((quote) => ({
      date: formatDate(new Date(quote.date)),
      open: quote.open!,
      high: quote.high!,
      low: quote.low!,
      close: quote.close!,
      volume: quote.volume ?? 0,
    }));
}

/**
 * Yahoo Finance에서 티커의 전체 히스토리 다운로드
 */
export async function fetchAllHistory(ticker: SupportedTicker = "SOXL"): Promise<DailyPrice[]> {
  const config = TICKER_CONFIG[ticker];
  if (!config) {
    throw new Error(`지원하지 않는 티커입니다: ${ticker}`);
  }

  const today = getToday();
  console.log(`${ticker} 전체 히스토리 다운로드 중...`);
  console.log(`기간: ${config.startDate} ~ ${today}`);

  const result = await fetchChartWithRetry(ticker, config.startDate, today);

  if (!result.quotes || result.quotes.length === 0) {
    console.log("데이터가 없습니다.");
    return [];
  }

  const prices = convertQuotesToPrices(result.quotes);
  console.log(`${prices.length}개의 데이터를 가져왔습니다.`);
  return prices;
}

/**
 * 특정 날짜 이후의 데이터만 다운로드 (증분 업데이트)
 */
export async function fetchSince(
  startDate: string,
  ticker: SupportedTicker = "SOXL"
): Promise<DailyPrice[]> {
  if (!TICKER_CONFIG[ticker]) {
    throw new Error(`지원하지 않는 티커입니다: ${ticker}`);
  }

  const nextDay = new Date(startDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const period1 = formatDate(nextDay);
  const today = getToday();

  if (period1 >= today) {
    console.log("이미 최신 데이터입니다.");
    return [];
  }

  console.log(`${ticker} 증분 업데이트 중...`);
  console.log(`기간: ${period1} ~ ${today}`);

  const result = await fetchChartWithRetry(ticker, period1, today);

  if (!result.quotes || result.quotes.length === 0) {
    console.log("새로운 데이터가 없습니다.");
    return [];
  }

  const prices = convertQuotesToPrices(result.quotes);
  console.log(`${prices.length}개의 새 데이터를 가져왔습니다.`);
  return prices;
}

/**
 * 현재 티커 시세 조회
 */
export async function fetchCurrentQuote(
  ticker: SupportedTicker = "SOXL"
): Promise<CurrentQuote | null> {
  if (!TICKER_CONFIG[ticker]) {
    throw new Error(`지원하지 않는 티커입니다: ${ticker}`);
  }

  try {
    const result = await yahooFinance.quote(ticker);
    const quote = Array.isArray(result) ? result[0] : result;
    return {
      price: quote.regularMarketPrice ?? 0,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
    };
  } catch (error) {
    console.error(`${ticker} 시세 조회 실패:`, error);
    return null;
  }
}

/**
 * 지원하는 모든 티커 목록 반환
 */
export function getSupportedTickers(): SupportedTicker[] {
  return Object.keys(TICKER_CONFIG) as SupportedTicker[];
}
