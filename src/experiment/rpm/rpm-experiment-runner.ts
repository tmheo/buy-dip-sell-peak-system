/**
 * RPM 실험 실행기 및 성과 비교 리포트
 * SPEC-RPM-EXPERIMENT-001 REQ-005, REQ-007
 *
 * 베이스라인(기존 5개 지표)과 RPM(8개 지표) 방식 백테스트 비교
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import { RecommendBacktestEngine } from "@/backtest-recommend/engine";
import type { RecommendBacktestResult } from "@/backtest-recommend/types";
import { calculateStrategyScore } from "@/recommend/score";
import { clearRecommendationCache } from "@/backtest-recommend/recommend-helper";

import type { ExperimentBacktestMetrics, ExperimentResult } from "./types";
import { RpmRecommendBacktestEngine, clearRpmRecommendationCache } from "./rpm-recommend-engine";

/**
 * 실험 설정
 */
export interface ExperimentRunnerConfig {
  /** 종목 (기본: SOXL) */
  ticker: "SOXL" | "TQQQ";
  /** 시작일 (기본: 2025-01-01) */
  startDate: string;
  /** 종료일 (기본: 2025-12-31) */
  endDate: string;
  /** 시드 캐피탈 (기본: 10000) */
  seedCapital: number;
}

/** 기본 실험 설정 */
export const DEFAULT_EXPERIMENT_CONFIG: ExperimentRunnerConfig = {
  ticker: "SOXL",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  seedCapital: 10000,
};

/** 추천 시스템 lookback 시작일 (충분한 과거 데이터 확보) */
const RECOMMEND_LOOKBACK_START = "2010-01-01";

/**
 * 가격 데이터와 날짜-인덱스 맵 준비
 * @param allPrices - 전체 가격 데이터
 * @returns 날짜-인덱스 맵
 */
function createDateToIndexMap(allPrices: DailyPrice[]): Map<string, number> {
  const map = new Map<string, number>();
  allPrices.forEach((price, index) => {
    map.set(price.date, index);
  });
  return map;
}

/**
 * 베이스라인 백테스트 실행 (기존 5개 지표 방식)
 *
 * @param allPrices - 전체 가격 데이터 (lookback 포함)
 * @param config - 실험 설정
 * @returns 백테스트 결과
 */
export function runBaselineBacktest(
  allPrices: DailyPrice[],
  config: ExperimentRunnerConfig = DEFAULT_EXPERIMENT_CONFIG
): RecommendBacktestResult {
  const dateToIndexMap = createDateToIndexMap(allPrices);

  // 백테스트 시작 인덱스 찾기
  const backtestStartIndex = allPrices.findIndex((p) => p.date >= config.startDate);
  if (backtestStartIndex < 0) {
    throw new Error(`시작일 ${config.startDate}에 해당하는 가격 데이터를 찾을 수 없습니다.`);
  }

  // 캐시 초기화 (공정한 비교를 위해)
  clearRecommendationCache();

  const engine = new RecommendBacktestEngine(config.ticker, allPrices, dateToIndexMap);

  return engine.run(
    {
      ticker: config.ticker,
      startDate: config.startDate,
      endDate: config.endDate,
      initialCapital: config.seedCapital,
    },
    backtestStartIndex
  );
}

/**
 * RPM 방식 백테스트 실행 (8개 지표 방식)
 *
 * @param allPrices - 전체 가격 데이터 (lookback 포함)
 * @param config - 실험 설정
 * @returns 백테스트 결과
 */
export function runRpmBacktest(
  allPrices: DailyPrice[],
  config: ExperimentRunnerConfig = DEFAULT_EXPERIMENT_CONFIG
): RecommendBacktestResult {
  const dateToIndexMap = createDateToIndexMap(allPrices);

  // 백테스트 시작 인덱스 찾기
  const backtestStartIndex = allPrices.findIndex((p) => p.date >= config.startDate);
  if (backtestStartIndex < 0) {
    throw new Error(`시작일 ${config.startDate}에 해당하는 가격 데이터를 찾을 수 없습니다.`);
  }

  // 캐시 초기화 (공정한 비교를 위해)
  clearRpmRecommendationCache();

  const engine = new RpmRecommendBacktestEngine(config.ticker, allPrices, dateToIndexMap);

  return engine.run(
    {
      ticker: config.ticker,
      startDate: config.startDate,
      endDate: config.endDate,
      initialCapital: config.seedCapital,
    },
    backtestStartIndex
  );
}

