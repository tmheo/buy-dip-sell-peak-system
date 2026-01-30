/**
 * 백테스트 실행 모듈
 * SPEC-PERF-001: REQ-F04, REQ-NF02
 *
 * 커스텀 유사도 파라미터로 백테스트를 실행하고 결과 메트릭을 추출합니다.
 * - 가격 데이터 로드 및 캐싱
 * - 글로벌 유사도 파라미터 설정 후 백테스트 실행
 * - 전략 점수 계산 (수익률 × exp(MDD × 0.01))
 */
import Decimal from "decimal.js";

import type { DailyPrice } from "@/types";
import { getAllPricesByTicker } from "@/database";
import { setGlobalSimilarityParams, resetGlobalSimilarityParams } from "@/recommend/similarity";
import { RecommendBacktestEngine, clearRecommendationCache } from "@/backtest-recommend";

import type { OptimizationConfig, BacktestMetrics, SimilarityParams } from "./types";

// ============================================================
// 타입 정의
// ============================================================

/**
 * 가격 데이터 로드 결과
 * 백테스트 실행에 필요한 가격 데이터와 날짜-인덱스 맵
 */
export interface PriceDataResult {
  /** 전체 가격 데이터 배열 (날짜 오름차순) */
  prices: DailyPrice[];
  /** 날짜 문자열 → 인덱스 매핑 (O(1) 조회용) */
  dateToIndexMap: Map<string, number>;
}

// ============================================================
// 가격 데이터 로드
// ============================================================

/**
 * 데이터베이스에서 티커의 전체 가격 데이터 로드
 * REQ-F04: 백테스트 실행을 위한 가격 데이터 준비
 *
 * @param ticker - 종목 티커 ("SOXL" | "TQQQ")
 * @returns 가격 데이터 배열과 날짜-인덱스 맵
 *
 * @example
 * const { prices, dateToIndexMap } = loadPriceData("SOXL");
 * const index = dateToIndexMap.get("2025-01-02"); // 특정 날짜의 인덱스 조회
 */
export function loadPriceData(ticker: "SOXL" | "TQQQ"): PriceDataResult {
  // 데이터베이스에서 전체 가격 데이터 조회 (날짜 오름차순 정렬됨)
  const prices = getAllPricesByTicker(ticker);

  // 날짜 → 인덱스 매핑 생성 (O(1) 조회를 위해)
  const dateToIndexMap = new Map<string, number>();
  for (let i = 0; i < prices.length; i++) {
    dateToIndexMap.set(prices[i].date, i);
  }

  return { prices, dateToIndexMap };
}

// ============================================================
// 전략 점수 계산
// ============================================================

/**
 * 전략 점수 계산
 * REQ-F05, REQ-NF02: 수익률과 MDD를 기반으로 전략 점수 산출
 *
 * 공식: strategyScore = returnRate × exp(mdd × 0.01)
 *
 * MDD가 음수이므로 exp(mdd × 0.01)은 1보다 작음
 * → MDD가 클수록(큰 손실) 점수가 낮아짐
 *
 * @param returnRate - 수익률 (소수점, 예: 0.45 = 45%)
 * @param mdd - 최대 낙폭 (소수점, 음수, 예: -0.18 = -18%)
 * @returns 전략 점수
 *
 * @example
 * // 수익률 45%, MDD -18%
 * const score = calculateStrategyScore(0.45, -0.18);
 * // 0.45 × exp(-0.18 × 0.01) = 0.45 × exp(-0.0018) ≈ 0.4492
 */
export function calculateStrategyScore(returnRate: number, mdd: number): number {
  // Decimal.js를 사용하여 정밀한 계산 수행
  const returnRateDec = new Decimal(returnRate);
  const mddDec = new Decimal(mdd);

  // exp(mdd × 0.01)
  const exponent = mddDec.mul(0.01);
  const expValue = exponent.exp();

  // returnRate × exp(mdd × 0.01)
  const score = returnRateDec.mul(expValue);

  // 소수점 6자리로 반올림하여 반환
  return score.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
}

// ============================================================
// 백테스트 실행
// ============================================================

/**
 * 커스텀 유사도 파라미터로 백테스트 실행
 * REQ-F04: 각 파라미터 조합에 대해 백테스트 실행
 *
 * @param config - 최적화 설정 (티커, 기간, 초기자본 등)
 * @param params - 유사도 파라미터 (null이면 기본값 사용 = 베이스라인)
 * @param priceData - 미리 로드된 가격 데이터 (선택적, 없으면 내부에서 로드)
 * @returns 백테스트 결과 메트릭
 *
 * 동작 방식:
 * 1. params가 null이면 기본 파라미터(베이스라인)로 백테스트
 * 2. params가 있으면 글로벌 파라미터를 설정한 후 백테스트
 * 3. try-finally로 항상 파라미터를 원래대로 복원
 *
 * @example
 * // 베이스라인 실행
 * const baseline = runBacktestWithParams(config, null);
 *
 * // 커스텀 파라미터 실행
 * const customParams = {
 *   weights: [0.3, 0.45, 0.08, 0.05, 0.12],
 *   tolerances: [42, 85, 5.2, 35, 32]
 * };
 * const result = runBacktestWithParams(config, customParams);
 */
export function runBacktestWithParams(
  config: OptimizationConfig,
  params: SimilarityParams | null,
  priceData?: PriceDataResult
): BacktestMetrics {
  const { ticker, startDate, endDate, initialCapital } = config;

  // 가격 데이터 로드 (전달받지 않은 경우)
  const { prices, dateToIndexMap } = priceData ?? loadPriceData(ticker);

  // 시작일 인덱스 찾기
  const startIndex = dateToIndexMap.get(startDate);
  if (startIndex === undefined) {
    throw new Error(`시작일 ${startDate}에 해당하는 가격 데이터가 없습니다.`);
  }

  // 종료일 이후 데이터 제거를 위해 종료 인덱스 찾기
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

  // 추천 캐시 초기화 (각 파라미터 조합별로 새로 계산해야 함)
  clearRecommendationCache();

  // 커스텀 파라미터가 있으면 글로벌 설정
  if (params !== null) {
    setGlobalSimilarityParams(params.weights, params.tolerances);
  }

  try {
    // RecommendBacktestEngine으로 백테스트 실행
    // 커스텀 파라미터 사용 시 DB 캐시를 건너뛰어야 함 (파라미터별로 다른 결과가 나와야 하므로)
    const engine = new RecommendBacktestEngine(ticker, backtestPrices, backtestDateToIndexMap, {
      skipDbCache: params !== null,
    });

    const result = engine.run(
      {
        ticker,
        startDate,
        endDate,
        initialCapital,
      },
      startIndex
    );

    // 결과 메트릭 추출
    const returnRate = result.returnRate;
    const mdd = result.mdd;
    const totalCycles = result.totalCycles;
    const winRate = result.winRate;

    // 전략 점수 계산
    const strategyScore = calculateStrategyScore(returnRate, mdd);

    return {
      returnRate,
      mdd,
      strategyScore,
      totalCycles,
      winRate,
    };
  } finally {
    // 항상 글로벌 파라미터를 기본값으로 복원
    if (params !== null) {
      resetGlobalSimilarityParams();
    }
  }
}
