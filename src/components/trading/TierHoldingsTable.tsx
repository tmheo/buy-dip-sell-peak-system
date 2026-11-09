"use client";

/**
 * 티어별 보유 현황 테이블 컴포넌트
 *
 * 아직 안 산 티어의 할당 시드는 cashBreakdown이 정한 금액을 그대로 보이고, 예수금 때문에 비율대로
 * 못 사는 티어에는 "예수금 부족으로 축소"를 붙인다 (#98, ADR-0003, 결정은 #93). 데스크톱 표와
 * 휴대폰 카드가 같은 정보를 보인다.
 */

import type React from "react";
import type { TierHolding, Strategy } from "@/types/trading";
import type { CashBreakdown } from "@/strategy";
import { calculateTradingDays, getTodayTradingDate } from "@/lib/date";
import { formatCurrency, getTierLabel } from "./format";
import { buildTierRows, reductionNotice, type TierRow } from "./tier-rows";

interface TierHoldingsTableProps {
  holdings: TierHolding[];
  strategy: Strategy;
  cash: CashBreakdown;
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
  // 거래일(영업일) 기준으로 보유 기간 계산 (주말 제외, 매수일 포함)
  const tradingDays = calculateTradingDays(buyDate, getTodayTradingDate());
  return `${tradingDays}일`;
}

/** 축소 표시 배지. 표와 카드가 같은 문구를 쓴다. */
function ReducedBadge(): React.ReactElement {
  return <span className="badge bg-warning text-dark fw-normal">예수금 부족으로 축소</span>;
}

/** 할당 시드 금액. 축소된 티어는 비율대로의 금액을 지우고 실제 금액을 강조한다. */
function AllocatedSeed({ row }: { row: TierRow }): React.ReactElement {
  if (row.allocatedSeed === null) {
    return <>-</>;
  }
  if (row.reducedFrom === null) {
    return <>{formatCurrency(row.allocatedSeed)}</>;
  }
  return (
    <>
      <s className="text-secondary me-2">{formatCurrency(row.reducedFrom)}</s>
      <span className="text-warning">{formatCurrency(row.allocatedSeed)}</span>
    </>
  );
}

export default function TierHoldingsTable({
  holdings,
  strategy,
  cash,
}: TierHoldingsTableProps): React.ReactElement {
  const tierData = buildTierRows(holdings, strategy, cash);
  const notice = reductionNotice(cash);

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">보유 현황</h5>
      </div>
      <div className="card-body p-0">
        {/* 데스크톱: 기존 테이블 (769px 이상) */}
        <div className="trading-desktop-table">
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover align-middle mb-0">
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
                {tierData.map((row) => {
                  const { tier, holding, ratioPercent, isReserveTier, hasShares } = row;
                  return (
                    <tr key={tier} className={hasShares ? "table-active" : ""}>
                      <td className="text-center">
                        <span className={hasShares ? "badge bg-success" : "badge bg-secondary"}>
                          {getTierLabel(tier)}
                        </span>
                      </td>
                      <td className="text-center">
                        {isReserveTier ? "-" : `${ratioPercent.toFixed(1)}%`}
                      </td>
                      <td className="text-end">
                        <AllocatedSeed row={row} />
                        {row.reducedFrom !== null && (
                          <div className="mt-1">
                            <ReducedBadge />
                          </div>
                        )}
                      </td>
                      <td className="text-center">{formatDate(holding?.buyDate ?? null)}</td>
                      <td className="text-end">
                        {hasShares && holding?.buyPrice
                          ? formatCurrency(holding.buyPrice * holding.shares)
                          : "-"}
                      </td>
                      <td className="text-end">{formatCurrency(holding?.buyPrice ?? null)}</td>
                      <td className="text-end">
                        {hasShares ? (
                          <span className="text-success">{holding?.shares.toLocaleString()}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="text-end">
                        {formatCurrency(holding?.sellTargetPrice ?? null)}
                      </td>
                      <td className="text-center">
                        {calculateHoldingDays(holding?.buyDate ?? null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 모바일: 티어 카드 뷰 (768px 이하) */}
        <div className="trading-mobile-card p-2">
          {tierData.map((row) => {
            const { tier, holding, ratioPercent, isReserveTier, hasShares } = row;
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
                      {isReserveTier ? "예비" : `${ratioPercent.toFixed(1)}%`}
                    </span>
                  </div>
                  {/* 격자(.row/.col-6) 대신 flex 줄로 둔다: 모바일 전역 규칙의 .card.bg-dark .col-6
                      여백·글자 크기 조정이 이 카드에 새어 들어와 글자가 카드 테두리에 붙고
                      금액·수량이 작아졌다 */}
                  <div className="d-flex justify-content-between gap-2 small text-secondary">
                    <span>매수가: {formatCurrency(holding?.buyPrice ?? null)}</span>
                    <span>
                      수량:{" "}
                      {hasShares ? (
                        <span className="text-success">{holding?.shares.toLocaleString()}</span>
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between gap-2 small text-secondary">
                    <span>
                      할당: <AllocatedSeed row={row} />
                    </span>
                    <span>보유: {calculateHoldingDays(holding?.buyDate ?? null)}</span>
                  </div>
                  {row.reducedFrom !== null && (
                    <div className="mt-1">
                      <ReducedBadge />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {notice !== null && (
        <div className="card-footer border-secondary">
          <small className="text-secondary" style={{ wordBreak: "keep-all" }}>
            * {notice}
          </small>
        </div>
      )}
    </div>
  );
}
