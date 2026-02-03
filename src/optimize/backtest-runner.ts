/**
 * 백테스트 실행 모듈
 * SPEC-PERF-001: REQ-F04, REQ-NF02
 */
import Decimal from "decimal.js";

import type { DailyPrice } from "@/types";
import { getAllPricesByTicker } from "@/database/prices";
import { setGlobalSimilarityParams, resetGlobalSimilarityParams } from "@/recommend/similarity";
import { RecommendBacktestEngine, clearRecommendationCache } from "@/backtest-recommend";

import type { OptimizationConfig, BacktestMetrics, SimilarityParams } from "./types";

/** 가격 데이터 로드 결과 */
export interface PriceDataResult {
  prices: DailyPrice[];
  dateToIndexMap: Map<string, number>;
}

/** 데이터베이스에서 티커의 전체 가격 데이터 로드 */
export async function loadPriceData(ticker: "SOXL" | "TQQQ"): Promise<PriceDataResult> {
  const prices = await getAllPricesByTicker(ticker);
  const dateToIndexMap = new Map<string, number>();

  for (let i = 0; i < prices.length; i++) {
    dateToIndexMap.set(prices[i].date, i);
  }

  return { prices, dateToIndexMap };
}

/**
 * 전략 점수 계산
 * 공식: returnRate × exp(mdd × 0.01)
 * MDD가 클수록(큰 손실) 점수가 낮아짐
 */
export function calculateStrategyScore(returnRate: number, mdd: number): number {
  return new Decimal(returnRate)
    .mul(new Decimal(mdd).mul(0.01).exp())
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * 커스텀 유사도 파라미터로 백테스트 실행
 * params가 null이면 기본 파라미터(베이스라인)로 실행
 * 주의: priceData는 필수 파라미터입니다. loadPriceData()로 미리 로드하세요.
 */
export async function runBacktestWithParams(
  config: OptimizationConfig,
  params: SimilarityParams | null,
  priceData: PriceDataResult
): Promise<BacktestMetrics> {
  const { ticker, startDate, endDate, initialCapital } = config;
  const { prices, dateToIndexMap } = priceData;

  const startIndex = dateToIndexMap.get(startDate);
  if (startIndex === undefined) {
    throw new Error(`시작일 ${startDate}에 해당하는 가격 데이터가 없습니다.`);
  }

  const endIndex = dateToIndexMap.get(endDate);
  if (endIndex === undefined) {
    throw new Error(`종료일 ${endDate}에 해당하는 가격 데이터가 없습니다.`);
  }

  // 종료일까지의 가격 데이터만 사용
  const backtestPrices = prices.slice(0, endIndex + 1);
  const backtestDateToIndexMap = new Map<string, number>();
  for (let i = 0; i < backtestPrices.length; i++) {
    backtestDateToIndexMap.set(backtestPrices[i].date, i);
  }

  clearRecommendationCache();

  if (params !== null) {
    setGlobalSimilarityParams(params.weights, params.tolerances);
  }

  try {
    const engine = new RecommendBacktestEngine(ticker, backtestPrices, backtestDateToIndexMap, {
      skipDbCache: params !== null,
    });

    const result = await engine.run({ ticker, startDate, endDate, initialCapital }, startIndex);
    const strategyScore = calculateStrategyScore(result.returnRate, result.mdd);

    return {
      returnRate: result.returnRate,
      mdd: result.mdd,
      strategyScore,
      totalCycles: result.totalCycles,
      winRate: result.winRate,
    };
  } finally {
    if (params !== null) {
      resetGlobalSimilarityParams();
    }
  }
}
