/**
 * 유사도 파라미터 최적화 CLI
 * SPEC-PERF-001: CLI 진입점
 *
 * 최적화 파이프라인 전체를 오케스트레이션합니다.
 * - 명령줄 인자 파싱
 * - 베이스라인 및 랜덤 파라미터 백테스트 실행
 * - 상위 후보 변형 탐색
 * - 결과 분석 및 출력
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
import { loadPriceData, runBacktestWithParams } from "./backtest-runner";
import { analyzeResults } from "./analyzer";

// ============================================================
// CLI 인자 파싱
// ============================================================

/**
 * CLI 인자 파싱
 * 명령줄 인자를 OptimizationConfig로 변환
 *
 * @param argv - process.argv 배열 (node, script path, ...args)
 * @returns 최적화 설정 객체
 *
 * 지원하는 인자:
 * --ticker SOXL|TQQQ (기본: SOXL)
 * --start YYYY-MM-DD (기본: 2025-01-01)
 * --end YYYY-MM-DD (기본: 2025-12-31)
 * --capital N (기본: 10000)
 * --random N (기본: 50)
 * --variations N (기본: 10)
 * --top N (기본: 3)
 * --output path (선택적, 결과 JSON 저장 경로)
 */
export function parseArgs(argv: string[]): {
  config: OptimizationConfig;
  outputPath: string | null;
} {
  // 인자 맵 생성 (--key value 형식)
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        args.set(key, value);
        i++; // 값 건너뛰기
      }
    }
  }

  // 티커 파싱 (SOXL 또는 TQQQ만 허용)
  const tickerArg = args.get("ticker")?.toUpperCase() ?? "SOXL";
  if (tickerArg !== "SOXL" && tickerArg !== "TQQQ") {
    throw new Error(`유효하지 않은 티커: ${tickerArg}. SOXL 또는 TQQQ만 지원합니다.`);
  }
  const ticker: "SOXL" | "TQQQ" = tickerArg;

  // 날짜 파싱 (YYYY-MM-DD 형식 검증)
  const startDate = args.get("start") ?? "2025-01-01";
  const endDate = args.get("end") ?? "2025-12-31";

  // 날짜 형식 검증
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate)) {
    throw new Error(`유효하지 않은 시작일 형식: ${startDate}. YYYY-MM-DD 형식이어야 합니다.`);
  }
  if (!dateRegex.test(endDate)) {
    throw new Error(`유효하지 않은 종료일 형식: ${endDate}. YYYY-MM-DD 형식이어야 합니다.`);
  }

  // 숫자 파싱
  const initialCapital = parseInt(args.get("capital") ?? "10000", 10);
  const randomCombinations = parseInt(
    args.get("random") ?? String(DEFAULT_OPTIMIZATION_CONFIG.randomCombinations),
    10
  );
  const variationsPerTop = parseInt(
    args.get("variations") ?? String(DEFAULT_OPTIMIZATION_CONFIG.variationsPerTop),
    10
  );
  const topCandidates = parseInt(
    args.get("top") ?? String(DEFAULT_OPTIMIZATION_CONFIG.topCandidates),
    10
  );

  // 숫자 유효성 검증
  if (isNaN(initialCapital) || initialCapital <= 0) {
    throw new Error(`유효하지 않은 초기 자본: ${args.get("capital")}. 양의 정수여야 합니다.`);
  }
  if (isNaN(randomCombinations) || randomCombinations <= 0) {
    throw new Error(`유효하지 않은 랜덤 조합 수: ${args.get("random")}. 양의 정수여야 합니다.`);
  }
  if (isNaN(variationsPerTop) || variationsPerTop <= 0) {
    throw new Error(`유효하지 않은 변형 수: ${args.get("variations")}. 양의 정수여야 합니다.`);
  }
  if (isNaN(topCandidates) || topCandidates <= 0) {
    throw new Error(`유효하지 않은 상위 후보 수: ${args.get("top")}. 양의 정수여야 합니다.`);
  }

  // 출력 경로 (선택적)
  const outputPath = args.get("output") ?? null;

  const config: OptimizationConfig = {
    ticker,
    startDate,
    endDate,
    initialCapital,
    randomCombinations,
    variationsPerTop,
    topCandidates,
  };

  return { config, outputPath };
}

// ============================================================
// 출력 포맷팅
// ============================================================

/**
 * 숫자를 퍼센트 문자열로 포맷팅
 * @param value - 소수점 값 (예: 0.45)
 * @param decimalPlaces - 소수점 자릿수 (기본: 2)
 * @returns 퍼센트 문자열 (예: "45.00%")
 */
function formatPercent(value: number, decimalPlaces: number = 2): string {
  const percent = new Decimal(value).mul(100).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
  return `${percent.toNumber()}%`;
}

