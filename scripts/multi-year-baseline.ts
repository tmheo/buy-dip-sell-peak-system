/**
 * 5개년 베이스라인 측정 스크립트
 */
import Decimal from "decimal.js";
import { loadPriceData, runBacktestWithParams } from "../src/optimize/backtest-runner";
import type { OptimizationConfig } from "../src/optimize/types";

const years = [
  { year: 2021, start: "2021-01-04", end: "2021-12-31" },
  { year: 2022, start: "2022-01-03", end: "2022-12-30" },
  { year: 2023, start: "2023-01-03", end: "2023-12-29" },
  { year: 2024, start: "2024-01-02", end: "2024-12-31" },
  { year: 2025, start: "2025-01-02", end: "2025-12-31" },
];

// Target values from original site (for comparison)
const targets = [
  { year: 2021, returnRate: 0.726, mdd: -0.1395 },
  { year: 2022, returnRate: 0.4311, mdd: -0.2104 },
  { year: 2023, returnRate: 0.4555, mdd: -0.1673 },
  { year: 2024, returnRate: 0.969, mdd: -0.1266 },
  { year: 2025, returnRate: 0.8039, mdd: -0.1816 },
];

async function main(): Promise<void> {
  console.log("=== 5개년 베이스라인 측정 (현재 파라미터) ===\n");

  // Load price data once
  const priceData = await loadPriceData("SOXL");
  console.log("가격 데이터 로드 완료: " + priceData.prices.length + "개 일자\n");

  console.log("| 연도 | 수익률(현재) | 수익률(타겟) | 차이 | MDD(현재) | MDD(타겟) | 전략점수 |");
  console.log("|------|-------------|-------------|------|----------|----------|----------|");

  for (let i = 0; i < years.length; i++) {
    const yearInfo = years[i];
    const target = targets[i];

    const config: OptimizationConfig = {
      ticker: "SOXL",
      startDate: yearInfo.start,
      endDate: yearInfo.end,
      initialCapital: 10000,
      randomCombinations: 50,
      variationsPerTop: 10,
      topCandidates: 3,
    };

    try {
      const result = await runBacktestWithParams(config, null, priceData);
      const returnPct = new Decimal(result.returnRate).mul(100).toDecimalPlaces(2).toNumber();
      const mddPct = new Decimal(result.mdd).mul(100).toDecimalPlaces(2).toNumber();
      const targetReturnPct = new Decimal(target.returnRate).mul(100).toDecimalPlaces(2).toNumber();
      const targetMddPct = new Decimal(target.mdd).mul(100).toDecimalPlaces(2).toNumber();
      const score = new Decimal(result.strategyScore).toDecimalPlaces(2).toNumber();
      const diff = new Decimal(returnPct).sub(targetReturnPct).toDecimalPlaces(2).toNumber();
      const diffSign = diff >= 0 ? "+" : "";

      console.log(
        "| " +
          yearInfo.year +
          " | " +
          returnPct +
          "% | " +
          targetReturnPct +
          "% | " +
          diffSign +
          diff +
          "% | " +
          mddPct +
          "% | " +
          targetMddPct +
          "% | " +
          score +
          " |"
      );
    } catch (e) {
      const err = e as Error;
      console.log("| " + yearInfo.year + " | ERROR: " + err.message + " |");
    }
  }

  console.log("\n완료");
}

main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
