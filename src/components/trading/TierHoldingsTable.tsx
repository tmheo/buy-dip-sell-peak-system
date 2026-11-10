"use client";

/**
 * 티어별 보유 현황 테이블 컴포넌트
 *
 * 아직 안 산 티어의 할당 시드는 cashBreakdown이 정한 금액을 그대로 보이고, 예수금 때문에 비율대로
 * 못 사는 티어에는 "예수금 부족으로 축소"를 붙인다 (#98, ADR-0003, 결정은 #93). 보유 중인 기본
 * 티어의 할당 시드는 비워 둔다 - 산 금액은 매수시드 열에 있다 (#118). 시드 감액으로 사이클을
 * 끝내는 날에는 보유 티어에 "오늘 모두 매도"와 매도목표 MOC를 보인다 (ADR-0006).
 * 무엇을 보일지는 티어 줄(tier-rows.ts)이 정하고, 이 컴포넌트는 그대로 그린다.
 *
 * 휴대폰 카드는 칸이 좁아, 보유 티어에는 늘 비어 있는 할당 시드 대신 매도목표를 보인다.
 */

import type React from "react";
import type { TierHolding, Strategy } from "@/types/trading";
import type { CashBreakdown } from "@/strategy";
import { calculateTradingDays, getTodayTradingDate } from "@/lib/date";
import { formatCurrency, formatDate, getTierLabel } from "./format";
import { buildTierRows, reductionNotice, type TierRow, type TierRowBadge } from "./tier-rows";

interface TierHoldingsTableProps {
  holdings: TierHolding[];
  strategy: Strategy;
  cash: CashBreakdown;
}

function calculateHoldingDays(buyDate: string | null): string {
  if (!buyDate) return "-";
  // 거래일(영업일) 기준으로 보유 기간 계산 (주말 제외, 매수일 포함)
  const tradingDays = calculateTradingDays(buyDate, getTodayTradingDate());
  return `${tradingDays}일`;
}

const BADGES: Record<TierRowBadge, React.ReactElement> = {
  reduced: <span className="badge bg-warning text-dark fw-normal">예수금 부족으로 축소</span>,
  sellAllToday: <span className="badge bg-danger fw-normal">오늘 모두 매도</span>,
};

/** 할당 시드 아래 배지. 표와 카드가 같은 문구를 쓴다. 배지가 없는 줄에는 아무것도 그리지 않는다 */
function RowBadge({ row }: { row: TierRow }): React.ReactElement | null {
  return row.badge === null ? null : <div className="mt-1">{BADGES[row.badge]}</div>;
}

/** 매도목표: 지정가, 시드 감액으로 사이클을 끝내는 날의 보유 티어는 MOC */
function SellTarget({ row }: { row: TierRow }): React.ReactElement {
  if (row.sellTarget === "MOC") {
    return <span className="text-danger">MOC</span>;
  }
  return <>{formatCurrency(row.sellTarget)}</>;
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

/**
 * 표의 할당 시드 칸: 금액과 그 아래 배지.
 * 할당 시드가 비어 있는데 배지가 있는 줄(오늘 모두 파는 보유 티어)은 "-" 대신 배지만 보인다.
 */
function AllocatedSeedCell({ row }: { row: TierRow }): React.ReactElement {
  if (row.allocatedSeed === null && row.badge !== null) {
    return BADGES[row.badge];
  }
  return (
    <>
      <AllocatedSeed row={row} />
      <RowBadge row={row} />
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
                        <AllocatedSeedCell row={row} />
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
                        <SellTarget row={row} />
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
                    {hasShares ? (
                      <span>
                        매도목표: <SellTarget row={row} />
                      </span>
                    ) : (
                      <span>
                        할당: <AllocatedSeed row={row} />
                      </span>
                    )}
                    <span>보유: {calculateHoldingDays(holding?.buyDate ?? null)}</span>
                  </div>
                  <RowBadge row={row} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {notice !== null && (
        <div className="card-footer border-secondary">
          <small className="text-secondary text-keep-all">* {notice}</small>
        </div>
      )}
    </div>
  );
}