/**
 * 백테스트 결과에서 메트릭 추출
 *
 * @param result - 백테스트 결과
 * @returns 실험 백테스트 메트릭
 */
export function extractMetrics(result: RecommendBacktestResult): ExperimentBacktestMetrics {
  // 수익률과 MDD를 % 단위로 변환 (strategyScore 계산용)
  const returnRatePercent = new Decimal(result.returnRate)
    .mul(100)
    .toDecimalPlaces(4, Decimal.ROUND_DOWN)
    .toNumber();
  const mddPercent = new Decimal(result.mdd)
    .mul(100)
    .toDecimalPlaces(4, Decimal.ROUND_DOWN)
    .toNumber();

  const strategyScore = calculateStrategyScore(returnRatePercent, mddPercent);

  return {
    returnRate: result.returnRate,
    mdd: result.mdd,
    cagr: result.cagr,
    winRate: result.winRate,
    totalCycles: result.totalCycles,
    strategyScore,
  };
}

/**
 * 개선율 계산
 *
 * @param baseline - 베이스라인 값
 * @param experimental - 실험군 값
 * @returns 개선율 (%)
 */
export function calculateImprovement(baseline: number, experimental: number): number {
  if (baseline === 0) {
    return experimental > 0 ? 100 : experimental < 0 ? -100 : 0;
  }

  // MDD 개선율 계산시 특별 처리:
  // MDD가 음수이므로 experimental이 baseline보다 덜 음수면(더 좋으면) 양수 개선율
  // 예: baseline=-20%, experimental=-15% -> 개선율 = (|-15| - |-20|) / |-20| * 100 = -25% (25% 개선)
  // 그러나 단순 계산 ((exp - base) / |base|) * 100 으로 계산
  return new Decimal(experimental)
    .minus(baseline)
    .div(new Decimal(baseline).abs())
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();
}

/**
 * MDD 개선율 계산 (MDD는 음수이므로 양수면 개선)
 * 예: baseline=-20%, experimental=-15% -> 개선율 = 25% (덜 빠짐)
 *
 * @param baselineMdd - 베이스라인 MDD (음수)
 * @param experimentalMdd - 실험군 MDD (음수)
 * @returns 개선율 (%) - 양수면 개선
 */
export function calculateMddImprovement(baselineMdd: number, experimentalMdd: number): number {
  if (baselineMdd === 0) {
    return experimentalMdd === 0 ? 0 : experimentalMdd > baselineMdd ? 100 : -100;
  }

  // MDD가 덜 빠지면(덜 음수면) 개선
  // 개선율 = (|baseline| - |experimental|) / |baseline| * 100
  const baselineAbs = Math.abs(baselineMdd);
  const experimentalAbs = Math.abs(experimentalMdd);

  return new Decimal(baselineAbs)
    .minus(experimentalAbs)
    .div(baselineAbs)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();
}

/**
 * 성과 비교 및 리포트 생성
 *
 * @param baseline - 베이스라인 백테스트 결과
 * @param experimental - 실험군 백테스트 결과
 * @returns 실험 결과 비교
 */
export function compareResults(
  baseline: RecommendBacktestResult,
  experimental: RecommendBacktestResult
): ExperimentResult {
  const baselineMetrics = extractMetrics(baseline);
  const experimentalMetrics = extractMetrics(experimental);

  return {
    baseline: baselineMetrics,
    experimental: experimentalMetrics,
    improvement: {
      returnRate: calculateImprovement(baselineMetrics.returnRate, experimentalMetrics.returnRate),
      mdd: calculateMddImprovement(baselineMetrics.mdd, experimentalMetrics.mdd),
      strategyScore: calculateImprovement(
        baselineMetrics.strategyScore,
        experimentalMetrics.strategyScore
      ),
    },
  };
}

/**
 * 비교 리포트 문자열 생성
 *
 * @param result - 실험 결과
 * @param config - 실험 설정
 * @returns 포맷된 리포트 문자열
 */
