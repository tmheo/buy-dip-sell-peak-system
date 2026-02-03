/**
 * 유사도 파라미터 최적화 CLI
 * SPEC-PERF-001: CLI 진입점
 */
import * as fs from "fs";
import * as path from "path";
import Decimal from "decimal.js";

import { METRIC_WEIGHTS, METRIC_TOLERANCES } from "@/recommend/similarity";

import type {
  OptimizationConfig,
  OptimizationResult,
  SimilarityParams,
  BacktestMetrics,
} from "./types";
import { DEFAULT_OPTIMIZATION_CONFIG } from "./types";
import { generateRandomParams, generateVariations } from "./param-generator";
import { loadPriceData, runBacktestWithParams, type PriceDataResult } from "./backtest-runner";
import { analyzeResults } from "./analyzer";

/** CLI 인자 파싱 결과 */
interface ParsedArgs {
  config: OptimizationConfig;
  outputPath: string | null;
}

/** 명령줄 인자 맵 생성 (--key value 형식) */
function buildArgMap(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        args.set(key, value);
        i++;
      }
    }
  }
  return args;
}

/** 양의 정수 파싱 및 검증 */
function parsePositiveInt(value: string | undefined, defaultValue: number, name: string): number {
  const parsed = parseInt(value ?? String(defaultValue), 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`유효하지 않은 ${name}: ${value}. 양의 정수여야 합니다.`);
  }
  return parsed;
}

/** CLI 인자 파싱 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args = buildArgMap(argv);
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  // 티커 파싱
  const tickerArg = args.get("ticker")?.toUpperCase() ?? "SOXL";
  if (tickerArg !== "SOXL" && tickerArg !== "TQQQ") {
    throw new Error(`유효하지 않은 티커: ${tickerArg}. SOXL 또는 TQQQ만 지원합니다.`);
  }

  // 날짜 파싱
  const startDate = args.get("start") ?? "2025-01-01";
  const endDate = args.get("end") ?? "2025-12-31";

  if (!dateRegex.test(startDate)) {
    throw new Error(`유효하지 않은 시작일 형식: ${startDate}. YYYY-MM-DD 형식이어야 합니다.`);
  }
  if (!dateRegex.test(endDate)) {
    throw new Error(`유효하지 않은 종료일 형식: ${endDate}. YYYY-MM-DD 형식이어야 합니다.`);
  }
  if (startDate > endDate) {
    throw new Error(`시작일은 종료일보다 앞서야 합니다: ${startDate} ~ ${endDate}`);
  }

  const config: OptimizationConfig = {
    ticker: tickerArg as "SOXL" | "TQQQ",
    startDate,
    endDate,
    initialCapital: parsePositiveInt(args.get("capital"), 10000, "초기 자본"),
    randomCombinations: parsePositiveInt(
      args.get("random"),
      DEFAULT_OPTIMIZATION_CONFIG.randomCombinations,
      "랜덤 조합 수"
    ),
    variationsPerTop: parsePositiveInt(
      args.get("variations"),
      DEFAULT_OPTIMIZATION_CONFIG.variationsPerTop,
      "변형 수"
    ),
    topCandidates: parsePositiveInt(
      args.get("top"),
      DEFAULT_OPTIMIZATION_CONFIG.topCandidates,
      "상위 후보 수"
    ),
  };

  return { config, outputPath: args.get("output") ?? null };
}

/** 소수점을 지정된 자릿수로 반올림 */
function roundDecimal(value: number, places: number): number {
  return new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber();
}

/** 숫자를 퍼센트 문자열로 포맷팅 (예: 0.45 -> "45%") */
function formatPercent(value: number, decimalPlaces: number = 2): string {
  return `${roundDecimal(value * 100, decimalPlaces)}%`;
}

