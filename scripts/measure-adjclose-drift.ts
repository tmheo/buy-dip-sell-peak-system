/**
 * adjClose 불연속 규모 측정 스크립트 (이슈 #42)
 *
 * 지원 티커별로 Yahoo Finance 전체 히스토리를 새로 내려받은 뒤,
 * DB에 저장된 시계열과 날짜별로 대조해 불일치 규모를 마크다운으로 보고한다.
 *
 * 읽기 전용: 조회 함수(getAllPricesByTicker)와 다운로드 함수(fetchAllHistory)만 사용하며
 * DB에는 어떤 쓰기도 하지 않는다.
 *
 * 실행: dotenv -e .env.local -- tsx scripts/measure-adjclose-drift.ts [보고서 파일 경로]
 */
import { writeFileSync } from "node:fs";

import { fetchAllHistory, getSupportedTickers } from "@/services/dataFetcher";
import { getAllPricesByTicker } from "@/database/prices";
import { closeConnection } from "@/database/db-drizzle";
import { analyzePriceDrift, type DriftReport } from "@/services/priceDriftAnalyzer";

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(3)}%`;
}

function formatDateList(dates: string[], maxItems: number = 10): string {
  if (dates.length === 0) return "없음";
  const shown = dates.slice(0, maxItems).join(", ");
  return dates.length > maxItems ? `${shown} 외 ${dates.length - maxItems}건` : shown;
}

function renderReport(ticker: string, report: DriftReport): string {
  const lines: string[] = [];

  lines.push(`### ${ticker}`);
  lines.push("");
  lines.push(`- 비교 대상: ${report.comparedCount}행 (DB ∩ 재수집본, 날짜 기준)`);
  lines.push(`- DB에만 있는 날짜: ${formatDateList(report.dbOnlyDates)}`);
  lines.push(`- 재수집본에만 있는 날짜: ${formatDateList(report.fetchedOnlyDates)}`);
  lines.push("");
  lines.push("#### 컬럼별 불일치");
  lines.push("");
  lines.push("| 컬럼 | 불일치 행 | 비율 | 최대 상대 오차 | 평균 상대 오차 |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const column of report.columns) {
    lines.push(
      `| ${column.column} | ${column.mismatchCount} / ${column.comparedCount} ` +
        `| ${formatPercent(column.mismatchRatio)} ` +
        `| ${formatPercent(column.maxRelativeError)} ` +
        `| ${formatPercent(column.meanRelativeError)} |`
    );
  }
  lines.push("");

  const sparseColumns = report.columns.filter((c) => c.mismatchCount > 0 && c.mismatchCount <= 40);
  if (sparseColumns.length > 0) {
    lines.push("불일치 날짜 (40건 이하 컬럼만):");
    lines.push("");
    for (const column of sparseColumns) {
      lines.push(`- ${column.column}: ${formatDateList(column.mismatchDates, 40)}`);
    }
    lines.push("");
  }

  lines.push("#### adjClose 불일치 세그먼트 (비율이 바뀌는 시작 날짜가 배당락일 후보 경계)");
  lines.push("");
  if (report.adjCloseSegments.length === 0) {
    lines.push("불일치 세그먼트 없음");
  } else {
    lines.push("| 시작 날짜 | 끝 날짜 | 행 수 | 평균 비율(DB/재수집본) | 평균 상대 오차 |");
    lines.push("| --- | --- | ---: | ---: | ---: |");
    for (const segment of report.adjCloseSegments) {
      lines.push(
        `| ${segment.startDate} | ${segment.endDate} | ${segment.rowCount} ` +
          `| ${segment.meanRatio.toFixed(5)} | ${formatPercent(segment.meanRelativeError)} |`
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const sections: string[] = [
    "## adjClose 불연속 측정 결과 (이슈 #42)",
    "",
    `측정 시각: ${new Date().toISOString()}`,
    "",
  ];

  for (const ticker of getSupportedTickers()) {
    const dbPrices = await getAllPricesByTicker(ticker);
    const fetchedPrices = await fetchAllHistory(ticker);
    console.log(
      `${ticker}: DB ${dbPrices.length}행, 재수집본 ${fetchedPrices.length}행 비교 중...`
    );

    const report = analyzePriceDrift(dbPrices, fetchedPrices);
    sections.push(renderReport(ticker, report));
  }

  const markdown = sections.join("\n");
  const outputPath = process.argv[2];
  if (outputPath) {
    writeFileSync(outputPath, markdown);
    console.log(`보고서 저장: ${outputPath}`);
  } else {
    console.log(markdown);
  }
}

main()
  .then(() => closeConnection())
  .catch(async (error) => {
    console.error(error);
    await closeConnection();
    process.exit(1);
  });
