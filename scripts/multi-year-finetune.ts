/**
 * 5개년 통합 유사도 파라미터 Fine-tuning
 * Top 3 후보를 기준으로 더 세밀한 탐색 (±5% 변형)
 */
import Decimal from "decimal.js";
import {
  loadPriceData,
  runBacktestWithParams,
  type PriceDataResult,
} from "../src/optimize/backtest-runner";
import { normalizeWeights, validateParams } from "../src/optimize/param-generator";
import type { SimilarityParams, MetricTolerances } from "../src/optimize/types";
import { WEIGHT_RANGE, TOLERANCE_RANGES } from "../src/optimize/types";
import { METRIC_WEIGHTS, METRIC_TOLERANCES } from "../src/recommend/similarity";
import type { OptimizationConfig } from "../src/optimize/types";

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

// 이전 최적화에서 도출된 Top 3 후보
const TOP_CANDIDATES: SimilarityParams[] = [
  {
    // #1: 통합점수=0.7992
    weights: [0.3865, 0.0243, 0.3591, 0.0318, 0.1983] as [number, number, number, number, number],
    tolerances: [17.03, 76.02, 11.06, 19.11, 45.24] as [number, number, number, number, number],
  },
  {
    // #2: 통합점수=0.7763
    weights: [0.3982, 0.0233, 0.3485, 0.0285, 0.2015] as [number, number, number, number, number],
    tolerances: [17.21, 72.38, 9.94, 20.16, 42.51] as [number, number, number, number, number],
  },
  {
    // #3: 통합점수=0.7541
    weights: [0.4, 0.0205, 0.3309, 0.0316, 0.217] as [number, number, number, number, number],
    tolerances: [18.34, 73.9, 11.49, 20.6, 46.68] as [number, number, number, number, number],
  },
];

// Fine-tuning 설정
const VARIATIONS_PER_CANDIDATE = 30; // 각 후보당 변형 수
const VARIATION_RANGE = 0.05; // ±5% 범위 (기존 ±10%보다 더 세밀)
const INITIAL_CAPITAL = 10000;
const METRIC_COUNT = 5;

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
  minReturnRate: number;
  targetDiffSum: number;
  parentIndex: number; // 어떤 Top 후보에서 파생되었는지
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

function randomInRange(min: number, max: number): number {
  const minDec = new Decimal(min);
  const maxDec = new Decimal(max);
  const range = maxDec.sub(minDec);
  return minDec.add(range.mul(Math.random())).toNumber();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// Fine-tuning 변형 생성
// ============================================================

/**
 * 더 세밀한 변형 생성 (±5% 범위)
 */
function generateFineTuneVariations(base: SimilarityParams, count: number): SimilarityParams[] {
  const variations: SimilarityParams[] = [];
  const maxRetries = count * 10; // 최대 재시도 횟수
  let totalAttempts = 0;

  for (let i = 0; i < count; i++) {
    if (totalAttempts++ >= maxRetries) {
      console.warn(`경고: 최대 재시도 횟수(${maxRetries})에 도달. ${variations.length}개 변형만 생성됨.`);
      break;
    }
    // 가중치 변형: ±5% 범위 내 조정
    const variedWeights: number[] = [];
    for (let j = 0; j < METRIC_COUNT; j++) {
      const baseWeight = new Decimal(base.weights[j]);
      const variation = baseWeight.mul(VARIATION_RANGE);
      const minVar = baseWeight.sub(variation).toNumber();
      const maxVar = baseWeight.add(variation).toNumber();
      let newWeight = randomInRange(minVar, maxVar);
      newWeight = clamp(newWeight, WEIGHT_RANGE.min, WEIGHT_RANGE.max);
      variedWeights.push(newWeight);
    }

    const normalizedWeights = normalizeWeights(variedWeights);

    // 허용오차 변형: ±5% 범위 내 조정
    const variedTolerances: number[] = [];
    for (let j = 0; j < METRIC_COUNT; j++) {
      const baseTolerance = new Decimal(base.tolerances[j]);
      const variation = baseTolerance.mul(VARIATION_RANGE);
      const minVar = baseTolerance.sub(variation).toNumber();
      const maxVar = baseTolerance.add(variation).toNumber();
      let newTolerance = randomInRange(minVar, maxVar);
      const range = TOLERANCE_RANGES[j];
      newTolerance = clamp(newTolerance, range.min, range.max);
      newTolerance = new Decimal(newTolerance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      variedTolerances.push(newTolerance);
    }

    const candidate: SimilarityParams = {
      weights: normalizedWeights,
      tolerances: variedTolerances as MetricTolerances,
    };

    if (validateParams(candidate)) {
      variations.push(candidate);
    } else {
      i--;
    }
  }

  return variations;
}

// ============================================================
// 다년도 백테스트
// ============================================================

function runMultiYearBacktest(
  params: SimilarityParams | null,
  priceData: PriceDataResult,
  parentIndex: number
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
    targetDiffSum += result.returnRate - target.returnRate;
  }

  const yearCount = YEARS.length;
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
    parentIndex,
  };
}

