/**
 * #88 실현 손실 반영 방식별 백테스트 비교 (버리는 브랜치 전용)
 * 실행: DATABASE_URL=... npx tsx scripts/compare-loss-variants.ts
 */
import { getAllPricesByTicker } from "@/database/prices";
import { BacktestEngine } from "@/backtest/engine";
import { setCashVariant, experiment } from "@/strategy";
import type { CashVariant, ExperimentStats } from "@/strategy";
import { lastStats } from "@/strategy/experiment";
import * as exp from "@/strategy/experiment";
import type { Strategy } from "@/types/trading";
import type { DailyPrice } from "@/types";

const VARIANTS: CashVariant[] = ["current", "A_i", "A_ii", "B_i"];
const STRATEGIES: Strategy[] = ["Pro1", "Pro2", "Pro3"];
const CAPITAL = 10000;

interface Row {
  returnRate: number;
  cagr: number;
  mdd: number;
  cycles: number;
  stats: ExperimentStats;
}

async function runOne(
  prices: DailyPrice[],
  strategy: Strategy,
  variant: CashVariant,
  start: string,
  end: string
): Promise<Row> {
  setCashVariant(variant);
  const startIndex = prices.findIndex((p) => p.date >= start);
  let endIndex = prices.length - 1;
  while (prices[endIndex].date > end) endIndex--;
  const slice = prices.slice(0, endIndex + 1);
  const result = await new BacktestEngine(strategy).run(
    {
      ticker: "SOXL",
      strategy,
      startDate: slice[startIndex].date,
      endDate: slice[endIndex].date,
      initialCapital: CAPITAL,
    },
    slice,
    startIndex
  );
  void lastStats;
  return {
    returnRate: result.returnRate,
    cagr: result.cagr,
    mdd: result.mdd,
    cycles: result.totalCycles,
    stats: { ...exp.lastStats },
  };
}

const pct = (x: number, d = 1) => (x * 100).toFixed(d) + "%";
const usd = (x: number) => "$" + Math.round(x).toLocaleString("en-US");

async function main(): Promise<void> {
  const prices = await getAllPricesByTicker("SOXL");
  const first = prices[0].date;
  const last = prices[prices.length - 1].date;
  const periods = [
    { name: `전체 기간 (${first} ~ ${last})`, start: first, end: last },
    { name: "2022 하락장 (2021-12-27 ~ 2022-10-14)", start: "2021-12-27", end: "2022-10-14" },
    { name: "최근 하락 구간 (2024-07-10 ~ 2025-04-08)", start: "2024-07-10", end: "2025-04-08" },
    { name: "최근 하락 후 반등 포함 (2024-07-10 ~ " + last + ")", start: "2024-07-10", end: last },
  ];

  for (const period of periods) {
    console.log(`\n### ${period.name}\n`);
    console.log(
      "| 전략 | 변형 | 총수익률 | 연환산 | MDD | 사이클 | 손실 사이클 | 손절(손실/전체) | 계좌 현금 초과 주문(체결) | 최대 초과액 | 최대 초과율(사이클 자본 대비) |"
    );
    console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const strategy of STRATEGIES) {
      for (const variant of VARIANTS) {
        const r = await runOne(prices, strategy, variant, period.start, period.end);
        const s = r.stats;
        console.log(
          `| ${strategy} | ${variant} | ${pct(r.returnRate)} | ${pct(r.cagr)} | ${pct(r.mdd)} | ${r.cycles} | ${s.losingCycles} | ${s.stopLossLossCount}/${s.stopLossCount} | ${s.ordersOverCash}(${s.executedOverCash}) | ${s.maxExcess > 0 ? usd(s.maxExcess) + " (" + s.maxExcessDate + ")" : "-"} | ${s.maxExcessPct > 0 ? pct(s.maxExcessPct) : "-"} |`
        );
      }
    }
  }

  // 경로 민감도 보정: 1년 롤링 구간(매월 시작) 분포
  console.log("\n### 1년 롤링 구간 (매월 첫 거래일 시작, 252거래일)\n");
  const starts: number[] = [];
  let lastMonth = "";
  for (let i = 1; i + 252 < prices.length; i++) {
    const m = prices[i].date.slice(0, 7);
    if (m !== lastMonth) {
      starts.push(i);
      lastMonth = m;
    }
  }
  console.log(`구간 수: ${starts.length}\n`);
  console.log(
    "| 전략 | 변형 | 수익률 중앙값 | 수익률 평균 | MDD 중앙값 | 최악 MDD | 현행보다 수익률 높음/같음/낮음 | 초과 주문 발생 구간 | 구간 내 최대 초과율 |"
  );
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const strategy of STRATEGIES) {
    const base: number[] = [];
    for (const variant of VARIANTS) {
      const rets: number[] = [];
      const mdds: number[] = [];
      let over = 0;
      let worstPct = 0;
      for (const si of starts) {
        const r = await runOne(prices, strategy, variant, prices[si].date, prices[si + 252].date);
        rets.push(r.returnRate);
        mdds.push(r.mdd);
        if (r.stats.ordersOverCash > 0) over++;
        worstPct = Math.max(worstPct, r.stats.maxExcessPct);
      }
      if (variant === "current") base.push(...rets);
      let hi = 0,
        eq = 0,
        lo = 0;
      rets.forEach((x, k) => {
        const d = x - base[k];
        if (Math.abs(d) < 1e-9) eq++;
        else if (d > 0) hi++;
        else lo++;
      });
      const median = (a: number[]) => {
        const b = [...a].sort((x, y) => x - y);
        return b[Math.floor(b.length / 2)];
      };
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      console.log(
        `| ${strategy} | ${variant} | ${pct(median(rets))} | ${pct(mean)} | ${pct(median(mdds))} | ${pct(Math.min(...mdds))} | ${variant === "current" ? "-" : `${hi}/${eq}/${lo}`} | ${over} | ${worstPct > 0 ? pct(worstPct) : "-"} |`
      );
    }
  }
  void experiment;
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
