/**
 * 전략 추천 API 엔드포인트
 * POST /api/recommend
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { BacktestEngine } from "@/backtest";
import { calculateTechnicalMetrics } from "@/backtest/metrics";
import type { BacktestRequest, StrategyName } from "@/backtest/types";
import { getPricesByDateRange, getLatestDate } from "@/database";
import {
  ANALYSIS_PERIOD_DAYS,
  PERFORMANCE_PERIOD_DAYS,
  MIN_PAST_GAP_DAYS,
  findSimilarPeriodsWithDates,
  calculateAllStrategyScores,
  getRecommendedStrategy,
  getStrategyTierRatios,
  generateRecommendReason,
} from "@/recommend";
import type {
  RecommendResult,
  SimilarPeriod,
  HistoricalMetrics,
  PeriodBacktestResult,
  ChartDataPoint,
} from "@/recommend";

const RecommendRequestSchema = z
  .object({
    ticker: z.enum(["SOXL", "TQQQ"], {
      message: "ticker must be SOXL or TQQQ",
    }),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must be in YYYY-MM-DD format"),
    baseType: z.enum(["today", "specific"], {
      message: "baseType must be today or specific",
    }),
  })
  .refine(
    (data) => {
      // 'today' 기준일 때는 referenceDate 유효성 검사 건너뛰기 (서버에서 오늘 날짜로 대체)
      if (data.baseType === "today") return true;
      // 'specific' 기준일 때는 유효한 날짜인지 확인
      const date = new Date(data.referenceDate);
      return !isNaN(date.getTime());
    },
    {
      message: "Invalid referenceDate",
      path: ["referenceDate"],
    }
  );

/** 기술적 지표 계산을 위한 과거 데이터 추가 일수 */
const LOOKBACK_DAYS = 90;

/** 주어진 날짜 이후 N개의 예상 거래일 생성 (주말 제외) */
function generateFutureTradingDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  current.setDate(current.getDate() + 1); // 시작일 다음 날부터

  while (dates.length < count) {
    const dayOfWeek = current.getDay();
    // 주말 제외 (0=일요일, 6=토요일)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/** 이동평균 계산 */
function calculateMA(prices: number[], period: number): (number | null)[] {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return sum / period;
  });
}

/** 차트 데이터 생성 (종가, MA20, MA60) */
function generateChartData(
  allPrices: Array<{ date: string; adjClose: number }>,
  startIndex: number,
  endIndex: number
): ChartDataPoint[] {
  // MA 계산을 위해 60일 전부터 데이터 필요
  const maLookback = 60;
  const maStartIndex = Math.max(0, startIndex - maLookback);

  // 전체 가격 배열에서 adjClose만 추출
  const adjCloseSlice = allPrices.slice(maStartIndex, endIndex + 1).map((p) => p.adjClose);

  // MA 계산
  const ma20 = calculateMA(adjCloseSlice, 20);
  const ma60 = calculateMA(adjCloseSlice, 60);

  // 실제 필요한 구간만 추출
  const chartData: ChartDataPoint[] = [];

  for (let i = startIndex; i <= endIndex && i < allPrices.length; i++) {
    const sliceIndex = i - maStartIndex;
    chartData.push({
      date: allPrices[i].date,
      close: allPrices[i].adjClose,
      ma20: ma20[sliceIndex],
      ma60: ma60[sliceIndex],
    });
  }

  return chartData;
}