// ============================================================
// 메인 실행
// ============================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log("=== 5개년 통합 파라미터 Fine-tuning ===\n");
  console.log(`설정: Top ${TOP_CANDIDATES.length}개 후보 × ${VARIATIONS_PER_CANDIDATE}개 변형 = ${TOP_CANDIDATES.length * VARIATIONS_PER_CANDIDATE}개 조합`);
  console.log(`변형 범위: ±${VARIATION_RANGE * 100}% (기존 ±10%보다 세밀)`);
  console.log(`대상 연도: ${YEARS.map((y) => y.year).join(", ")}\n`);

  // 1. 가격 데이터 로드
  logProgress("SOXL 가격 데이터 로드 중...");
  const priceData = loadPriceData("SOXL");
  logProgress(`가격 데이터 로드 완료: ${priceData.prices.length}개 일자`);

  // 2. 현재 Top 후보들의 성능 재확인
  logProgress("Top 후보들 성능 확인 중...");
  const topResults: MultiYearResult[] = [];
  for (let i = 0; i < TOP_CANDIDATES.length; i++) {
    const result = runMultiYearBacktest(TOP_CANDIDATES[i], priceData, i);
    topResults.push(result);
    logProgress(`Top #${i + 1}: 통합점수=${formatScore(result.combinedScore)}, 평균수익률=${formatPercent(result.avgReturnRate)}`);
  }

  // 3. 각 Top 후보에 대해 Fine-tuning 변형 생성 및 백테스트
  const allVariationResults: MultiYearResult[] = [];
  for (let candIdx = 0; candIdx < TOP_CANDIDATES.length; candIdx++) {
    logProgress(`Top #${candIdx + 1} 변형 ${VARIATIONS_PER_CANDIDATE}개 생성 중...`);
    const variations = generateFineTuneVariations(TOP_CANDIDATES[candIdx], VARIATIONS_PER_CANDIDATE);

    for (let i = 0; i < variations.length; i++) {
      const result = runMultiYearBacktest(variations[i], priceData, candIdx);
      allVariationResults.push(result);

      if ((i + 1) % 10 === 0) {
        logProgress(`Top #${candIdx + 1} 변형 백테스트: ${i + 1}/${variations.length}`);
      }
    }
  }
  logProgress(`전체 변형 백테스트 완료: ${allVariationResults.length}개`);

  // 4. 전체 결과 분석 (Top 후보 + 변형)
  const allResults = [...topResults, ...allVariationResults];
  const sortedAll = [...allResults].sort((a, b) => b.combinedScore - a.combinedScore);
  const best = sortedAll[0];
  const previousBest = topResults[0]; // 이전 최고

  const executionTime = Math.round((Date.now() - startTime) / 1000);

  // 5. 결과 출력
  console.log("\n" + "=".repeat(60));
  console.log("=== Fine-tuning 결과 ===");
  console.log("=".repeat(60));

  console.log("\n[이전 최고 (Top #1)]");
  console.log(`  가중치: [${previousBest.params.weights.map((w) => new Decimal(w).toDecimalPlaces(4).toNumber()).join(", ")}]`);
  console.log(`  허용오차: [${previousBest.params.tolerances.map((t) => new Decimal(t).toDecimalPlaces(2).toNumber()).join(", ")}]`);
  console.log(`  통합 점수: ${formatScore(previousBest.combinedScore)}`);
  console.log(`  평균 수익률: ${formatPercent(previousBest.avgReturnRate)}`);
  console.log(`  평균 MDD: ${formatPercent(previousBest.avgMdd)}`);
  console.log(`  최소 수익률: ${formatPercent(previousBest.minReturnRate)}`);

  console.log("\n[Fine-tuning 최적 파라미터]");
  console.log(`  파생 원본: Top #${best.parentIndex + 1}`);
  console.log(`  가중치: [${best.params.weights.map((w) => new Decimal(w).toDecimalPlaces(4).toNumber()).join(", ")}]`);
  console.log(`  허용오차: [${best.params.tolerances.map((t) => new Decimal(t).toDecimalPlaces(2).toNumber()).join(", ")}]`);
  console.log(`  통합 점수: ${formatScore(best.combinedScore)}`);
  console.log(`  평균 수익률: ${formatPercent(best.avgReturnRate)}`);
  console.log(`  평균 MDD: ${formatPercent(best.avgMdd)}`);
  console.log(`  최소 수익률: ${formatPercent(best.minReturnRate)}`);

  const improvement = ((best.combinedScore - previousBest.combinedScore) / Math.abs(previousBest.combinedScore)) * 100;
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

  // Top 5 후보 출력
  console.log("\n[Fine-tuning Top 5]");
  for (let i = 0; i < Math.min(5, sortedAll.length); i++) {
    const cand = sortedAll[i];
    const isOriginal = topResults.includes(cand);
    const label = isOriginal ? "(원본)" : `(Top #${cand.parentIndex + 1} 파생)`;
    console.log(`  #${i + 1}: 통합점수=${formatScore(cand.combinedScore)}, 평균수익률=${formatPercent(cand.avgReturnRate)} ${label}`);
    console.log(`      가중치: [${cand.params.weights.map((w) => new Decimal(w).toDecimalPlaces(4).toNumber()).join(", ")}]`);
    console.log(`      허용오차: [${cand.params.tolerances.map((t) => new Decimal(t).toDecimalPlaces(2).toNumber()).join(", ")}]`);
  }

  // 각 Top 후보별 최고 변형 통계
  console.log("\n[Top 후보별 최고 변형]");
  for (let i = 0; i < TOP_CANDIDATES.length; i++) {
    const candidateVariations = sortedAll.filter((r) => r.parentIndex === i);
    const bestVariation = candidateVariations[0];
    const originalScore = topResults[i].combinedScore;
    const variationImprovement = ((bestVariation.combinedScore - originalScore) / Math.abs(originalScore)) * 100;
    console.log(`  Top #${i + 1}: 원본=${formatScore(originalScore)} → 최고변형=${formatScore(bestVariation.combinedScore)} (${variationImprovement >= 0 ? "+" : ""}${new Decimal(variationImprovement).toDecimalPlaces(2).toNumber()}%)`);
  }

  console.log("\n[요약]");
  console.log(`  총 탐색 조합: ${allResults.length}개`);
  console.log(`  실행 시간: ${executionTime}초`);
  console.log(`  이전 최고 통합점수: ${formatScore(previousBest.combinedScore)}`);
  console.log(`  Fine-tuning 최고 통합점수: ${formatScore(best.combinedScore)}`);
  console.log(`  개선율: ${improvement >= 0 ? "+" : ""}${new Decimal(improvement).toDecimalPlaces(2).toNumber()}%`);

  if (best.combinedScore > previousBest.combinedScore) {
    console.log("\n[적용 방법]");
    console.log("더 좋은 파라미터를 찾았습니다! 적용하려면:");
    console.log(`  1. src/recommend/similarity.ts의 METRIC_WEIGHTS를 다음으로 변경:`);
    console.log(`     [${best.params.weights.map((w) => new Decimal(w).toDecimalPlaces(4).toNumber()).join(", ")}]`);
    console.log(`  2. METRIC_TOLERANCES를 다음으로 변경:`);
    console.log(`     [${best.params.tolerances.map((t) => new Decimal(t).toDecimalPlaces(2).toNumber()).join(", ")}]`);
    console.log(`  3. 캐시 재생성: npx tsx scripts/precompute-recommendations.ts`);
  } else {
    console.log("\n[결론]");
    console.log("기존 Top #1 파라미터가 여전히 최적입니다. 변경 불필요.");
  }
}

main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