export function formatComparisonReport(
  result: ExperimentResult,
  config: ExperimentRunnerConfig = DEFAULT_EXPERIMENT_CONFIG
): string {
  const lines: string[] = [];

  lines.push("========================================");
  lines.push("RPM 실험 결과 비교");
  lines.push("========================================");
  lines.push(`기간: ${config.startDate} ~ ${config.endDate}`);
  lines.push(`종목: ${config.ticker}`);
  lines.push(`시드: $${config.seedCapital.toLocaleString()}`);
  lines.push("----------------------------------------");
  lines.push("항목          | 베이스라인 | RPM 방식  | 개선율");
  lines.push("--------------|-----------|----------|--------");

  // 수익률 (% 단위로 표시)
  const baseReturnPct = (result.baseline.returnRate * 100).toFixed(2);
  const expReturnPct = (result.experimental.returnRate * 100).toFixed(2);
  const returnImprove = result.improvement.returnRate >= 0 ? "+" : "";
  lines.push(
    `수익률 (%)    | ${baseReturnPct.padStart(9)} | ${expReturnPct.padStart(8)} | ${returnImprove}${result.improvement.returnRate.toFixed(2)}%`
  );

  // MDD (% 단위로 표시)
  const baseMddPct = (result.baseline.mdd * 100).toFixed(2);
  const expMddPct = (result.experimental.mdd * 100).toFixed(2);
  const mddImprove = result.improvement.mdd >= 0 ? "+" : "";
  lines.push(
    `MDD (%)       | ${baseMddPct.padStart(9)} | ${expMddPct.padStart(8)} | ${mddImprove}${result.improvement.mdd.toFixed(2)}%`
  );

  // 전략 점수
  const baseScore = result.baseline.strategyScore.toFixed(2);
  const expScore = result.experimental.strategyScore.toFixed(2);
  const scoreImprove = result.improvement.strategyScore >= 0 ? "+" : "";
  lines.push(
    `전략 점수     | ${baseScore.padStart(9)} | ${expScore.padStart(8)} | ${scoreImprove}${result.improvement.strategyScore.toFixed(2)}%`
  );

  // 추가 지표
  lines.push("----------------------------------------");
  lines.push("추가 지표:");
  lines.push(
    `  CAGR       : ${(result.baseline.cagr * 100).toFixed(2)}% -> ${(result.experimental.cagr * 100).toFixed(2)}%`
  );
  lines.push(
    `  승률       : ${(result.baseline.winRate * 100).toFixed(1)}% -> ${(result.experimental.winRate * 100).toFixed(1)}%`
  );
  lines.push(`  총 사이클  : ${result.baseline.totalCycles} -> ${result.experimental.totalCycles}`);
  lines.push("========================================");

  return lines.join("\n");
}

/**
 * 비교 리포트 출력
 *
 * @param result - 실험 결과
 * @param config - 실험 설정
 */
export function printComparisonReport(
  result: ExperimentResult,
  config: ExperimentRunnerConfig = DEFAULT_EXPERIMENT_CONFIG
): void {
  console.log(formatComparisonReport(result, config));
}

/**
 * 전체 실험 실행 및 리포트 반환
 *
 * @param allPrices - 전체 가격 데이터 (2010년부터 포함)
 * @param config - 실험 설정
 * @param options - 실험 옵션
 * @returns 실험 결과
 */
export function runExperiment(
  allPrices: DailyPrice[],
  config: ExperimentRunnerConfig = DEFAULT_EXPERIMENT_CONFIG,
  options: {
    /** 콘솔 출력 여부 (기본: true) */
    verbose?: boolean;
  } = {}
): ExperimentResult {
  const { verbose = true } = options;

  if (verbose) {
    console.log("========================================");
    console.log("RPM 실험 시작");
    console.log(`기간: ${config.startDate} ~ ${config.endDate}`);
    console.log(`종목: ${config.ticker}`);
    console.log(`시드: $${config.seedCapital.toLocaleString()}`);
    console.log("========================================\n");
  }

  // 1. 베이스라인 백테스트
  if (verbose) {
    console.log("[1/3] 베이스라인 백테스트 실행 중...");
  }
  const baselineResult = runBaselineBacktest(allPrices, config);

  // 2. RPM 방식 백테스트
  if (verbose) {
    console.log("[2/3] RPM 방식 백테스트 실행 중...");
  }
  const rpmResult = runRpmBacktest(allPrices, config);

  // 3. 결과 비교
  if (verbose) {
    console.log("[3/3] 결과 비교 중...\n");
  }
  const comparison = compareResults(baselineResult, rpmResult);

  // 리포트 출력
  if (verbose) {
    printComparisonReport(comparison, config);
  }

  return comparison;
}

/**
 * Lookback 시작일 반환 (외부 모듈에서 사용)
 */
export function getRecommendLookbackStart(): string {
  return RECOMMEND_LOOKBACK_START;
}
