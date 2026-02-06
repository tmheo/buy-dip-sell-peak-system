"use client";

/**
 * 티어별 보유 현황 테이블 컴포넌트
 */

import type React from "react";
import type { TierHolding, Strategy } from "@/types/trading";
import { TIER_RATIOS, TIER_COUNT } from "@/types/trading";
import { calculateTradingDays } from "@/utils/trading-core";

interface TierHoldingsTableProps {
  holdings: TierHolding[];
  seedCapital: number;
  strategy: Strategy;
  cashBalance: number;
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
  const [year, month, day] = date.split("-");
  const localDate = new Date(Number(year), Number(month) - 1, Number(day));
  return localDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function calculateHoldingDays(buyDate: string | null): string {
  if (!buyDate) return "-";
  // 오늘 날짜를 YYYY-MM-DD 형식으로
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  // 거래일(영업일) 기준으로 보유 기간 계산 (주말 제외)
  const tradingDays = calculateTradingDays(buyDate, todayStr);
  return `${tradingDays}일`;
}

function getTierLabel(tier: number): string {
  if (tier === 7) return "예비";
  return `${tier}`;
}

export default function TierHoldingsTable({
  holdings,
  seedCapital,
  strategy,
  cashBalance,
}: TierHoldingsTableProps): React.ReactElement {
  const ratios = TIER_RATIOS[strategy];
  const holdingsByTier = new Map(holdings.map((h) => [h.tier, h]));

  // 티어 1~6이 모두 매수되었는지 확인
  const allMainTiersFilled = Array.from({ length: 6 }, (_, i) => i + 1).every((tier) => {
    const holding = holdingsByTier.get(tier);
    return holding && holding.shares > 0;
  });

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">보유 현황</h5>
      </div>
      <div className="card-body p-0">
        {/* 데스크톱: 기존 테이블 (769px 이상) */}
        <div className="trading-desktop-table">
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
                  const isReserveTier = tier === 7;
                  // 예비 티어는 티어 1~6이 모두 매수된 경우에만 남은 예수금 표시
                  const allocatedSeed = isReserveTier
                    ? (allMainTiersFilled ? cashBalance : 0)
                    : (seedCapital * ratio) / 100;
                  const hasShares = holding && holding.shares > 0;

                  return (
                    <tr key={tier} className={hasShares ? "table-active" : ""}>
                      <td className="text-center">
                        <span className={hasShares ? "badge bg-success" : "badge bg-secondary"}>
                          {getTierLabel(tier)}
                        </span>
                      </td>
                      <td className="text-center">{isReserveTier ? "-" : `${ratio.toFixed(1)}%`}</td>
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

        {/* 모바일: 티어 카드 뷰 (768px 이하) */}
        <div className="trading-mobile-card p-2">
          {Array.from({ length: TIER_COUNT }, (_, i) => i + 1).map((tier) => {
            const holding = holdingsByTier.get(tier);
            const ratio = ratios[tier - 1];
            const isReserveTier = tier === 7;
            const allocatedSeed = isReserveTier
              ? (allMainTiersFilled ? cashBalance : 0)
              : (seedCapital * ratio) / 100;
            const hasShares = holding && holding.shares > 0;

            return (
              <div
                key={tier}
                className={`card mb-2 bg-dark ${hasShares ? "border-success" : "border-secondary"}`}
              >
                <div className="card-body py-2 px-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className={`tier-badge ${hasShares ? "active" : "inactive"}`}>
                      {getTierLabel(tier)}
                    </span>
                    <span className="small text-secondary">
                      {isReserveTier ? "예비" : `${ratio.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="row small">
                    <div className="col-6 text-secondary">
                      매수가: {formatCurrency(holding?.buyPrice ?? null)}
                    </div>
                    <div className="col-6 text-end text-secondary">
                      수량:{" "}
                      {hasShares ? (
                        <span className="text-success">{holding.shares.toLocaleString()}</span>
                      ) : (
                        "-"
                      )}
                    </div>
                    <div className="col-6 text-secondary">
                      할당: {formatCurrency(allocatedSeed)}
                    </div>
                    <div className="col-6 text-end text-secondary">
                      보유: {calculateHoldingDays(holding?.buyDate ?? null)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
