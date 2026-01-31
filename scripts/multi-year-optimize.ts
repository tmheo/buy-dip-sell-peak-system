/**
 * 5개년 통합 유사도 파라미터 최적화
 * 2021-2025년 모든 연도에서 좋은 성과를 내는 파라미터 탐색
 */
import Decimal from "decimal.js";
import {
  loadPriceData,
  runBacktestWithParams,
  type PriceDataResult,
} from "../src/optimize/backtest-runner";
import { generateRandomParams, generateVariations } from "../src/optimize/param-generator";
import type { OptimizationConfig, SimilarityParams, BacktestMetrics } from "../src/optimize/types";
import { METRIC_WEIGHTS, METRIC_TOLERANCES } from "../src/recommend/similarity";

// ============================================================
// 설정
// ============================================================

const YEARS = [
  { year: 2021, start: "2021-01-04", end: "2021-12-31" },
  { year: 2022, start: "2022-01-03", end: "2022-12-30" },
  { year: 2023, start: "2023-01-03", end: "2023-12-29" },
  { year: 2024, start: "2024-01-02", end: "2024-12-31" },
  { year: 2025, start: "2025-01-02", end: "2025-12-31" },
];

// 타겟 값 (원본 사이트 결과)
const TARGETS = [
  { year: 2021, returnRate: 0.726, mdd: -0.1395 },
  { year: 2022, returnRate: 0.4311, mdd: -0.2104 },
  { year: 2023, returnRate: 0.4555, mdd: -0.1673 },
  { year: 2024, returnRate: 0.969, mdd: -0.1266 },
  { year: 2025, returnRate: 0.8039, mdd: -0.1816 },
];

// 최적화 설정
const RANDOM_COMBINATIONS = 50; // 랜덤 조합 수
const TOP_CANDIDATES = 3; // 상위 후보 수
const VARIATIONS_PER_TOP = 10; // 후보당 변형 수
const INITIAL_CAPITAL = 10000;

// ============================================================
// 타입
// ============================================================

interface YearResult {
  year: number;
  returnRate: number;
  mdd: number;
  strategyScore: number;
}

interface MultiYearResult {
  params: SimilarityParams;
  yearResults: YearResult[];
  combinedScore: number;
  avgReturnRate: number;
  avgMdd: number;
  minReturnRate: number; // 최악의 연도 수익률
  targetDiffSum: number; // 타겟 대비 차이 합계
}

// ============================================================
// 유틸리티
// ============================================================

