"use client";

/**
 * 투자비중 프로그레스 바 컴포넌트
 * 현금 vs 주식 비중을 시각화
 */

import type React from "react";

interface InvestmentRatioBarProps {
  cashRatio: number; // 0-100
  stockRatio: number; // 0-100
}

export default function InvestmentRatioBar({
  cashRatio,
  stockRatio,
}: InvestmentRatioBarProps): React.ReactElement {
  return (
    <div className="investment-ratio-container">
      <div className="d-flex justify-content-between mb-1">
        <small className="text-info">현금 {cashRatio.toFixed(1)}%</small>
        <small className="text-danger">주식 {stockRatio.toFixed(1)}%</small>
      </div>
      <div className="progress" style={{ height: "16px" }}>
        <div
          className="progress-bar bg-info"
          role="progressbar"
          style={{ width: `${cashRatio}%` }}
          aria-valuenow={cashRatio}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`현금 ${cashRatio.toFixed(1)}%`}
        />
        <div
          className="progress-bar bg-danger"
          role="progressbar"
          style={{ width: `${stockRatio}%` }}
          aria-valuenow={stockRatio}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`주식 ${stockRatio.toFixed(1)}%`}
        />
      </div>
    </div>
  );
}
