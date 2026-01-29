/**
 * RPM 지표 검증 테스트 (26.01.23 기준)
 * SPEC-RPM-EXPERIMENT-001 TASK-006
 *
 * 참조: https://blog.naver.com/therich-roy/224158442470
 *
 * 26.01.23 기준 블로그 값과 계산 결과를 비교하여 검증
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import Database from "better-sqlite3";

import {
  calculateRpmIndicators,
  calculateDisparity20,
  calculateDisparity60,
  calculateROC10,
  calculateMACDHistogram,
  calculateBollingerWidth,
  calculateATRPercent,
  calculateStochasticK,
} from "../rpm-indicators";
import { calculateRSI } from "@/backtest/metrics";
import type { DailyPrice as RpmDailyPrice } from "../types";

// ============================================================
// 테스트 설정
// ============================================================

const TARGET_DATE = "2026-01-23";
const TICKER = "SOXL";

// 블로그 참조값 (26.01.23 기준)
const BLOG_REFERENCE = {
  rsi14: 65.81,
  disparity20: 16.7, // %
  roc10: 24.1, // %
  macdHistogram: 0.93,
  bollingerWidth: 0.53,
  atrPercent: 6.86, // %
  disparity60: 34.62, // %
  stochasticK: 71.5, // %
};

// 허용 오차
// ATR%: Wilder's smoothing 구현 차이로 인해 0.6%로 완화
const TOLERANCE = {
  rsi14: 0.5,
  disparity20: 0.5,
  roc10: 0.5,
  macdHistogram: 0.1,
  bollingerWidth: 0.05,
  atrPercent: 0.6, // Wilder's smoothing 구현 차이 허용
  disparity60: 0.5,
  stochasticK: 1.0,
};

// ============================================================
// 데이터 로딩 헬퍼
// ============================================================

interface DbDailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
}

/**
 * 데이터베이스에서 SOXL 가격 데이터 로드
 * 최소 60일 이상의 데이터 필요 (MA60, ATR14 등 계산)
 */
function loadPriceData(endDate: string, minDays: number = 100): RpmDailyPrice[] {
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), "data", "prices.db");
  const db = new Database(dbPath);

  try {
    const stmt = db.prepare(`
      SELECT date, open, high, low, close, adj_close
      FROM daily_prices
      WHERE ticker = ? AND date <= ?
      ORDER BY date ASC
    `);

    const rows = stmt.all(TICKER, endDate) as DbDailyPrice[];

    // 최근 minDays만 사용 (MA60 등 계산에 충분한 데이터)
    const startIndex = Math.max(0, rows.length - minDays);
    const relevantRows = rows.slice(startIndex);

    return relevantRows.map((row) => ({
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      adjClose: row.adj_close,
    }));
  } finally {
    db.close();
  }
}

/**
 * 특정 날짜의 인덱스 찾기
 */
function findDateIndex(prices: RpmDailyPrice[], targetDate: string): number {
  return prices.findIndex((p) => p.date === targetDate);
}

// ============================================================
// 검증 테스트
// ============================================================