/**
 * 개선율을 부호 포함 퍼센트 문자열로 포맷팅
 * @param value - 개선율 값 (소수점)
 * @returns 부호 포함 퍼센트 문자열 (예: "+8.9%")
 */
function formatImprovement(value: number): string {
  const percent = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent}%`;
}

/**
 * 가중치 배열을 문자열로 포맷팅
 * @param weights - 가중치 배열
 * @returns 포맷팅된 문자열 (예: "[0.35, 0.4, 0.05, 0.07, 0.13]")
 */
function formatWeights(weights: readonly number[]): string {
  const formatted = weights.map((w) =>
    new Decimal(w).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber()
  );
  return `[${formatted.join(", ")}]`;
}

/**
 * 허용오차 배열을 문자열로 포맷팅
 * @param tolerances - 허용오차 배열
 * @returns 포맷팅된 문자열 (예: "[36, 90, 4.5, 40, 28]")
 */
function formatTolerances(tolerances: readonly number[]): string {
  const formatted = tolerances.map((t) =>
    new Decimal(t).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
  );
  return `[${formatted.join(", ")}]`;
}

/**
 * 전략 점수를 문자열로 포맷팅
 * @param score - 전략 점수
 * @returns 포맷팅된 문자열 (예: "38.72")
 */
function formatScore(score: number): string {
  return new Decimal(score).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
}

/**
 * 실행 시간을 초 단위로 포맷팅
 * @param ms - 밀리초
 * @returns 초 단위 문자열 (예: "245초")
 */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${seconds}초`;
}

/**
 * 최적화 결과를 콘솔 출력 형식으로 포맷팅
 * SPEC-PERF-001 4.3 출력 형식 준수
 *
 * @param result - 최적화 결과
 * @returns 포맷팅된 출력 문자열
 */
export function formatOutput(result: OptimizationResult): string {
  const lines: string[] = [];

  // 헤더
  lines.push("=== 유사도 파라미터 최적화 결과 ===");
  lines.push("");

  // 베이스라인 섹션
  lines.push("[베이스라인]");
  lines.push(`  가중치: ${formatWeights(METRIC_WEIGHTS)}`);
  lines.push(`  허용오차: ${formatTolerances(METRIC_TOLERANCES)}`);
  lines.push(`  수익률: ${formatPercent(result.baseline.returnRate)}`);
  lines.push(`  MDD: ${formatPercent(result.baseline.mdd)}`);
  lines.push(`  전략 점수: ${formatScore(result.baseline.strategyScore)}`);
  lines.push("");

  // Top 3 후보 섹션
  lines.push("[Top 3 후보]");
  const topCandidates = result.candidates.slice(0, 3);
  for (const candidate of topCandidates) {
    const improvementPercent = formatImprovement(result.summary.improvementPercent);
    const scoreImprovement =
      candidate.rank === 1
        ? ` (${improvementPercent})`
        : ` (${formatImprovement(
            new Decimal(candidate.metrics.strategyScore)
              .sub(result.baseline.strategyScore)
              .div(result.baseline.strategyScore)
              .mul(100)
              .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
              .toNumber()
          )})`;

    lines.push(
      `  #${candidate.rank}: 전략 점수 ${formatScore(candidate.metrics.strategyScore)}${scoreImprovement}`
    );
    lines.push(`      가중치: ${formatWeights(candidate.params.weights)}`);
    lines.push(`      허용오차: ${formatTolerances(candidate.params.tolerances)}`);
    lines.push(
      `      수익률: ${formatPercent(candidate.metrics.returnRate)}, MDD: ${formatPercent(candidate.metrics.mdd)}`
    );
    lines.push("");
  }

  // 요약 섹션
  lines.push("[요약]");
  lines.push(`  총 탐색 조합: ${result.summary.totalCombinations}개`);
  lines.push(`  실행 시간: ${formatDuration(result.summary.executionTimeMs)}`);
  lines.push(`  최고 개선율: ${formatImprovement(result.summary.improvementPercent)}`);

  return lines.join("\n");
}

// ============================================================
// 메인 실행
// ============================================================

/**
 * 진행 상황 로그 출력
 * @param message - 출력할 메시지
 */
