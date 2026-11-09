/**
 * 계좌 화면 자산 현황 값 (#98)
 *
 * 총자산 = 계좌 현금 + 평가금, 평가금 = 저장된 가장 최근 종가 × 보유 수량.
 * 계좌 현금과 투자 중은 계좌 상세 응답(cashBreakdown)의 값을 그대로 쓴다 - 둘은 매매 규칙의
 * 파생값이라(ADR-0003) 화면이 다시 계산하지 않는다. 보유 수량은 계좌 상세 응답의 totalShares다.
 * 실시간 시세가 아니라 저장된 종가 기준이다.
 */
import Decimal from "decimal.js";
import type { LatestClose } from "@/database/trading";
import type { CashBreakdown } from "@/strategy";

export interface AssetValues {
  // 평가금: 가장 최근 종가 × 보유 수량 (소수 둘째 자리 내림). 보유가 있는데 종가가 없으면 null
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

/**
 * @param totalShares - 보유 수량 (계좌 상세 응답의 account.totalShares)
 * @param cash - 계좌 상세 응답의 현금 내역
 * @param latestClose - 저장된 가장 최근 종가. 가격 행이 없으면 null
 */
export function calculateAssetValues(
  totalShares: number,
  cash: CashBreakdown,
  latestClose: LatestClose | null
): AssetValues {
  const stockValue =
    totalShares === 0
      ? 0
      : latestClose
        ? new Decimal(latestClose.adjClose)
            .mul(totalShares)
            .toDecimalPlaces(2, Decimal.ROUND_DOWN)
            .toNumber()
        : null;

  if (stockValue === null) {
    return {
      stockValue,
      totalAssets: null,
      profitRate: null,
      cashRatio: null,
      stockRatio: null,
    };
  }

  const { investedAmount, accountCash } = cash;
  const totalAssets = new Decimal(accountCash).add(stockValue).toNumber();
  return {
    stockValue,
    totalAssets,
    profitRate: investedAmount > 0 ? ((stockValue - investedAmount) / investedAmount) * 100 : 0,
    cashRatio: totalAssets > 0 ? clampPercent((accountCash / totalAssets) * 100) : 100,
    stockRatio: totalAssets > 0 ? clampPercent((stockValue / totalAssets) * 100) : 0,
  };
}
