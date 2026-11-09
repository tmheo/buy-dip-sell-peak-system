/**
 * 계좌 화면 자산 현황 값 테스트 (#98)
 *
 * 총자산 = 계좌 현금 + 평가금, 평가금 = 저장된 가장 최근 종가 × 보유 수량.
 * 예수금·계좌 현금·투자 중은 계좌 상세 응답(cashBreakdown)의 값을 그대로 쓴다 - 화면이 규칙을
 * 다시 계산하지 않는다. 보유 수량은 계좌 상세 응답의 totalShares 하나만 쓴다.
 *
 * 기준 시나리오 (시드 $10,000): 티어 1 $30 × 100주, 티어 2 $28 × 50주 보유
 * - 투자 중 = 3,000 + 1,400 = $4,400, 보유 수량 150주
 * - 이번 사이클 순실현손실 $500 → 계좌 현금 = 10,000 - 4,400 - 500 = $5,100
 */
import { describe, it, expect } from "vitest";
import { calculateAssetValues } from "../asset-values";
import type { CashBreakdown } from "@/strategy";

const TOTAL_SHARES = 150;

const CASH: CashBreakdown = {
  availableCash: 5_100,
  accountCash: 5_100,
  cycleCapital: 10_000,
  investedAmount: 4_400,
  netRealizedLoss: 500,
  isCashReduced: true,
  tiers: [],
};

describe("calculateAssetValues", () => {
  it("평가금은 가장 최근 종가 × 보유 수량이고, 총자산은 계좌 현금 + 평가금이다", () => {
    const values = calculateAssetValues(TOTAL_SHARES, CASH, { date: "2026-04-06", adjClose: 32 });

    // 평가금 = 32 × 150 = 4,800, 총자산 = 5,100 + 4,800 = 9,900
    expect(values.stockValue).toBe(4_800);
    expect(values.totalAssets).toBe(9_900);
    // 평가손익률 = (4,800 - 4,400) ÷ 4,400 = +9.09%
    expect(values.profitRate).toBeCloseTo(9.0909, 3);
  });

  it("평가금은 소수 둘째 자리에서 내림한다", () => {
    // 10.0066 × 3 = 30.0198 → $30.01 (반올림이면 $30.02)
    const values = calculateAssetValues(3, CASH, { date: "2026-04-06", adjClose: 10.0066 });

    expect(values.stockValue).toBe(30.01);
  });

  it("투자비중의 현금 비율은 계좌 현금 기준이다", () => {
    const values = calculateAssetValues(TOTAL_SHARES, CASH, { date: "2026-04-06", adjClose: 32 });

    // 현금 = 5,100 ÷ 9,900 = 51.5%, 주식 = 4,800 ÷ 9,900 = 48.5%
    expect(values.cashRatio).toBeCloseTo(51.515, 2);
    expect(values.stockRatio).toBeCloseTo(48.485, 2);
  });

  it("수익만 난 사이클에서는 계좌 현금이 예수금보다 커도 총자산은 계좌 현금으로 센다", () => {
    const profit: CashBreakdown = {
      ...CASH,
      availableCash: 5_600,
      accountCash: 5_700,
      netRealizedLoss: 0,
      isCashReduced: false,
    };

    const values = calculateAssetValues(TOTAL_SHARES, profit, {
      date: "2026-04-06",
      adjClose: 32,
    });

    expect(values.totalAssets).toBe(10_500);
    // 현금 비율도 예수금($5,600)이 아니라 계좌 현금 기준: 5,700 ÷ 10,500 = 54.29%
    expect(values.cashRatio).toBeCloseTo(54.2857, 2);
  });

  it("보유가 없으면 종가가 없어도 평가금은 0이고 현금 100%다", () => {
    const cash: CashBreakdown = {
      ...CASH,
      availableCash: 10_000,
      accountCash: 10_000,
      investedAmount: 0,
      netRealizedLoss: 0,
      isCashReduced: false,
    };

    const values = calculateAssetValues(0, cash, null);

    expect(values.stockValue).toBe(0);
    expect(values.totalAssets).toBe(10_000);
    expect(values.profitRate).toBe(0);
    expect(values.cashRatio).toBe(100);
    expect(values.stockRatio).toBe(0);
  });

  it("보유가 있는데 저장된 종가가 없으면 평가금과 총자산을 모른다", () => {
    const values = calculateAssetValues(TOTAL_SHARES, CASH, null);

    expect(values.stockValue).toBeNull();
    expect(values.totalAssets).toBeNull();
    expect(values.profitRate).toBeNull();
  });
});
