"use client";

/**
 * 자산 현황 섹션 컴포넌트
 */

import type React from "react";
import InvestmentRatioBar from "./InvestmentRatioBar";

interface AssetSummaryProps {
  totalAssets: number;
  totalShares: number;
  stockValue: number;
  cashBalance: number;
  profitRate: number;
  ticker: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export default function AssetSummary({
  totalAssets,
  totalShares,
  stockValue,
  cashBalance,
  profitRate,
  ticker,
}: AssetSummaryProps): React.ReactElement {
  const cashRatioRaw = totalAssets > 0 ? (cashBalance / totalAssets) * 100 : 100;
  const stockRatioRaw = totalAssets > 0 ? (stockValue / totalAssets) * 100 : 0;
  const cashRatio = Math.min(100, Math.max(0, cashRatioRaw));
  const stockRatio = Math.min(100, Math.max(0, stockRatioRaw));
  const profitClass = profitRate >= 0 ? "text-success" : "text-danger";

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">자산 현황</h5>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded">
              <div className="text-secondary small mb-1">총자산</div>
              <div className="h4 mb-0 text-light">{formatCurrency(totalAssets)}</div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded">
              <div className="text-secondary small mb-1">{ticker} 수량</div>
              <div className="h4 mb-0 text-light">{totalShares.toLocaleString()} 주</div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded">
              <div className="text-secondary small mb-1">{ticker} 평가금</div>
              <div className="h4 mb-0 text-light">
                {formatCurrency(stockValue)}
                <span className={`ms-2 small ${profitClass}`}>
                  ({formatPercent(profitRate)})
                </span>
              </div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded h-100">
              <div className="text-secondary small mb-1">예수금</div>
              <div className="h4 mb-0 text-light">{formatCurrency(cashBalance)}</div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="p-3 bg-secondary bg-opacity-25 rounded h-100 d-flex flex-column">
              <div className="text-secondary small mb-1">투자비중</div>
              <div className="mt-auto">
                <InvestmentRatioBar cashRatio={cashRatio} stockRatio={stockRatio} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
