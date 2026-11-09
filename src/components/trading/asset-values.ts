/**
 * 계좌 화면 자산 현황 값 (#98)
 *
 * 총자산 = 계좌 현금 + 평가금, 평가금 = 저장된 가장 최근 종가 × 보유 수량.
 * 예수금과 계좌 현금은 계좌 상세 응답(cashBreakdown)의 값을 그대로 쓴다 - 둘은 이번 사이클
 * 실현손익을 입력으로 받는 매매 규칙의 파생값이라(ADR-0003) 화면이 다시 계산하지 않는다.
 * 실시간 시세가 아니라 저장된 종가 기준이다.
 */
import Decimal from "decimal.js";
import type { CashBreakdown } from "@/strategy";
import type { TierHolding } from "@/types/trading";

/** 저장된 가장 최근 종가와 그 거래일 (계좌 상세 응답의 latestClose) */
export interface LatestClose {
  date: string;
  adjClose: number;
}

export interface AssetValues {
  // 투자 중: Σ 티어 매수금액 (매수가 × 수량)
  investedAmount: number;
  // 평가금: 가장 최근 종가 × 보유 수량. 보유가 있는데 종가가 없으면 null
  stockValue: number | null;
  // 총자산: 계좌 현금 + 평가금. 평가금을 모르면 null
  totalAssets: number | null;
  // 평가손익률(%): (평가금 - 투자 중) ÷ 투자 중. 보유가 없으면 0, 평가금을 모르면 null
  profitRate: number | null;
  // 투자비중(%, 0-100): 계좌 현금과 평가금이 총자산에서 차지하는 비율. 평가금을 모르면 null
  cashRatio: number | null;
  stockRatio: number | null;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function calculateAssetValues(
  holdings: TierHolding[],
  cash: CashBreakdown,
  latestClose: LatestClose | null
): AssetValues {
  const active = holdings.filter(
    (holding): holding is TierHolding & { buyPrice: number } =>
      holding.shares > 0 && holding.buyPrice !== null
  );
  const invested = active.reduce(
    (sum, holding) => sum.add(new Decimal(holding.buyPrice).mul(holding.shares)),
    new Decimal(0)
  );
  const totalShares = active.reduce((sum, holding) => sum + holding.shares, 0);
  const investedAmount = invested.toNumber();

  const stockValue =
    totalShares === 0
      ? 0
      : latestClose
        ? new Decimal(latestClose.adjClose).mul(totalShares).toDecimalPlaces(2).toNumber()
        : null;

  if (stockValue === null) {
    return {
      investedAmount,
      stockValue,
      totalAssets: null,
      profitRate: null,
      cashRatio: null,
      stockRatio: null,
    };
  }

  const totalAssets = new Decimal(cash.accountCash).add(stockValue).toNumber();
  return {
    investedAmount,
    stockValue,
    totalAssets,
    profitRate: investedAmount > 0 ? ((stockValue - investedAmount) / investedAmount) * 100 : 0,
    cashRatio: totalAssets > 0 ? clampPercent((cash.accountCash / totalAssets) * 100) : 100,
    stockRatio: totalAssets > 0 ? clampPercent((stockValue / totalAssets) * 100) : 0,
  };
}