/** POST /api/recommend - 전략 추천 API */
export async function POST(request: Request): Promise<Response> {
  try {
    // 요청 본문 파싱
    const body = await request.json();

    // 스키마 유효성 검사
    const parseResult = RecommendRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const validatedRequest = parseResult.data;
    const ticker = validatedRequest.ticker;

    // 기준일 결정 (today인 경우 DB의 최신 날짜 사용)
    let referenceDate = validatedRequest.referenceDate;
    if (validatedRequest.baseType === "today") {
      const latestDate = getLatestDate(ticker);
      if (!latestDate) {
        return NextResponse.json(
          {
            success: false,
            error: "No price data available",
            message: `No price data found for ${ticker}`,
          },
          { status: 400 }
        );
      }
      referenceDate = latestDate;
    }

    // 과거 데이터 조회 기간 계산
    // 유사 구간 검색을 위해 가능한 모든 과거 데이터 사용 (ETF 시작일 이후 전체)
    // SOXL/TQQQ 모두 2010년에 시작됨
    const lookbackDateStr = "2010-01-01";

    // DB의 최신 날짜 조회 (기준일 이후 데이터도 포함하기 위해)
    const latestDateInDb = getLatestDate(ticker);

    // 전체 가격 데이터 조회 (기준일 이후 성과 확인 구간 데이터도 포함)
    const allPrices = getPricesByDateRange(
      {
        startDate: lookbackDateStr,
        endDate: latestDateInDb || referenceDate,
      },
      ticker
    );

    // 기준일 인덱스 찾기
    const referenceDateIndex = allPrices.findIndex((p) => p.date === referenceDate);
    if (referenceDateIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "Reference date not found",
          message: `No price data for ${referenceDate}`,
        },
        { status: 400 }
      );
    }

    // 기술적 지표 계산을 위한 충분한 데이터 확인 (최소 60일 필요)
    if (referenceDateIndex < 59) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient data for technical metrics",
          message: "At least 60 days of data required before reference date",
        },
        { status: 400 }
      );
    }

    // adjClose 배열 생성
    const adjClosePrices = allPrices.map((p) => p.adjClose);
    const dates = allPrices.map((p) => p.date);

    // 기준일의 기술적 지표 계산
    const referenceMetrics = calculateTechnicalMetrics(adjClosePrices, referenceDateIndex);
    if (!referenceMetrics) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to calculate technical metrics",
          message: "Could not calculate technical metrics for reference date",
        },
        { status: 500 }
      );
    }

    // 분석 구간 계산 (기준일 기준 20 거래일)
    const analysisStartIndex = Math.max(0, referenceDateIndex - ANALYSIS_PERIOD_DAYS + 1);
    const analysisPeriod = {
      startDate: allPrices[analysisStartIndex].date,
      endDate: referenceDate,
    };

    // 과거 기술적 지표 계산 (유사 구간 검색용)
    // CON-002: 유사 구간은 기준일로부터 최소 40일 이전
    const historicalMetrics: HistoricalMetrics[] = [];
    const maxHistoricalIndex = referenceDateIndex - MIN_PAST_GAP_DAYS;

    for (let i = 59; i <= maxHistoricalIndex; i++) {
      const metrics = calculateTechnicalMetrics(adjClosePrices, i);
      if (metrics) {
        historicalMetrics.push({
          date: allPrices[i].date,
          dateIndex: i,
          metrics,
        });
      }
    }

    if (historicalMetrics.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient historical data",
          message: "At least 3 similar periods required",
        },
        { status: 400 }
      );
    }

    // 유사 구간 Top 3 검색
    const similarPeriodsRaw = findSimilarPeriodsWithDates(
      referenceMetrics,
      historicalMetrics,
      dates,
      3
    );

    // 유사 구간별 성과 확인 구간 백테스트 실행
    const similarPeriods: SimilarPeriod[] = [];

    for (const period of similarPeriodsRaw) {
      // 성과 확인 구간 계산 (유사 구간 종료일 다음 거래일부터 20 거래일)
      const performanceStartIndex = period.endDateIndex + 1;
      const performanceEndIndex = performanceStartIndex + PERFORMANCE_PERIOD_DAYS - 1;

      // 성과 확인 구간 데이터가 충분한지 확인
      if (performanceEndIndex >= allPrices.length) {
        // 성과 확인 구간 데이터 부족 - 이 유사 구간 건너뛰기
        continue;
      }

      const performanceStartDate = allPrices[performanceStartIndex].date;
      const performanceEndDate = allPrices[performanceEndIndex].date;

      // 분석 구간 시작일 계산
      const analysisStartIdx = Math.max(0, period.endDateIndex - ANALYSIS_PERIOD_DAYS + 1);
      const startDate = allPrices[analysisStartIdx].date;

      // 성과 확인 구간 백테스트 실행 (Pro1, Pro2, Pro3)
      const backtestResults: Record<StrategyName, PeriodBacktestResult> = {
        Pro1: { returnRate: 0, mdd: 0 },
        Pro2: { returnRate: 0, mdd: 0 },
        Pro3: { returnRate: 0, mdd: 0 },
      };

      const strategies: StrategyName[] = ["Pro1", "Pro2", "Pro3"];
      const initialCapital = 10000000; // 1000만원

      for (const strategy of strategies) {
        try {
          // 백테스트 엔진 실행
          const engine = new BacktestEngine(strategy);

          // 성과 확인 구간용 가격 데이터 추출 (지표 계산을 위한 과거 데이터 포함)
          const backtestLookbackIndex = Math.max(0, performanceStartIndex - LOOKBACK_DAYS);
          const backtestPrices = allPrices.slice(backtestLookbackIndex, performanceEndIndex + 1);

          // 백테스트 시작 인덱스 계산
          const backtestStartIdx = performanceStartIndex - backtestLookbackIndex;

          const backtestRequest: BacktestRequest = {
            ticker,
            strategy,
            startDate: performanceStartDate,
            endDate: performanceEndDate,
            initialCapital,
          };

          const result = engine.run(backtestRequest, backtestPrices, backtestStartIdx);

          backtestResults[strategy] = {
            returnRate: result.returnRate,
            mdd: result.mdd,
          };
        } catch (error) {
          // 백테스트 실패 시 기본값 유지
          console.error(
            `Backtest failed for ${strategy} in period ending ${period.endDate}:`,
            error
          );
        }
      }

      // 유사 구간 차트 데이터 생성 (분석 구간 + 성과 확인 구간)
      const periodChartData = generateChartData(allPrices, analysisStartIdx, performanceEndIndex);

      similarPeriods.push({
        startDate,
        endDate: period.endDate,
        similarity: period.similarity,
        performanceStartDate,
        performanceEndDate,
        metrics: period.metrics,
        backtestResults,
        chartData: periodChartData,
      });
    }

    // 유사 구간이 3개 미만인 경우 처리
    if (similarPeriods.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient similar periods with performance data",
          message: `Only ${similarPeriods.length} similar periods found with sufficient performance data`,
        },
        { status: 400 }
      );
    }

    // 전략 점수 계산
    const isGoldenCross = referenceMetrics.isGoldenCross;
    const strategyScores = calculateAllStrategyScores(similarPeriods, isGoldenCross);

    // 추천 전략 결정
    const recommendedStrategyName = getRecommendedStrategy(strategyScores);
    const tierRatios = getStrategyTierRatios(recommendedStrategyName);
    const reason = generateRecommendReason(recommendedStrategyName, strategyScores);

    // 기준일 차트 데이터 생성 (분석 구간 20일 + 이후 20일)
    const refChartEndIndex = Math.min(
      referenceDateIndex + PERFORMANCE_PERIOD_DAYS,
      allPrices.length - 1
    );
    const referenceChartData = generateChartData(allPrices, analysisStartIndex, refChartEndIndex);

    // 기준일 이후 실제 데이터가 부족한 경우, 예상 거래일을 placeholder로 추가
    const actualDaysAfterRef = refChartEndIndex - referenceDateIndex;
    if (actualDaysAfterRef < PERFORMANCE_PERIOD_DAYS) {
      const missingDays = PERFORMANCE_PERIOD_DAYS - actualDaysAfterRef;
      const lastDataDate = allPrices[refChartEndIndex]?.date || referenceDate;
      const futureDates = generateFutureTradingDates(lastDataDate, missingDays);

      for (const futureDate of futureDates) {
        referenceChartData.push({
          date: futureDate,
          close: null, // 미래 날짜는 데이터 없음
          ma20: null,
          ma60: null,
        });
      }
    }

    // 결과 생성
    const result: RecommendResult = {
      referenceDate,
      analysisPeriod,
      metrics: referenceMetrics,
      referenceChartData,
      similarPeriods,
      strategyScores,
      recommendedStrategy: {
        strategy: recommendedStrategyName,
        tierRatios,
        reason,
      },
    };

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Recommend API error:", error);

    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        ...(isDev && { message: error instanceof Error ? error.message : "Unknown error" }),
      },
      { status: 500 }
    );
  }
}