/** 개선율을 부호 포함 퍼센트 문자열로 포맷팅 (예: 8.9 -> "+8.9%") */
function formatImprovement(value: number): string {
  const percent = roundDecimal(value, 2);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

/** 배열을 문자열로 포맷팅 */
function formatArray(arr: readonly number[], decimalPlaces: number): string {
  return `[${arr.map((v) => roundDecimal(v, decimalPlaces)).join(", ")}]`;
}

/** 가중치 배열 포맷팅 (소수점 4자리) */
function formatWeights(weights: readonly number[]): string {
  return formatArray(weights, 4);
}

/** 허용오차 배열 포맷팅 (소수점 2자리) */
function formatTolerances(tolerances: readonly number[]): string {
  return formatArray(tolerances, 2);
}

/** 전략 점수 포맷팅 */
function formatScore(score: number): string {
  return new Decimal(score).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
}

/** 실행 시간을 초 단위로 포맷팅 */
function formatDuration(ms: number): string {
  return `${Math.round(ms / 1000)}초`;
}

/** 후보별 개선율 계산 */
function calculateCandidateImprovement(candidateScore: number, baselineScore: number): number {
  if (baselineScore === 0) return 0;
  return new Decimal(candidateScore)
    .sub(baselineScore)
    .div(baselineScore)
    .mul(100)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** 최적화 결과를 콘솔 출력 형식으로 포맷팅 */
export function formatOutput(result: OptimizationResult): string {
  const lines: string[] = [
    "=== 유사도 파라미터 최적화 결과 ===",
    "",
    "[베이스라인]",
    `  가중치: ${formatWeights(METRIC_WEIGHTS)}`,
    `  허용오차: ${formatTolerances(METRIC_TOLERANCES)}`,
    `  수익률: ${formatPercent(result.baseline.returnRate)}`,
    `  MDD: ${formatPercent(result.baseline.mdd)}`,
    `  전략 점수: ${formatScore(result.baseline.strategyScore)}`,
    "",
    "[Top 3 후보]",
  ];

  for (const candidate of result.candidates.slice(0, 3)) {
    const improvement =
      candidate.rank === 1
        ? result.summary.improvementPercent
        : calculateCandidateImprovement(
            candidate.metrics.strategyScore,
            result.baseline.strategyScore
          );

    lines.push(
      `  #${candidate.rank}: 전략 점수 ${formatScore(candidate.metrics.strategyScore)} (${formatImprovement(improvement)})`
    );
    lines.push(`      가중치: ${formatWeights(candidate.params.weights)}`);
    lines.push(`      허용오차: ${formatTolerances(candidate.params.tolerances)}`);
    lines.push(
      `      수익률: ${formatPercent(candidate.metrics.returnRate)}, MDD: ${formatPercent(candidate.metrics.mdd)}`
    );
    lines.push("");
  }

  lines.push(
    "[요약]",
    `  총 탐색 조합: ${result.summary.totalCombinations}개`,
    `  실행 시간: ${formatDuration(result.summary.executionTimeMs)}`,
    `  최고 개선율: ${formatImprovement(result.summary.improvementPercent)}`
  );

  return lines.join("\n");
}

/** 타임스탬프 포함 진행 상황 로그 출력 */
function logProgress(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${message}`);
}

/** 백테스트 결과 타입 */
type BacktestResult = { params: SimilarityParams; metrics: BacktestMetrics };

/** 파라미터 배열에 대해 백테스트 실행 (진행 상황 출력 포함) */
async function runBatchBacktest(
  config: OptimizationConfig,
  params: SimilarityParams[],
  priceData: PriceDataResult,
  label: string,
  logInterval: number = 10
): Promise<BacktestResult[]> {
  logProgress(`${label} 백테스트 실행 중 (0/${params.length})...`);

  const results: BacktestResult[] = [];
  for (let i = 0; i < params.length; i++) {
    const metrics = await runBacktestWithParams(config, params[i], priceData);
    results.push({ params: params[i], metrics });

    if ((i + 1) % logInterval === 0) {
      logProgress(`${label} 백테스트 실행 중 (${i + 1}/${params.length})...`);
    }
  }

  return results;
}

/** 결과를 JSON 파일로 저장 */
function saveResults(
  outputPath: string,
  config: OptimizationConfig,
  baseline: BacktestMetrics,
  result: OptimizationResult
): void {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputData = {
    config,
    baseline: { weights: METRIC_WEIGHTS, tolerances: METRIC_TOLERANCES, metrics: baseline },
    result,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");
}

/** CLI 메인 함수 */
export async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. 인자 파싱 및 설정
    logProgress("인자 파싱 중...");
    const { config, outputPath } = parseArgs(process.argv);
    logProgress(
      `설정: 티커=${config.ticker}, 기간=${config.startDate}~${config.endDate}, ` +
        `랜덤=${config.randomCombinations}개, 변형=${config.variationsPerTop}개, 상위=${config.topCandidates}개`
    );

    // 2. 가격 데이터 로드
    logProgress(`${config.ticker} 가격 데이터 로드 중...`);
    const priceData = await loadPriceData(config.ticker);
    logProgress(`가격 데이터 로드 완료: ${priceData.prices.length}개 일자`);

    // 3. 베이스라인 백테스트
    logProgress("베이스라인 백테스트 실행 중...");
    const baseline = await runBacktestWithParams(config, null, priceData);
    logProgress(
      `베이스라인 결과: 수익률=${formatPercent(baseline.returnRate)}, ` +
        `MDD=${formatPercent(baseline.mdd)}, 전략점수=${formatScore(baseline.strategyScore)}`
    );

    // 4. 랜덤 파라미터 백테스트
    logProgress(`랜덤 파라미터 ${config.randomCombinations}개 생성 중...`);
    const randomParams = generateRandomParams(config.randomCombinations);
    const randomResults = await runBatchBacktest(config, randomParams, priceData, "랜덤 파라미터");
    logProgress("랜덤 파라미터 백테스트 완료");

    // 5. 상위 후보 선택
    logProgress(`상위 ${config.topCandidates}개 후보 선택 중...`);
    const topRandomResults = [...randomResults]
      .sort((a, b) => b.metrics.strategyScore - a.metrics.strategyScore)
      .slice(0, config.topCandidates);
    logProgress(
      `상위 후보 선택 완료: ${topRandomResults.map((r) => formatScore(r.metrics.strategyScore)).join(", ")}`
    );

    // 6. 상위 후보 변형 백테스트
    const variationResults: BacktestResult[] = [];
    for (let i = 0; i < topRandomResults.length; i++) {
      logProgress(`후보 #${i + 1} 변형 ${config.variationsPerTop}개 생성 중...`);
      const variations = generateVariations(topRandomResults[i].params, config.variationsPerTop);
      const results = await runBatchBacktest(
        config,
        variations,
        priceData,
        `후보 #${i + 1} 변형`,
        5
      );
      variationResults.push(...results);
    }
    logProgress(`변형 백테스트 완료: ${variationResults.length}개`);

    // 7. 결과 분석
    logProgress("결과 분석 중...");
    const executionTimeMs = Date.now() - startTime;
    const result = analyzeResults(
      baseline,
      [...randomResults, ...variationResults],
      executionTimeMs
    );
    logProgress("결과 분석 완료");

    // 8. 출력
    console.log("");
    console.log(formatOutput(result));

    // 9. 파일 저장 (선택적)
    if (outputPath) {
      logProgress(`결과 저장 중: ${outputPath}`);
      saveResults(outputPath, config, baseline, result);
      logProgress(`결과 저장 완료: ${outputPath}`);
    }

    logProgress(`최적화 완료. 총 소요 시간: ${formatDuration(executionTimeMs)}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n[오류] ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      console.error("\n[오류] 알 수 없는 오류가 발생했습니다.", error);
    }
    process.exit(1);
  }
}

// 직접 실행 시 main 호출
// ESM에서는 import.meta.url을 사용하여 직접 실행 여부 확인
const isDirectRun = process.argv[1]?.includes("cli");
if (isDirectRun) {
  main();
}
