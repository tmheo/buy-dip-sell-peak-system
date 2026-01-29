#!/usr/bin/env npx ts-node
/**
 * RPM 실험 CLI 실행기
 * SPEC-RPM-EXPERIMENT-001 TASK-009
 *
 * 사용법:
 *   npx ts-node src/experiment/rpm/run-experiment.ts
 *   npx ts-node src/experiment/rpm/run-experiment.ts --ticker TQQQ
 *   npx ts-node src/experiment/rpm/run-experiment.ts --start 2024-01-01 --end 2024-12-31
 *   npx ts-node src/experiment/rpm/run-experiment.ts --seed 50000
 */
import { getPricesByDateRange } from "@/database";
import {
  runExperiment,
  DEFAULT_EXPERIMENT_CONFIG,
  getRecommendLookbackStart,
  type ExperimentRunnerConfig,
} from "./rpm-experiment-runner";

/**
 * CLI 인자 파싱
 */
function parseArgs(): ExperimentRunnerConfig {
  const args = process.argv.slice(2);
  const config: ExperimentRunnerConfig = { ...DEFAULT_EXPERIMENT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--ticker":
      case "-t":
        if (nextArg === "SOXL" || nextArg === "TQQQ") {
          config.ticker = nextArg;
          i++;
        } else {
          console.error(`잘못된 티커: ${nextArg}. SOXL 또는 TQQQ만 지원합니다.`);
          process.exit(1);
        }
        break;
      case "--start":
      case "-s":
        if (nextArg && /^\d{4}-\d{2}-\d{2}$/.test(nextArg)) {
          config.startDate = nextArg;
          i++;
        } else {
          console.error(`잘못된 시작일: ${nextArg}. YYYY-MM-DD 형식이어야 합니다.`);
          process.exit(1);
        }
        break;
      case "--end":
      case "-e":
        if (nextArg && /^\d{4}-\d{2}-\d{2}$/.test(nextArg)) {
          config.endDate = nextArg;
          i++;
        } else {
          console.error(`잘못된 종료일: ${nextArg}. YYYY-MM-DD 형식이어야 합니다.`);
          process.exit(1);
        }
        break;
      case "--seed":
      case "-c": {
        const seedValue = parseInt(nextArg, 10);
        if (!isNaN(seedValue) && seedValue > 0) {
          config.seedCapital = seedValue;
          i++;
        } else {
          console.error(`잘못된 시드 캐피탈: ${nextArg}. 양수여야 합니다.`);
          process.exit(1);
        }
        break;
      }
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`알 수 없는 옵션: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return config;
}

/**
 * 도움말 출력
 */
function printHelp(): void {
  console.log(`
RPM 실험 실행기 - 베이스라인 vs RPM 방식 백테스트 비교

사용법:
  npx ts-node src/experiment/rpm/run-experiment.ts [옵션]

옵션:
  -t, --ticker <SOXL|TQQQ>    종목 티커 (기본: SOXL)
  -s, --start <YYYY-MM-DD>    시작일 (기본: 2025-01-01)
  -e, --end <YYYY-MM-DD>      종료일 (기본: 2025-12-31)
  -c, --seed <금액>           시드 캐피탈 (기본: 10000)
  -h, --help                  도움말 표시

예시:
  npx ts-node src/experiment/rpm/run-experiment.ts
  npx ts-node src/experiment/rpm/run-experiment.ts --ticker TQQQ
  npx ts-node src/experiment/rpm/run-experiment.ts --start 2024-01-01 --end 2024-06-30
  npx ts-node src/experiment/rpm/run-experiment.ts --seed 50000
`);
}

/**
 * 메인 실행 함수
 */
async function main(): Promise<void> {
  const config = parseArgs();

  console.log("\n가격 데이터 로딩 중...");

  // 추천 시스템 lookback을 포함한 전체 가격 데이터 조회
  const lookbackStart = getRecommendLookbackStart();
  const allPrices = getPricesByDateRange(
    {
      startDate: lookbackStart,
      endDate: config.endDate,
    },
    config.ticker
  );

  if (allPrices.length === 0) {
    console.error(`\n오류: ${config.ticker}에 대한 가격 데이터가 없습니다.`);
    console.error("먼저 가격 데이터를 동기화하세요.");
    process.exit(1);
  }

  // 시작일 데이터 존재 확인
  const startIndex = allPrices.findIndex((p) => p.date >= config.startDate);
  if (startIndex < 0) {
    console.error(`\n오류: 시작일 ${config.startDate}에 해당하는 가격 데이터가 없습니다.`);
    console.error(`데이터 범위: ${allPrices[0].date} ~ ${allPrices[allPrices.length - 1].date}`);
    process.exit(1);
  }

  // 종료일 데이터 존재 확인
  const endIndex = allPrices.findIndex((p) => p.date >= config.endDate);
  if (endIndex < 0 && config.endDate > allPrices[allPrices.length - 1].date) {
    console.warn(`\n경고: 종료일 ${config.endDate}이 데이터 범위를 초과합니다.`);
    console.warn(`데이터의 마지막 날짜(${allPrices[allPrices.length - 1].date})까지 실행합니다.\n`);
    config.endDate = allPrices[allPrices.length - 1].date;
  }

  console.log(`로드된 가격 데이터: ${allPrices.length}개\n`);

  try {
    // 실험 실행
    const result = runExperiment(allPrices, config, { verbose: true });

    // 결론 출력
    console.log("\n결론:");
    if (result.improvement.strategyScore > 0) {
      console.log(
        `  RPM 방식이 전략 점수 기준 ${result.improvement.strategyScore.toFixed(2)}% 더 우수합니다.`
      );
    } else if (result.improvement.strategyScore < 0) {
      console.log(
        `  베이스라인이 전략 점수 기준 ${Math.abs(result.improvement.strategyScore).toFixed(2)}% 더 우수합니다.`
      );
    } else {
      console.log("  두 방식의 전략 점수가 동일합니다.");
    }

    process.exit(0);
  } catch (error) {
    console.error("\n실험 실행 중 오류 발생:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// CLI 실행
main().catch((error) => {
  console.error("예상치 못한 오류:", error);
  process.exit(1);
});