function logProgress(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${message}`);
}

/**
 * CLI 메인 함수
 * 최적화 파이프라인 전체 실행
 *
 * 실행 흐름:
 * 1. 명령줄 인자 파싱
 * 2. 가격 데이터 로드
 * 3. 베이스라인 백테스트 실행 (기본 파라미터)
 * 4. 랜덤 파라미터 조합 생성 및 백테스트
 * 5. 상위 후보 선택 및 변형 생성
 * 6. 변형 백테스트 실행
 * 7. 전체 결과 분석
 * 8. 콘솔 출력 및 선택적 파일 저장
 */
export async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. 인자 파싱
    logProgress("인자 파싱 중...");
    const { config, outputPath } = parseArgs(process.argv);
    logProgress(
      `설정: 티커=${config.ticker}, 기간=${config.startDate}~${config.endDate}, ` +
        `랜덤=${config.randomCombinations}개, 변형=${config.variationsPerTop}개, 상위=${config.topCandidates}개`
    );

    // 2. 가격 데이터 로드
    logProgress(`${config.ticker} 가격 데이터 로드 중...`);
    const priceData = loadPriceData(config.ticker);
    logProgress(`가격 데이터 로드 완료: ${priceData.prices.length}개 일자`);

    // 3. 베이스라인 백테스트 (기본 파라미터)
    logProgress("베이스라인 백테스트 실행 중...");
    const baseline = runBacktestWithParams(config, null, priceData);
    logProgress(
      `베이스라인 결과: 수익률=${formatPercent(baseline.returnRate)}, ` +
        `MDD=${formatPercent(baseline.mdd)}, 전략점수=${formatScore(baseline.strategyScore)}`
    );

    // 4. 랜덤 파라미터 생성 및 백테스트
    logProgress(`랜덤 파라미터 ${config.randomCombinations}개 생성 중...`);
    const randomParams = generateRandomParams(config.randomCombinations);
    logProgress(`랜덤 파라미터 생성 완료`);

    logProgress(`랜덤 파라미터 백테스트 실행 중 (0/${randomParams.length})...`);
    const randomResults: Array<{ params: SimilarityParams; metrics: BacktestMetrics }> = [];
    for (let i = 0; i < randomParams.length; i++) {
      const params = randomParams[i];
      const metrics = runBacktestWithParams(config, params, priceData);
      randomResults.push({ params, metrics });

      // 10개마다 진행 상황 출력
      if ((i + 1) % 10 === 0) {
        logProgress(`랜덤 파라미터 백테스트 실행 중 (${i + 1}/${randomParams.length})...`);
      }
    }
    logProgress(`랜덤 파라미터 백테스트 완료`);

    // 5. 상위 후보 선택
    logProgress(`상위 ${config.topCandidates}개 후보 선택 중...`);
    // 전략 점수 기준 내림차순 정렬
    const sortedRandomResults = [...randomResults].sort(
      (a, b) => b.metrics.strategyScore - a.metrics.strategyScore
    );
    const topRandomResults = sortedRandomResults.slice(0, config.topCandidates);
    logProgress(
      `상위 후보 선택 완료: ${topRandomResults.map((r) => formatScore(r.metrics.strategyScore)).join(", ")}`
    );

    // 6. 상위 후보 변형 생성 및 백테스트
    const variationResults: Array<{ params: SimilarityParams; metrics: BacktestMetrics }> = [];
    for (let candidateIdx = 0; candidateIdx < topRandomResults.length; candidateIdx++) {
      const topResult = topRandomResults[candidateIdx];
      logProgress(`후보 #${candidateIdx + 1} 변형 ${config.variationsPerTop}개 생성 중...`);
      const variations = generateVariations(topResult.params, config.variationsPerTop);

      logProgress(`후보 #${candidateIdx + 1} 변형 백테스트 실행 중 (0/${variations.length})...`);
      for (let i = 0; i < variations.length; i++) {
        const params = variations[i];
        const metrics = runBacktestWithParams(config, params, priceData);
        variationResults.push({ params, metrics });

        // 5개마다 진행 상황 출력
        if ((i + 1) % 5 === 0) {
          logProgress(
            `후보 #${candidateIdx + 1} 변형 백테스트 실행 중 (${i + 1}/${variations.length})...`
          );
        }
      }
    }
    logProgress(`변형 백테스트 완료: ${variationResults.length}개`);

    // 7. 전체 결과 분석
    logProgress("결과 분석 중...");
    const allResults = [...randomResults, ...variationResults];
    const executionTimeMs = Date.now() - startTime;
    const result = analyzeResults(baseline, allResults, executionTimeMs);
    logProgress("결과 분석 완료");

    // 8. 콘솔 출력
    console.log("");
    console.log(formatOutput(result));

    // 9. 선택적 파일 저장
    if (outputPath) {
      logProgress(`결과 저장 중: ${outputPath}`);
      // 디렉토리 생성 (없으면)
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // JSON 파일로 저장
      const outputData = {
        config,
        baseline: {
          weights: METRIC_WEIGHTS,
          tolerances: METRIC_TOLERANCES,
          metrics: baseline,
        },
        result,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");
      logProgress(`결과 저장 완료: ${outputPath}`);
    }

    logProgress(`최적화 완료. 총 소요 시간: ${formatDuration(executionTimeMs)}`);
  } catch (error) {
    // 에러 처리
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