function logProgress(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${timestamp}] ${message}\n`);
}

function formatPercent(value: number, decimals: number = 2): string {
  return new Decimal(value).mul(100).toDecimalPlaces(decimals).toNumber() + "%";
}

function formatScore(score: number): string {
  return new Decimal(score).toDecimalPlaces(4).toString();
}

// ============================================================
// 다년도 백테스트
// ============================================================

/**
 * 5개년 백테스트 실행 및 통합 점수 계산
 */
function runMultiYearBacktest(
  params: SimilarityParams | null,
  priceData: PriceDataResult
): MultiYearResult {
  const yearResults: YearResult[] = [];
  let totalStrategyScore = 0;
  let totalReturnRate = 0;
  let totalMdd = 0;
  let minReturnRate = Infinity;
  let targetDiffSum = 0;

  for (let i = 0; i < YEARS.length; i++) {
    const yearInfo = YEARS[i];
    const target = TARGETS[i];

    const config: OptimizationConfig = {
      ticker: "SOXL",
      startDate: yearInfo.start,
      endDate: yearInfo.end,
      initialCapital: INITIAL_CAPITAL,
      randomCombinations: 50,
      variationsPerTop: 10,
      topCandidates: 3,
    };

    const result = runBacktestWithParams(config, params, priceData);

    yearResults.push({
      year: yearInfo.year,
      returnRate: result.returnRate,
      mdd: result.mdd,
      strategyScore: result.strategyScore,
    });

    totalStrategyScore += result.strategyScore;
    totalReturnRate += result.returnRate;
    totalMdd += result.mdd;
    minReturnRate = Math.min(minReturnRate, result.returnRate);

    // 타겟 대비 차이 (수익률 기준)
    targetDiffSum += result.returnRate - target.returnRate;
  }

  const yearCount = YEARS.length;

  // 통합 점수 계산:
  // 1. 평균 전략 점수
  // 2. 최소 수익률 보너스 (모든 연도에서 일정 수준 유지)
  // 3. 타겟 대비 차이 보너스
  const avgStrategyScore = totalStrategyScore / yearCount;
  const minReturnBonus = minReturnRate > 0 ? minReturnRate * 0.2 : 0;
  const targetBonus = targetDiffSum > 0 ? targetDiffSum * 0.1 : targetDiffSum * 0.05;

  const combinedScore = avgStrategyScore + minReturnBonus + targetBonus;

  return {
    params: params ?? { weights: [...METRIC_WEIGHTS], tolerances: [...METRIC_TOLERANCES] },
    yearResults,
    combinedScore,
    avgReturnRate: totalReturnRate / yearCount,
    avgMdd: totalMdd / yearCount,
    minReturnRate,
    targetDiffSum,
  };
}

// ============================================================
// 메인 실행
// ============================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log("=== 5개년 통합 유사도 파라미터 최적화 ===\n");
  console.log(`설정: 랜덤=${RANDOM_COMBINATIONS}개, 상위=${TOP_CANDIDATES}개, 변형=${VARIATIONS_PER_TOP}개/후보`);
  console.log(`대상 연도: ${YEARS.map((y) => y.year).join(", ")}\n`);

  // 1. 가격 데이터 로드
  logProgress("SOXL 가격 데이터 로드 중...");
  const priceData = loadPriceData("SOXL");
  logProgress(`가격 데이터 로드 완료: ${priceData.prices.length}개 일자`);

  // 2. 베이스라인 (현재 파라미터)
  logProgress("베이스라인 (현재 파라미터) 측정 중...");
  const baseline = runMultiYearBacktest(null, priceData);
  logProgress(
    `베이스라인: 통합점수=${formatScore(baseline.combinedScore)}, ` +
      `평균수익률=${formatPercent(baseline.avgReturnRate)}, 평균MDD=${formatPercent(baseline.avgMdd)}`
  );

  // 3. 랜덤 파라미터 생성 및 백테스트
  logProgress(`랜덤 파라미터 ${RANDOM_COMBINATIONS}개 생성 중...`);
  const randomParams = generateRandomParams(RANDOM_COMBINATIONS);

  const randomResults: MultiYearResult[] = [];
  for (let i = 0; i < randomParams.length; i++) {
    const result = runMultiYearBacktest(randomParams[i], priceData);
    randomResults.push(result);

    if ((i + 1) % 10 === 0) {
      logProgress(`랜덤 백테스트 진행 중: ${i + 1}/${randomParams.length}`);
    }
  }
  logProgress("랜덤 백테스트 완료");

  // 4. 상위 후보 선택 (통합 점수 기준)
  logProgress(`상위 ${TOP_CANDIDATES}개 후보 선택 중...`);
  const sortedRandom = [...randomResults].sort((a, b) => b.combinedScore - a.combinedScore);
  const topCandidates = sortedRandom.slice(0, TOP_CANDIDATES);
  logProgress(
    `상위 후보: ${topCandidates.map((c) => formatScore(c.combinedScore)).join(", ")}`
  );

  // 5. 상위 후보 변형 생성 및 백테스트
  const variationResults: MultiYearResult[] = [];
  for (let candIdx = 0; candIdx < topCandidates.length; candIdx++) {
    const candidate = topCandidates[candIdx];
    logProgress(`후보 #${candIdx + 1} 변형 ${VARIATIONS_PER_TOP}개 생성 중...`);
    const variations = generateVariations(candidate.params, VARIATIONS_PER_TOP);

    for (let i = 0; i < variations.length; i++) {
      const result = runMultiYearBacktest(variations[i], priceData);
      variationResults.push(result);

      if ((i + 1) % 10 === 0) {
        logProgress(`후보 #${candIdx + 1} 변형 백테스트: ${i + 1}/${variations.length}`);
      }
    }
  }
  logProgress(`변형 백테스트 완료: ${variationResults.length}개`);

  // 6. 전체 결과 분석
  const allResults = [...randomResults, ...variationResults];
  const sortedAll = [...allResults].sort((a, b) => b.combinedScore - a.combinedScore);
  const best = sortedAll[0];

  const executionTime = Math.round((Date.now() - startTime) / 1000);

  // 7. 결과 출력
  console.log("\n" + "=".repeat(60));
  console.log("=== 5개년 통합 최적화 결과 ===");
  console.log("=".repeat(60));

  console.log("\n[베이스라인 (현재 파라미터)]");
  console.log(`  가중치: [${METRIC_WEIGHTS.join(", ")}]`);
  console.log(`  허용오차: [${METRIC_TOLERANCES.join(", ")}]`);
  console.log(`  통합 점수: ${formatScore(baseline.combinedScore)}`);
  console.log(`  평균 수익률: ${formatPercent(baseline.avgReturnRate)}`);
  console.log(`  평균 MDD: ${formatPercent(baseline.avgMdd)}`);
  console.log(`  최소 수익률: ${formatPercent(baseline.minReturnRate)}`);
  console.log("\n  연도별 결과:");
  for (const yr of baseline.yearResults) {
    const target = TARGETS.find((t) => t.year === yr.year)!;
    const diff = yr.returnRate - target.returnRate;
    const diffSign = diff >= 0 ? "+" : "";
    console.log(
      `    ${yr.year}: 수익률=${formatPercent(yr.returnRate)} (타겟: ${formatPercent(target.returnRate)}, ${diffSign}${formatPercent(diff)}), MDD=${formatPercent(yr.mdd)}`
    );
  }

  console.log("\n[최적 파라미터]");
  console.log(`  가중치: [${best.params.weights.map((w) => new Decimal(w).toDecimalPlaces(4).toNumber()).join(", ")}]`);
  console.log(`  허용오차: [${best.params.tolerances.map((t) => new Decimal(t).toDecimalPlaces(2).toNumber()).join(", ")}]`);
  console.log(`  통합 점수: ${formatScore(best.combinedScore)}`);
  console.log(`  평균 수익률: ${formatPercent(best.avgReturnRate)}`);
  console.log(`  평균 MDD: ${formatPercent(best.avgMdd)}`);
  console.log(`  최소 수익률: ${formatPercent(best.minReturnRate)}`);

  const baselineAbs = Math.abs(baseline.combinedScore);
  const improvement = baselineAbs > 0
    ? ((best.combinedScore - baseline.combinedScore) / baselineAbs) * 100
    : 0;
  console.log(`  개선율: ${improvement >= 0 ? "+" : ""}${new Decimal(improvement).toDecimalPlaces(2).toNumber()}%`);

  console.log("\n  연도별 결과:");
  for (const yr of best.yearResults) {
    const target = TARGETS.find((t) => t.year === yr.year)!;
    const diff = yr.returnRate - target.returnRate;
    const diffSign = diff >= 0 ? "+" : "";
    console.log(
      `    ${yr.year}: 수익률=${formatPercent(yr.returnRate)} (타겟: ${formatPercent(target.returnRate)}, ${diffSign}${formatPercent(diff)}), MDD=${formatPercent(yr.mdd)}`
    );
  }

  // Top 3 후보
  console.log("\n[Top 3 후보]");
  for (let i = 0; i < Math.min(3, sortedAll.length); i++) {
    const cand = sortedAll[i];
    console.log(`  #${i + 1}: 통합점수=${formatScore(cand.combinedScore)}, 평균수익률=${formatPercent(cand.avgReturnRate)}`);
    console.log(`      가중치: [${cand.params.weights.map((w) => new Decimal(w).toDecimalPlaces(4).toNumber()).join(", ")}]`);
    console.log(`      허용오차: [${cand.params.tolerances.map((t) => new Decimal(t).toDecimalPlaces(2).toNumber()).join(", ")}]`);
  }

  console.log("\n[요약]");
  console.log(`  총 탐색 조합: ${allResults.length}개`);
  console.log(`  실행 시간: ${executionTime}초`);
  console.log(`  베이스라인 통합점수: ${formatScore(baseline.combinedScore)}`);
  console.log(`  최적 통합점수: ${formatScore(best.combinedScore)}`);
  console.log(`  개선율: ${improvement >= 0 ? "+" : ""}${new Decimal(improvement).toDecimalPlaces(2).toNumber()}%`);
}

main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
