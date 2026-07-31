/**
 * /api/recommend 표시 계층 헬퍼 (이슈 #57)
 * 차트 데이터(종가·MA20·MA60)와 값을 비워 둔 미래 거래일은 화면 표시 용도이므로
 * RecommendationService 밖(route 옆)에 둔다. MA 계산은 기존 지표 모듈을 쓴다.
 */
import type { DailyPrice } from "@/types";
import { calculateSMA } from "@/backtest/metrics";
import { buildDateToIndexMap } from "@/utils/date-index";
import { PERFORMANCE_PERIOD_DAYS } from "@/recommend/similarity";
import type { ChartDataPoint, Recommendation, RecommendResult } from "@/recommend/types";

/** 주어진 날짜 이후 N개의 예상 거래일 생성 (주말 제외, UTC 기준) */
export function generateFutureTradingDates(startDate: string, count: number): string[] {
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

/** 차트 데이터 생성 (종가, MA20, MA60) */
export function generateChartData(
  allPrices: DailyPrice[],
  startIndex: number,
  endIndex: number
): ChartDataPoint[] {
  const adjClosePrices = allPrices.map((p) => p.adjClose);
  const chartData: ChartDataPoint[] = [];

  for (let i = startIndex; i <= endIndex && i < allPrices.length; i++) {
    chartData.push({
      date: allPrices[i].date,
      close: allPrices[i].adjClose,
      ma20: calculateSMA(adjClosePrices, 20, i),
      ma60: calculateSMA(adjClosePrices, 60, i),
    });
  }

  return chartData;
}

/**
 * 서비스 추천(상세 포함)을 화면 응답(RecommendResult)으로 변환
 * 기준일 차트는 분석 구간 뒤에 값을 비워 둔 미래 20 거래일을 붙인다
 * (원본 사이트와 동일하게 기준일 이후 실제 데이터가 있어도 표시하지 않는다)
 */
export function buildRecommendResult(
  recommendation: Recommendation,
  allPrices: DailyPrice[]
): RecommendResult {
  const { analysisPeriod, similarPeriods, strategyScores, downgradeInfo } = recommendation;
  if (!analysisPeriod || !similarPeriods || !strategyScores) {
    throw new Error(
      "상세 필드가 없는 추천은 화면 응답으로 변환할 수 없습니다 (requireDetail로 조회해야 합니다)"
    );
  }

  const dateToIndexMap = buildDateToIndexMap(allPrices);
  const indexOf = (date: string): number => {
    const index = dateToIndexMap.get(date);
    if (index === undefined) {
      throw new Error(`가격 데이터에 없는 날짜입니다: ${date}`);
    }
    return index;
  };

  const referenceChartData = generateChartData(
    allPrices,
    indexOf(analysisPeriod.startDate),
    indexOf(recommendation.referenceDate)
  );
  for (const futureDate of generateFutureTradingDates(
    recommendation.referenceDate,
    PERFORMANCE_PERIOD_DAYS
  )) {
    referenceChartData.push({ date: futureDate, close: null, ma20: null, ma60: null });
  }

  return {
    referenceDate: recommendation.referenceDate,
    analysisPeriod,
    metrics: recommendation.metrics,
    referenceChartData,
    similarPeriods: similarPeriods.map((period) => ({
      ...period,
      chartData: generateChartData(
        allPrices,
        indexOf(period.startDate),
        indexOf(period.performanceEndDate)
      ),
    })),
    strategyScores,
    recommendedStrategy: {
      strategy: recommendation.strategy,
      tierRatios: recommendation.tierRatios,
      reason: recommendation.reason,
    },
    downgradeInfo: downgradeInfo?.applied ? downgradeInfo : undefined,
  };
}
