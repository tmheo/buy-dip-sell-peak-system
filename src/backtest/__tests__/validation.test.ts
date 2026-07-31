/**
 * 기준값 검증 테스트
 * SPEC-BACKTEST-001 REQ-011
 *
 * Test Period: 2025-01-02 ~ 2025-12-19
 * Initial Capital: $10,000
 *
 * 기준값은 현재 백테스트 엔진 구현 결과입니다.
 * decimal.js를 사용하여 모든 금융 계산의 부동소수점 오차를 제거했습니다.
 *
 * 티어 고정 방식 적용 (2025-01-17):
 * - 매도/손절 시 티어 번호는 그대로 유지 (빈 슬롯으로 남음)
 * - 다음 매수는 가장 낮은 빈 티어에 배정
 * - 예: T1 손절, T2,T3 보유 → T4 매수 (T1이 비어 있어도 손절 전 상태 기준)
 *
 * MOC 손절 당일 매도 (2025-01-17):
 * - 손절 조건 충족일에 바로 MOC 매도 (다음 날이 아님)
 * - 실제 증권시장의 LOC/MOC 주문 특성 반영
 *
 * 동시 주문 원칙 (2025-01-17):
 * - 모든 주문(매수/매도/손절)은 장 마감 전 동시에 제출됨
 * - 매수 티어는 손절/매도 전 상태 기준으로 결정
 *
 * src/strategy 이행 재기준선 (2026-07-31, #46):
 * - 체결 판정·체결가·평가를 close에서 adjClose로 전환 (#43 가격 불변식)
 * - 예수금 = 사이클 자본 - Σ(활성 티어 투자원금), 실현 수익 사이클 중 미재투자 (ADR-0001)
 * - 예수금 의미 변경의 영향은 미미했고(Pro1/Pro2 동일, Pro3 -$8) 차이의 대부분은
 *   adjClose 전환에서 온다. 전략이 정수 수량 floor, 2자리 지정가, ±0.01% 임계값이라는
 *   경계 위에서 돌기 때문에 시계열의 미세한 변화(가격 수준, 배당락일 등락률)가
 *   판정 하나를 뒤집으면 그 경로 차이가 사이클 복리로 ±20%p까지 증폭된다.
 *   실제로 close 시계열을 0.1%만 균일 스케일링해도(등락률 동일) Pro3는 49%→32%로
 *   이동해 새 기준값과 일치하는 안정 경로에 수렴한다. 즉 골든 값은 특정 데이터에
 *   대한 결정론적 회귀 앵커이지, 전략 우열의 근거가 아니다.
 *
 * 현재 구현 기준값:
 * | Strategy | Final Asset | Return | MDD |
 * |----------|-------------|--------|-----|
 * | Pro1 | $13,429 | 34.29% | -18.87% |
 * | Pro2 | $15,292 | 52.92% | -27.74% |
 * | Pro3 | $13,304 | 33.04% | -47.64% |
 */
import { describe, it, expect, beforeAll } from "vitest";
import { BacktestEngine } from "../engine";
import { getPriceRange } from "@/database/prices";
import type { BacktestRequest, BacktestResult } from "../types";
import type { Strategy } from "@/types/trading";
import type { DailyPrice } from "@/types";

// 테스트 상수
const TEST_START_DATE = "2025-01-02";
const TEST_END_DATE = "2025-12-19";
const INITIAL_CAPITAL = 10000;

// 기준값 및 허용 오차
interface ValidationCriteria {
  finalAsset: number;
  returnRate: number;
  mdd: number;
  tolerance: {
    finalAsset: number; // ±1% of final asset
    returnRate: number; // ±1%p (0.01)
    mdd: number; // ±1%p (0.01)
  };
}

const VALIDATION_CRITERIA: Record<Strategy, ValidationCriteria> = {
  Pro1: {
    finalAsset: 13429,
    returnRate: 0.3429,
    mdd: -0.1887,
    tolerance: {
      finalAsset: 13429 * 0.01, // ±1%
      returnRate: 0.01, // ±1%p
      mdd: 0.01, // ±1%p
    },
  },
  Pro2: {
    finalAsset: 15292,
    returnRate: 0.5292,
    mdd: -0.2774,
    tolerance: {
      finalAsset: 15292 * 0.01,
      returnRate: 0.01,
      mdd: 0.01,
    },
  },
  Pro3: {
    finalAsset: 13304,
    returnRate: 0.3304,
    mdd: -0.4764,
    tolerance: {
      finalAsset: 13304 * 0.01,
      returnRate: 0.01,
      mdd: 0.01,
    },
  },
};

