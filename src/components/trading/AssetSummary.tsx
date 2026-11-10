"use client";

/**
 * 자산 현황 섹션 컴포넌트
 *
 * 총자산은 계좌 현금 + 평가금이고, 평가금은 저장된 가장 최근 종가 기준이다 (#98).
 * 시드 감액으로 사이클을 끝내는 날에는 아직 출금하지 않은 감액분을 더하고 그렇다고 적는다 (ADR-0006).
 * 예수금이 이번 사이클 순실현손실로 줄었을 때만 예수금 칸에 계산식을 펼친다 (#98, ADR-0003,
 * 결정은 #93). 계산식의 항목은 모두 계좌 상세 응답(cashBreakdown)의 값이다.
 */

import type React from "react";
import type { CashBreakdown } from "@/strategy";
import InvestmentRatioBar from "./InvestmentRatioBar";
import type { AssetValues } from "./asset-values";
import { formatCurrency, formatPercent } from "./format";

interface AssetSummaryProps {
  ticker: string;
  totalShares: number;
  values: AssetValues;
  cash: CashBreakdown;
  // 평가금에 쓴 종가의 거래일 (YYYY-MM-DD). 저장된 종가가 없으면 null
  priceDate: string | null;
}

/** YYYY-MM-DD → "4월 6일" */
function formatMonthDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function FormulaRow({
  label,
  value,
  valueClassName = "text-light",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}): React.ReactElement {
  return (
    <div className="d-flex justify-content-between gap-2 small">
      <span className="text-secondary">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

export default function AssetSummary({
  ticker,
  totalShares,
  values,
  cash,
  priceDate,
}: AssetSummaryProps): React.ReactElement {
  const { totalAssets, stockValue, profitRate, cashRatio, stockRatio } = values;
  const profitClass = (profitRate ?? 0) >= 0 ? "text-success" : "text-danger";
  // 실현손익 합이 0 이상이면 예수금은 줄지 않는다 - 숫자 하나만 보인다
  const { isCashReduced } = cash;

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">자산 현황</h5>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded h-100">
              <div className="text-secondary small mb-1">총자산</div>
              <div className="h4 mb-0 text-light">{formatCurrency(totalAssets)}</div>
              {cash.unwithdrawnCut > 0 && totalAssets !== null && (
                <div className="text-secondary small mt-1">
                  출금 전 금액 {formatCurrency(cash.unwithdrawnCut)} 포함
                </div>
              )}
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded h-100">
              <div className="text-secondary small mb-1">{ticker} 수량</div>
              <div className="h4 mb-0 text-light">{totalShares.toLocaleString()} 주</div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded h-100">
              <div className="text-secondary small mb-1">{ticker} 평가금</div>
              <div className="h4 mb-0 text-light">
                {formatCurrency(stockValue)}
                {profitRate !== null && (
                  <span className={`ms-2 small ${profitClass}`}>({formatPercent(profitRate)})</span>
                )}
              </div>
              {priceDate && totalShares > 0 && (
                <div className="text-secondary small mt-1">
                  {formatMonthDay(priceDate)} 종가 기준
                </div>
              )}
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded h-100">
              <div className="text-secondary small mb-1">예수금</div>
              <div className={`h4 text-light ${isCashReduced ? "mb-2" : "mb-0"}`}>
                {formatCurrency(cash.availableCash)}
              </div>
              {isCashReduced && (
                <div className="border-top border-secondary pt-2">
                  <FormulaRow label="시드" value={formatCurrency(cash.cycleCapital)} />
                  <FormulaRow label="− 투자 중" value={formatCurrency(cash.investedAmount)} />
                  <FormulaRow
                    label="− 이번 사이클 순실현손실"
                    value={formatCurrency(cash.netRealizedLoss)}
                    valueClassName="text-danger"
                  />
                  <div className="border-top border-secondary mt-1 pt-1">
                    <FormulaRow label="= 예수금" value={formatCurrency(cash.availableCash)} />
                  </div>
                  {cash.availableCash === 0 && (
                    <div className="text-secondary small mt-1">
                      예수금은 0보다 작아지지 않습니다.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded h-100 d-flex flex-column">
              <div className="text-secondary small mb-1">투자비중</div>
              <div className="mt-auto">
                {cashRatio !== null && stockRatio !== null ? (
                  <InvestmentRatioBar cashRatio={cashRatio} stockRatio={stockRatio} />
                ) : (
                  <div className="h4 mb-0 text-light">-</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
