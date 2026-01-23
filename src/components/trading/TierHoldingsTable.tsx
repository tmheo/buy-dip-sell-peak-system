"use client";

/**
 * 티어별 보유 현황 테이블 컴포넌트
 */

import type React from "react";
import type { TierHolding, Strategy } from "@/types/trading";
import { TIER_RATIOS, TIER_COUNT } from "@/types/trading";

interface TierHoldingsTableProps {
  holdings: TierHolding[];
  seedCapital: number;
  strategy: Strategy;
}

function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function calculateHoldingDays(buyDate: string | null): string {
  if (!buyDate) return "-";
  const buy = new Date(buyDate);
  const today = new Date();
  const diffTime = today.getTime() - buy.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return `${diffDays}일`;
}

function getTierLabel(tier: number): string {
  if (tier === 7) return "예비";
  return `${tier}`;
}

export default function TierHoldingsTable({
  holdings,
  seedCapital,
  strategy,
}: TierHoldingsTableProps): React.ReactElement {
  const ratios = TIER_RATIOS[strategy];
  const holdingsByTier = new Map(holdings.map((h) => [h.tier, h]));

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">보유 현황</h5>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover mb-0">
            <thead>
              <tr>
                <th className="text-center">티어</th>
                <th className="text-center">비율</th>
                <th className="text-end">할당 시드</th>
                <th className="text-center">매수일</th>
                <th className="text-end">매수시드</th>
                <th className="text-end">매수가격</th>
                <th className="text-end">수량</th>
                <th className="text-end">매도목표</th>
                <th className="text-center">보유기간</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: TIER_COUNT }, (_, i) => i + 1).map((tier) => {
                const holding = holdingsByTier.get(tier);
                const ratio = ratios[tier - 1];
                const allocatedSeed = (seedCapital * ratio) / 100;
                const hasShares = holding && holding.shares > 0;

                return (
                  <tr key={tier} className={hasShares ? "table-active" : ""}>
                    <td className="text-center">
                      <span className={hasShares ? "badge bg-success" : "badge bg-secondary"}>
                        {getTierLabel(tier)}
                      </span>
                    </td>
                    <td className="text-center">{ratio}%</td>
                    <td className="text-end">{formatCurrency(allocatedSeed)}</td>
                    <td className="text-center">{formatDate(holding?.buyDate ?? null)}</td>
                    <td className="text-end">
                      {hasShares && holding?.buyPrice
                        ? formatCurrency(holding.buyPrice * holding.shares)
                        : "-"}
                    </td>
                    <td className="text-end">{formatCurrency(holding?.buyPrice ?? null)}</td>
                    <td className="text-end">
                      {hasShares ? (
                        <span className="text-success">{holding.shares.toLocaleString()}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="text-end">{formatCurrency(holding?.sellTargetPrice ?? null)}</td>
                    <td className="text-center">{calculateHoldingDays(holding?.buyDate ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