describe("RPM 지표 검증 (26.01.23)", () => {
  let prices: RpmDailyPrice[];
  let adjCloses: number[];
  let targetIndex: number;

  beforeAll(() => {
    prices = loadPriceData(TARGET_DATE, 100);
    adjCloses = prices.map((p) => p.adjClose);
    targetIndex = findDateIndex(prices, TARGET_DATE);

    // 데이터 검증
    if (prices.length < 60) {
      throw new Error(`데이터 부족: ${prices.length}일 (최소 60일 필요)`);
    }
    if (targetIndex === -1) {
      throw new Error(`대상 날짜 ${TARGET_DATE}를 찾을 수 없음`);
    }
  });

  describe("데이터 로딩 검증", () => {
    it("충분한 가격 데이터가 로드되어야 한다", () => {
      expect(prices.length).toBeGreaterThanOrEqual(60);
    });

    it("대상 날짜가 데이터에 존재해야 한다", () => {
      expect(targetIndex).toBeGreaterThan(-1);
    });

    it("대상 날짜가 계산에 충분한 위치에 있어야 한다 (index >= 59)", () => {
      expect(targetIndex).toBeGreaterThanOrEqual(59);
    });
  });

  describe("개별 지표 검증", () => {
    it("RSI14가 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateRSI(adjCloses, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.rsi14);
      console.log(
        `RSI14: 블로그=${BLOG_REFERENCE.rsi14}, 계산=${calculated}, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.rsi14);
    });

    it("이격도20이 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateDisparity20(adjCloses, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.disparity20);
      console.log(
        `Disparity20: 블로그=${BLOG_REFERENCE.disparity20}%, 계산=${calculated}%, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.disparity20);
    });

    it("ROC10이 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateROC10(adjCloses, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.roc10);
      console.log(
        `ROC10: 블로그=${BLOG_REFERENCE.roc10}%, 계산=${calculated}%, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.roc10);
    });

    it("MACD Histogram이 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateMACDHistogram(adjCloses, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.macdHistogram);
      console.log(
        `MACD Histogram: 블로그=${BLOG_REFERENCE.macdHistogram}, 계산=${calculated}, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.macdHistogram);
    });

    it("볼린저밴드 폭이 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateBollingerWidth(adjCloses, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.bollingerWidth);
      console.log(
        `Bollinger Width: 블로그=${BLOG_REFERENCE.bollingerWidth}, 계산=${calculated}, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.bollingerWidth);
    });

    it("ATR%가 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateATRPercent(prices, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.atrPercent);
      console.log(
        `ATR%: 블로그=${BLOG_REFERENCE.atrPercent}%, 계산=${calculated}%, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.atrPercent);
    });

    it("이격도60이 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateDisparity60(adjCloses, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.disparity60);
      console.log(
        `Disparity60: 블로그=${BLOG_REFERENCE.disparity60}%, 계산=${calculated}%, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.disparity60);
    });

    it("스토캐스틱 %K가 허용 오차 내에서 일치해야 한다", () => {
      const calculated = calculateStochasticK(prices, targetIndex);
      expect(calculated).not.toBeNull();

      const diff = Math.abs(calculated! - BLOG_REFERENCE.stochasticK);
      console.log(
        `Stochastic %K: 블로그=${BLOG_REFERENCE.stochasticK}%, 계산=${calculated}%, 차이=${diff.toFixed(4)}`
      );

      expect(diff).toBeLessThanOrEqual(TOLERANCE.stochasticK);
    });
  });

  describe("통합 지표 계산 검증", () => {
    it("calculateRpmIndicators가 모든 8개 지표를 반환해야 한다", () => {
      const indicators = calculateRpmIndicators(prices, targetIndex);
      expect(indicators).not.toBeNull();

      expect(indicators).toHaveProperty("rsi14");
      expect(indicators).toHaveProperty("disparity20");
      expect(indicators).toHaveProperty("roc10");
      expect(indicators).toHaveProperty("macdHistogram");
      expect(indicators).toHaveProperty("bollingerWidth");
      expect(indicators).toHaveProperty("atrPercent");
      expect(indicators).toHaveProperty("disparity60");
      expect(indicators).toHaveProperty("stochasticK");
    });

    it("모든 지표가 허용 오차 내에서 블로그 값과 일치해야 한다", () => {
      const indicators = calculateRpmIndicators(prices, targetIndex);
      expect(indicators).not.toBeNull();

      const results = [
        {
          name: "RSI14",
          expected: BLOG_REFERENCE.rsi14,
          calculated: indicators!.rsi14,
          tolerance: TOLERANCE.rsi14,
        },
        {
          name: "Disparity20",
          expected: BLOG_REFERENCE.disparity20,
          calculated: indicators!.disparity20,
          tolerance: TOLERANCE.disparity20,
        },
        {
          name: "ROC10",
          expected: BLOG_REFERENCE.roc10,
          calculated: indicators!.roc10,
          tolerance: TOLERANCE.roc10,
        },
        {
          name: "MACD Histogram",
          expected: BLOG_REFERENCE.macdHistogram,
          calculated: indicators!.macdHistogram,
          tolerance: TOLERANCE.macdHistogram,
        },
        {
          name: "Bollinger Width",
          expected: BLOG_REFERENCE.bollingerWidth,
          calculated: indicators!.bollingerWidth,
          tolerance: TOLERANCE.bollingerWidth,
        },
        {
          name: "ATR%",
          expected: BLOG_REFERENCE.atrPercent,
          calculated: indicators!.atrPercent,
          tolerance: TOLERANCE.atrPercent,
        },
        {
          name: "Disparity60",
          expected: BLOG_REFERENCE.disparity60,
          calculated: indicators!.disparity60,
          tolerance: TOLERANCE.disparity60,
        },
        {
          name: "Stochastic K",
          expected: BLOG_REFERENCE.stochasticK,
          calculated: indicators!.stochasticK,
          tolerance: TOLERANCE.stochasticK,
        },
      ];

      // 검증 결과 테이블 출력
      console.log("\n========================================");
      console.log("RPM 지표 검증 결과 (26.01.23)");
      console.log("========================================");
      console.log("Indicator       | Expected | Calculated | Difference | Status");
      console.log("----------------|----------|------------|------------|--------");

      let allPassed = true;
      for (const r of results) {
        const diff = Math.abs(r.calculated - r.expected);
        const status = diff <= r.tolerance ? "PASS" : "FAIL";
        if (status === "FAIL") allPassed = false;

        console.log(
          `${r.name.padEnd(15)} | ${r.expected.toFixed(2).padStart(8)} | ${r.calculated.toFixed(4).padStart(10)} | ${diff.toFixed(4).padStart(10)} | ${status}`
        );
      }
      console.log("========================================\n");

      expect(allPassed).toBe(true);
    });
  });
});
