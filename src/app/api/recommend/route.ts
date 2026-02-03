/**
 * 전략 추천 API 엔드포인트
 * POST /api/recommend
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth, isUnauthorized } from "@/lib/auth/api-auth";
import { BacktestEngine, applySOXLDowngrade, checkDivergenceCondition } from "@/backtest";
import { calculateTechnicalMetrics } from "@/backtest/metrics";
import type { BacktestRequest, StrategyName } from "@/backtest/types";
import { getPricesByDateRange, getLatestDate } from "@/database/prices";
import { getMetricsByDateRange } from "@/database/metrics";
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
  DowngradeInfo,
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

/** 주어진 날짜 이후 N개의 예상 거래일 생성 (주말 제외, UTC 기준) */
function generateFutureTradingDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + 1); // 시작일 다음 날부터 (UTC 기준)

  while (dates.length < count) {
    const dayOfWeek = current.getUTCDay();
    // 주말 제외 (0=일요일, 6=토요일)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
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
    // 인증 체크
    const authResult = await requireAuth();
    if (isUnauthorized(authResult)) {
      return authResult;
    }

    // 요청 본문 파싱
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

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
      const latestDate = await getLatestDate(ticker);
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
    const latestDateInDb = await getLatestDate(ticker);

    // 전체 가격 데이터 조회 (기준일 이후 성과 확인 구간 데이터도 포함)
    const allPrices = await getPricesByDateRange(
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

    // 과거 기술적 지표 조회 (유사 구간 검색용) - SPEC-PERFORMANCE-001
    // CON-002: 유사 구간은 기준일로부터 최소 40일 이전
    const historicalMetrics: HistoricalMetrics[] = [];
    const maxHistoricalIndex = referenceDateIndex - MIN_PAST_GAP_DAYS;
    const maxHistoricalDate = allPrices[maxHistoricalIndex].date;

    // 날짜-인덱스 맵 생성 (O(1) 조회용)
    const dateToIndexMap = new Map<string, number>();
    for (let i = 0; i < allPrices.length; i++) {
      dateToIndexMap.set(allPrices[i].date, i);
    }

    // DB에서 기술적 지표 조회 시도
    const metricsFromDb = await getMetricsByDateRange(
      { startDate: lookbackDateStr, endDate: maxHistoricalDate },
      ticker
    );

    if (metricsFromDb.length > 0) {
      // DB 지표 사용 (최적화된 경로)
      for (const metricRow of metricsFromDb) {
        const dateIndex = dateToIndexMap.get(metricRow.date);
        if (dateIndex === undefined || dateIndex > maxHistoricalIndex) continue;

        // null 값이 있는 행은 스킵 (기존 로직과 동일한 동작)
        if (
          metricRow.maSlope === null ||
          metricRow.disparity === null ||
          metricRow.rsi14 === null ||
          metricRow.roc12 === null ||
          metricRow.volatility20 === null
        ) {
          continue;
        }

        historicalMetrics.push({
          date: metricRow.date,
          dateIndex,
          metrics: {
            goldenCross: metricRow.goldenCross ?? 0,
            isGoldenCross: metricRow.isGoldenCross ?? false,
            maSlope: metricRow.maSlope,
            disparity: metricRow.disparity,
            rsi14: metricRow.rsi14,
            roc12: metricRow.roc12,
            volatility20: metricRow.volatility20,
          },
        });
      }
    }

    if (historicalMetrics.length < 3) {
      // Fallback: DB 지표가 부족하면 기존 방식으로 보완
      console.warn(
        `Metrics in DB are insufficient for ${ticker}, falling back to runtime calculation`
      );
      const existingIndex = new Set(historicalMetrics.map((m) => m.dateIndex));
      for (let i = 59; i <= maxHistoricalIndex; i++) {
        if (existingIndex.has(i)) continue;
        const metrics = calculateTechnicalMetrics(adjClosePrices, i);
        if (metrics) {
          historicalMetrics.push({
            date: allPrices[i].date,
            dateIndex: i,
            metrics,
          });
        }
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

    // 유사 구간 Top 3 검색 (정배열/역배열 필터 적용)
    // 기준일이 정배열이면 정배열 구간에서만, 역배열이면 역배열 구간에서만 검색
    const similarPeriodsRaw = findSimilarPeriodsWithDates(referenceMetrics, historicalMetrics, 3, {
      filterGoldenCross: referenceMetrics.isGoldenCross,
    });

    // 유사 구간별 성과 확인 구간 백테스트 실행 (SPEC-PERFORMANCE-001: 병렬화)
    const strategies: StrategyName[] = ["Pro1", "Pro2", "Pro3"];
    const initialCapital = 10000000; // 1000만원

    // 1단계: 유효한 유사 구간 필터링 및 백테스트 태스크 준비
    type BacktestTask = {
      periodIndex: number;
      period: (typeof similarPeriodsRaw)[0];
      strategy: StrategyName;
      performanceStartIndex: number;
      performanceEndIndex: number;
      performanceStartDate: string;
      performanceEndDate: string;
      analysisStartIdx: number;
      startDate: string;
      backtestLookbackIndex: number;
      backtestPrices: typeof allPrices;
      backtestStartIdx: number;
      backtestRequest: BacktestRequest;
    };

    const backtestTasks: BacktestTask[] = [];

    for (let periodIndex = 0; periodIndex < similarPeriodsRaw.length; periodIndex++) {
      const period = similarPeriodsRaw[periodIndex];

      // 성과 확인 구간 계산 (유사 구간 종료일 다음 거래일부터 20 거래일)
      const performanceStartIndex = period.endDateIndex + 1;
      const performanceEndIndex = performanceStartIndex + PERFORMANCE_PERIOD_DAYS - 1;

      // 성과 확인 구간 데이터가 충분한지 확인
      if (performanceEndIndex >= allPrices.length) {
        continue;
      }

      const performanceStartDate = allPrices[performanceStartIndex].date;
      const performanceEndDate = allPrices[performanceEndIndex].date;

      // 분석 구간 시작일 계산
      const analysisStartIdx = Math.max(0, period.endDateIndex - ANALYSIS_PERIOD_DAYS + 1);
      const startDate = allPrices[analysisStartIdx].date;

      // 백테스트용 가격 데이터 추출 (지표 계산을 위한 과거 데이터 포함)
      const backtestLookbackIndex = Math.max(0, performanceStartIndex - LOOKBACK_DAYS);
      const backtestPrices = allPrices.slice(backtestLookbackIndex, performanceEndIndex + 1);
      const backtestStartIdx = performanceStartIndex - backtestLookbackIndex;

      // 3개 전략에 대한 백테스트 태스크 생성
      for (const strategy of strategies) {
        backtestTasks.push({
          periodIndex,
          period,
          strategy,
          performanceStartIndex,
          performanceEndIndex,
          performanceStartDate,
          performanceEndDate,
          analysisStartIdx,
          startDate,
          backtestLookbackIndex,
          backtestPrices,
          backtestStartIdx,
          backtestRequest: {
            ticker,
            strategy,
            startDate: performanceStartDate,
            endDate: performanceEndDate,
            initialCapital,
          },
        });
      }
    }

    // 2단계: 모든 백테스트를 병렬로 실행
    const backtestPromises = backtestTasks.map(async (task) => {
      try {
        const engine = new BacktestEngine(task.strategy);
        const result = engine.run(task.backtestRequest, task.backtestPrices, task.backtestStartIdx);
        return {
          periodIndex: task.periodIndex,
          strategy: task.strategy,
          success: true as const,
          result: { returnRate: result.returnRate, mdd: result.mdd },
          task,
        };
      } catch (error) {
        console.warn(
          `Backtest failed for ${task.strategy} in period ending ${task.period.endDate}:`,
          error
        );
        return {
          periodIndex: task.periodIndex,
          strategy: task.strategy,
          success: false as const,
          error,
          task,
        };
      }
    });

    const backtestResults = await Promise.all(backtestPromises);

    // 3단계: 결과 그룹화 및 유사 구간 생성
    type PeriodResultGroup = {
      results: Record<StrategyName, PeriodBacktestResult>;
      failed: boolean;
      task: BacktestTask;
    };
    const resultsByPeriod = new Map<number, PeriodResultGroup>();

    for (const result of backtestResults) {
      if (!resultsByPeriod.has(result.periodIndex)) {
        resultsByPeriod.set(result.periodIndex, {
          results: {
            Pro1: { returnRate: 0, mdd: 0 },
            Pro2: { returnRate: 0, mdd: 0 },
            Pro3: { returnRate: 0, mdd: 0 },
          },
          failed: false,
          task: result.task,
        });
      }

      const periodResult = resultsByPeriod.get(result.periodIndex)!;

      if (!result.success) {
        periodResult.failed = true;
      } else {
        periodResult.results[result.strategy] = result.result;
      }
    }

    // 4단계: 유사 구간 배열 생성
    const similarPeriods: SimilarPeriod[] = [];

    for (const [_periodIndex, periodResult] of resultsByPeriod) {
      if (periodResult.failed) {
        continue;
      }

      const task = periodResult.task;

      // 유사 구간 차트 데이터 생성 (분석 구간 + 성과 확인 구간)
      const periodChartData = generateChartData(
        allPrices,
        task.analysisStartIdx,
        task.performanceEndIndex
      );

      similarPeriods.push({
        startDate: task.startDate,
        endDate: task.period.endDate,
        similarity: task.period.similarity,
        performanceStartDate: task.performanceStartDate,
        performanceEndDate: task.performanceEndDate,
        metrics: task.period.metrics,
        backtestResults: periodResult.results,
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

    // SOXL: 다이버전스 조건 발동 시 정배열 Pro1 제외 규칙 무시
    const isDivergenceCondition =
      ticker === "SOXL" &&
      checkDivergenceCondition(referenceMetrics, adjClosePrices, referenceDateIndex);

    // 전략 점수 계산
    const isGoldenCross = referenceMetrics.isGoldenCross;
    const strategyScores = calculateAllStrategyScores(similarPeriods, isGoldenCross, {
      skipPro1Exclusion: isDivergenceCondition,
    });

    // 추천 전략 결정
    let recommendedStrategyName = getRecommendedStrategy(strategyScores);

    // SOXL 전용 하향 규칙 적용
    let downgradeInfo: DowngradeInfo = {
      applied: false,
      reasons: [],
      skipPro1Exclusion: isDivergenceCondition,
    };
    if (ticker === "SOXL") {
      const result = applySOXLDowngrade(
        recommendedStrategyName,
        referenceMetrics,
        adjClosePrices,
        referenceDateIndex
      );
      recommendedStrategyName = result.strategy;
      downgradeInfo = {
        applied: result.applied,
        originalStrategy: result.originalStrategy,
        downgradedStrategy: result.strategy,
        reasons: result.reasons,
        skipPro1Exclusion: isDivergenceCondition,
      };
    }

    const tierRatios = getStrategyTierRatios(recommendedStrategyName);
    const reason = generateRecommendReason(recommendedStrategyName, strategyScores);

    // 기준일 차트 데이터 생성 (분석 구간만, 기준일 이후는 항상 placeholder)
    // 원본 사이트와 동일하게 기준일 이후 실제 데이터가 있어도 표시하지 않음
    const referenceChartData = generateChartData(allPrices, analysisStartIndex, referenceDateIndex);

    // 기준일 이후 20일은 항상 placeholder로 추가 (실제 데이터 유무와 관계없이)
    const futureDates = generateFutureTradingDates(referenceDate, PERFORMANCE_PERIOD_DAYS);
    for (const futureDate of futureDates) {
      referenceChartData.push({
        date: futureDate,
        close: null,
        ma20: null,
        ma60: null,
      });
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
      downgradeInfo: downgradeInfo.applied ? downgradeInfo : undefined,
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