describe("기준값 검증 테스트", () => {
  let prices: DailyPrice[] = [];
  let hasData = false;

  beforeAll(async () => {
    try {
      prices = await getPriceRange("SOXL", TEST_START_DATE, TEST_END_DATE);
      hasData = prices.length >= 200; // 약 1년치 거래일
      if (!hasData) {
        console.log(
          `[INFO] 검증 테스트 건너뜀: 가격 데이터 부족 (${prices.length}일 / 최소 200일 필요)`
        );
      }
    } catch {
      console.log("[INFO] 검증 테스트 건너뜀: 데이터베이스 접근 불가");
    }
  });

  const runBacktest = async (strategyName: Strategy): Promise<BacktestResult | null> => {
    if (!hasData) return null;

    const engine = new BacktestEngine(strategyName);
    const request: BacktestRequest = {
      ticker: "SOXL",
      strategy: strategyName,
      startDate: TEST_START_DATE,
      endDate: TEST_END_DATE,
      initialCapital: INITIAL_CAPITAL,
    };

    return engine.run(request, prices);
  };

  describe("Pro1 전략 검증", () => {
    it("최종 자산이 기준값 ±1% 이내", async () => {
      const result = await runBacktest("Pro1");
      if (!result) {
        console.log("[SKIP] Pro1 최종 자산 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro1;
      const lowerBound = criteria.finalAsset - criteria.tolerance.finalAsset;
      const upperBound = criteria.finalAsset + criteria.tolerance.finalAsset;

      console.log(`[Pro1] 최종 자산: $${result.finalAsset.toFixed(2)}`);
      console.log(
        `       기준값: $${criteria.finalAsset} (허용: $${lowerBound.toFixed(2)} ~ $${upperBound.toFixed(2)})`
      );

      expect(result.finalAsset).toBeGreaterThanOrEqual(lowerBound);
      expect(result.finalAsset).toBeLessThanOrEqual(upperBound);
    });

    it("수익률이 기준값 ±1%p 이내", async () => {
      const result = await runBacktest("Pro1");
      if (!result) {
        console.log("[SKIP] Pro1 수익률 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro1;
      const lowerBound = criteria.returnRate - criteria.tolerance.returnRate;
      const upperBound = criteria.returnRate + criteria.tolerance.returnRate;

      console.log(`[Pro1] 수익률: ${(result.returnRate * 100).toFixed(2)}%`);
      console.log(
        `       기준값: ${(criteria.returnRate * 100).toFixed(2)}% (허용: ${(lowerBound * 100).toFixed(2)}% ~ ${(upperBound * 100).toFixed(2)}%)`
      );

      expect(result.returnRate).toBeGreaterThanOrEqual(lowerBound);
      expect(result.returnRate).toBeLessThanOrEqual(upperBound);
    });

    it("MDD가 기준값 ±1%p 이내", async () => {
      const result = await runBacktest("Pro1");
      if (!result) {
        console.log("[SKIP] Pro1 MDD 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro1;
      const lowerBound = criteria.mdd - criteria.tolerance.mdd;
      const upperBound = criteria.mdd + criteria.tolerance.mdd;

      console.log(`[Pro1] MDD: ${(result.mdd * 100).toFixed(2)}%`);
      console.log(
        `       기준값: ${(criteria.mdd * 100).toFixed(2)}% (허용: ${(lowerBound * 100).toFixed(2)}% ~ ${(upperBound * 100).toFixed(2)}%)`
      );

      expect(result.mdd).toBeGreaterThanOrEqual(lowerBound);
      expect(result.mdd).toBeLessThanOrEqual(upperBound);
    });
  });

  describe("Pro2 전략 검증", () => {
    it("최종 자산이 기준값 ±1% 이내", async () => {
      const result = await runBacktest("Pro2");
      if (!result) {
        console.log("[SKIP] Pro2 최종 자산 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro2;
      const lowerBound = criteria.finalAsset - criteria.tolerance.finalAsset;
      const upperBound = criteria.finalAsset + criteria.tolerance.finalAsset;

      console.log(`[Pro2] 최종 자산: $${result.finalAsset.toFixed(2)}`);
      console.log(
        `       기준값: $${criteria.finalAsset} (허용: $${lowerBound.toFixed(2)} ~ $${upperBound.toFixed(2)})`
      );

      expect(result.finalAsset).toBeGreaterThanOrEqual(lowerBound);
      expect(result.finalAsset).toBeLessThanOrEqual(upperBound);
    });

    it("수익률이 기준값 ±1%p 이내", async () => {
      const result = await runBacktest("Pro2");
      if (!result) {
        console.log("[SKIP] Pro2 수익률 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro2;
      const lowerBound = criteria.returnRate - criteria.tolerance.returnRate;
      const upperBound = criteria.returnRate + criteria.tolerance.returnRate;

      console.log(`[Pro2] 수익률: ${(result.returnRate * 100).toFixed(2)}%`);
      console.log(
        `       기준값: ${(criteria.returnRate * 100).toFixed(2)}% (허용: ${(lowerBound * 100).toFixed(2)}% ~ ${(upperBound * 100).toFixed(2)}%)`
      );

      expect(result.returnRate).toBeGreaterThanOrEqual(lowerBound);
      expect(result.returnRate).toBeLessThanOrEqual(upperBound);
    });

    it("MDD가 기준값 ±1%p 이내", async () => {
      const result = await runBacktest("Pro2");
      if (!result) {
        console.log("[SKIP] Pro2 MDD 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro2;
      const lowerBound = criteria.mdd - criteria.tolerance.mdd;
      const upperBound = criteria.mdd + criteria.tolerance.mdd;

      console.log(`[Pro2] MDD: ${(result.mdd * 100).toFixed(2)}%`);
      console.log(
        `       기준값: ${(criteria.mdd * 100).toFixed(2)}% (허용: ${(lowerBound * 100).toFixed(2)}% ~ ${(upperBound * 100).toFixed(2)}%)`
      );

      expect(result.mdd).toBeGreaterThanOrEqual(lowerBound);
      expect(result.mdd).toBeLessThanOrEqual(upperBound);
    });
  });

  describe("Pro3 전략 검증", () => {
    it("최종 자산이 기준값 ±1% 이내", async () => {
      const result = await runBacktest("Pro3");
      if (!result) {
        console.log("[SKIP] Pro3 최종 자산 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro3;
      const lowerBound = criteria.finalAsset - criteria.tolerance.finalAsset;
      const upperBound = criteria.finalAsset + criteria.tolerance.finalAsset;

      console.log(`[Pro3] 최종 자산: $${result.finalAsset.toFixed(2)}`);
      console.log(
        `       기준값: $${criteria.finalAsset} (허용: $${lowerBound.toFixed(2)} ~ $${upperBound.toFixed(2)})`
      );

      expect(result.finalAsset).toBeGreaterThanOrEqual(lowerBound);
      expect(result.finalAsset).toBeLessThanOrEqual(upperBound);
    });

    it("수익률이 기준값 ±1%p 이내", async () => {
      const result = await runBacktest("Pro3");
      if (!result) {
        console.log("[SKIP] Pro3 수익률 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro3;
      const lowerBound = criteria.returnRate - criteria.tolerance.returnRate;
      const upperBound = criteria.returnRate + criteria.tolerance.returnRate;

      console.log(`[Pro3] 수익률: ${(result.returnRate * 100).toFixed(2)}%`);
      console.log(
        `       기준값: ${(criteria.returnRate * 100).toFixed(2)}% (허용: ${(lowerBound * 100).toFixed(2)}% ~ ${(upperBound * 100).toFixed(2)}%)`
      );

      expect(result.returnRate).toBeGreaterThanOrEqual(lowerBound);
      expect(result.returnRate).toBeLessThanOrEqual(upperBound);
    });

    it("MDD가 기준값 ±1%p 이내", async () => {
      const result = await runBacktest("Pro3");
      if (!result) {
        console.log("[SKIP] Pro3 MDD 검증: 데이터 없음");
        return;
      }

      const criteria = VALIDATION_CRITERIA.Pro3;
      const lowerBound = criteria.mdd - criteria.tolerance.mdd;
      const upperBound = criteria.mdd + criteria.tolerance.mdd;

      console.log(`[Pro3] MDD: ${(result.mdd * 100).toFixed(2)}%`);
      console.log(
        `       기준값: ${(criteria.mdd * 100).toFixed(2)}% (허용: ${(lowerBound * 100).toFixed(2)}% ~ ${(upperBound * 100).toFixed(2)}%)`
      );

      expect(result.mdd).toBeGreaterThanOrEqual(lowerBound);
      expect(result.mdd).toBeLessThanOrEqual(upperBound);
    });
  });
});
