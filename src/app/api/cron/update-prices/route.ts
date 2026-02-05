/**
 * Cron 엔드포인트: 일일 가격/지표 자동 업데이트
 * GET /api/cron/update-prices
 *
 * Vercel Cron 또는 외부 스케줄러에서 호출하여
 * SOXL, TQQQ의 최신 가격 데이터를 Yahoo Finance에서 가져오고
 * 기술적 지표를 계산하여 DB에 저장합니다.
 *
 * 인증: Authorization: Bearer ${CRON_SECRET}
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { fetchSince } from "@/services/dataFetcher";
import type { SupportedTicker } from "@/services/dataFetcher";
import { getLatestDate, insertDailyPrices, getAllPricesByTicker } from "@/database/prices";
import { getLatestMetricDate, insertMetrics } from "@/database/metrics";
import { calculateMetricsBatch } from "@/services/metricsCalculator";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 대상 티커 목록 */
const TICKERS: SupportedTicker[] = ["SOXL", "TQQQ"];

/** 재시도 기본 설정 */
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * 재시도 래퍼 함수 (지수 백오프)
 * 실패 시 1초, 2초, 4초 간격으로 재시도합니다.
 *
 * @param fn - 실행할 비동기 함수
 * @param maxAttempts - 최대 시도 횟수
 * @param context - 로깅용 컨텍스트 문자열
 * @returns 함수 실행 결과
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  context: string
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(`[${context}] ${maxAttempts}회 시도 후 최종 실패:`, error);
        throw error;
      }

      const delayMs = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[${context}] 시도 ${attempt}/${maxAttempts} 실패, ${delayMs}ms 후 재시도:`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // TypeScript 타입 안전성을 위한 도달 불가능 코드
  throw new Error(`[${context}] 재시도 로직 오류`);
}

/**
 * 단일 티커에 대한 가격 및 지표 업데이트
 *
 * @param ticker - 업데이트할 티커
 * @returns 새로 추가된 가격/지표 수
 */
async function updateTicker(
  ticker: SupportedTicker
): Promise<{ newPrices: number; newMetrics: number }> {
  // 1. 마지막 저장된 가격 날짜 조회
  const latestDate = await getLatestDate(ticker);
  if (!latestDate) {
    console.log(`[${ticker}] 저장된 가격 데이터 없음. 초기화가 필요합니다.`);
    return { newPrices: 0, newMetrics: 0 };
  }
  console.log(`[${ticker}] 마지막 저장 날짜: ${latestDate}`);

  // 2. Yahoo Finance에서 신규 가격 데이터 가져오기
  const newPrices = await withRetry(
    () => fetchSince(latestDate, ticker),
    DEFAULT_MAX_ATTEMPTS,
    `${ticker} fetchSince`
  );

  if (newPrices.length === 0) {
    console.log(`[${ticker}] 새 가격 데이터 없음`);
    return { newPrices: 0, newMetrics: 0 };
  }
  console.log(`[${ticker}] 새 가격 데이터 ${newPrices.length}건 수신`);

  // 3. DB에 가격 데이터 삽입 (ticker 필드 명시적 설정, 스키마 호환 필드만 추출)
  await withRetry(
    () =>
      insertDailyPrices(
        newPrices.map((p) => ({
          ticker,
          date: p.date,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          adjClose: p.adjClose,
          volume: p.volume,
        }))
      ),
    DEFAULT_MAX_ATTEMPTS,
    `${ticker} insertDailyPrices`
  );
  console.log(`[${ticker}] 가격 데이터 ${newPrices.length}건 저장 완료`);

  // 4. 전체 가격 데이터 로드 (지표 계산용)
  const allPrices = await withRetry(
    () => getAllPricesByTicker(ticker),
    DEFAULT_MAX_ATTEMPTS,
    `${ticker} getAllPricesByTicker`
  );

  const adjCloses = allPrices.map((p) => p.adjClose);
  const dates = allPrices.map((p) => p.date);

  // 5. 지표 시작 인덱스 결정
  const latestMetricDate = await getLatestMetricDate(ticker);
  let startIdx: number;

  if (latestMetricDate) {
    const metricDateIndex = dates.indexOf(latestMetricDate);
    if (metricDateIndex !== -1) {
      startIdx = metricDateIndex + 1;
    } else {
      // 날짜를 찾지 못한 경우 MA60 최소 요구사항인 인덱스 59부터 시작
      startIdx = 59;
    }
  } else {
    // 지표 데이터가 전혀 없는 경우
    startIdx = 59;
  }

  const endIdx = adjCloses.length - 1;

  if (startIdx > endIdx) {
    console.log(`[${ticker}] 계산할 새 지표 없음`);
    return { newPrices: newPrices.length, newMetrics: 0 };
  }

  // 6. 기술적 지표 배치 계산 (동기 함수)
  console.log(`[${ticker}] 지표 계산 중 (인덱스 ${startIdx}~${endIdx})...`);
  const newMetrics = calculateMetricsBatch(adjCloses, dates, ticker, startIdx, endIdx);

  if (newMetrics.length === 0) {
    console.log(`[${ticker}] 계산된 지표 없음`);
    return { newPrices: newPrices.length, newMetrics: 0 };
  }

  // 7. 지표 데이터 DB 저장 (스키마 호환 필드만 추출)
  await withRetry(
    () =>
      insertMetrics(
        newMetrics.map((m) => ({
          ticker: m.ticker,
          date: m.date,
          ma20: m.ma20,
          ma60: m.ma60,
          maSlope: m.maSlope,
          disparity: m.disparity,
          rsi14: m.rsi14,
          roc12: m.roc12,
          volatility20: m.volatility20,
          goldenCross: m.goldenCross,
          isGoldenCross: m.isGoldenCross,
        }))
      ),
    DEFAULT_MAX_ATTEMPTS,
    `${ticker} insertMetrics`
  );
  console.log(`[${ticker}] 지표 데이터 ${newMetrics.length}건 저장 완료`);

  return { newPrices: newPrices.length, newMetrics: newMetrics.length };
}

/** GET /api/cron/update-prices */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // 인증 검증 (타이밍 공격 방지를 위한 timingSafeEqual 사용)
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (
    !authHeader ||
    authHeader.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedToken))
  ) {
    console.warn("Cron 인증 실패: 잘못된 토큰");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("=== 일일 가격/지표 업데이트 시작 ===");
  const startTime = Date.now();

  try {
    const results: Array<{
      ticker: string;
      newPrices: number;
      newMetrics: number;
    }> = [];

    // 각 티커에 대해 순차적으로 업데이트 (Yahoo Finance Rate Limit 방지)
    for (const ticker of TICKERS) {
      console.log(`--- ${ticker} 업데이트 시작 ---`);
      const result = await updateTicker(ticker);
      results.push({ ticker, ...result });
      console.log(`--- ${ticker} 업데이트 완료 ---`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`=== 업데이트 완료 (${elapsed}ms) ===`);

    return NextResponse.json(
      {
        success: true,
        updatedAt: new Date().toISOString(),
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`=== 업데이트 실패 (${elapsed}ms) ===`, error);

    return NextResponse.json(
      {
        error: "Update failed",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
