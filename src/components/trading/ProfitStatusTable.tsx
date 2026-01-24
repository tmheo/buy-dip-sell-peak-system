"use client";

/**
 * 수익 현황 테이블 컴포넌트 (SPEC-TRADING-002)
 * 월별로 수익 기록을 그룹화하여 표시
 */

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import type { ProfitStatusResponse, MonthlyProfitSummary, ProfitRecord } from "@/types/trading";

interface ProfitStatusTableProps {
  accountId: string;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getProfitColorClass(profit: number): string {
  if (profit > 0) return "text-success";
  if (profit < 0) return "text-danger";
  return "";
}

interface MonthSectionProps {
  summary: MonthlyProfitSummary;
  isExpanded: boolean;
  onToggle: () => void;
}

function MonthSection({ summary, isExpanded, onToggle }: MonthSectionProps): React.ReactElement {
  return (
    <div className="mb-2">
      {/* Month Header (Clickable Toggle) */}
      <div
        className="d-flex align-items-center py-2 px-3 border-bottom border-secondary"
        style={{ cursor: "pointer" }}
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
      >
        <span className="me-2 text-secondary">{isExpanded ? "▼" : "▶"}</span>
        <span className="text-secondary">{summary.yearMonth} 상세 내역</span>
      </div>

      {/* Expanded: Show detail records */}
      {isExpanded && (
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover mb-0 small">
            <thead>
              <tr>
                <th className="text-center">티어</th>
                <th className="text-center">매수일</th>
                <th className="text-end">매수가</th>
                <th className="text-center">매도일</th>
                <th className="text-end">매도가</th>
                <th className="text-end">수량</th>
                <th className="text-end">매수금액</th>
                <th className="text-end">매도금액</th>
                <th className="text-end">수익</th>
                <th className="text-end">수익률</th>
              </tr>
            </thead>
            <tbody>
              {summary.records.map((record: ProfitRecord) => (
                <tr key={record.id}>
                  <td className="text-center">
                    <span className="badge bg-secondary">{record.tier === 7 ? "예비" : record.tier}</span>
                  </td>
                  <td className="text-center">{formatDate(record.buyDate)}</td>
                  <td className="text-end">{formatCurrency(record.buyPrice)}</td>
                  <td className="text-center">{formatDate(record.sellDate)}</td>
                  <td className="text-end">{formatCurrency(record.sellPrice)}</td>
                  <td className="text-end">{record.buyQuantity.toLocaleString()}</td>
                  <td className="text-end">{formatCurrency(record.buyAmount)}</td>
                  <td className="text-end">{formatCurrency(record.sellAmount)}</td>
                  <td className={`text-end fw-bold ${getProfitColorClass(record.profit)}`}>
                    {formatCurrency(record.profit)}
                  </td>
                  <td className={`text-end ${getProfitColorClass(record.profitRate)}`}>
                    {formatPercent(record.profitRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subtotal Row (Always visible) */}
      <div className="table-responsive">
        <table className="table table-dark mb-0 small" style={{ backgroundColor: "#3a5a5a" }}>
          <tbody>
            <tr style={{ backgroundColor: "#3a5a5a" }}>
              <td className="text-center fw-bold text-info">{summary.yearMonth} 소계</td>
              <td colSpan={5}></td>
              <td className="text-end fw-bold">{formatCurrency(summary.totalBuyAmount)}</td>
              <td className="text-end fw-bold">{formatCurrency(summary.totalSellAmount)}</td>
              <td className={`text-end fw-bold ${getProfitColorClass(summary.totalProfit)}`}>
                {formatCurrency(summary.totalProfit)}
              </td>
              <td className={`text-end fw-bold ${getProfitColorClass(summary.averageProfitRate)}`}>
                {formatPercent(summary.averageProfitRate)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProfitStatusTable({
  accountId,
}: ProfitStatusTableProps): React.ReactElement {
  const [profitStatus, setProfitStatus] = useState<ProfitStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const fetchProfitStatus = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/trading/accounts/${accountId}/profits`);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("인증이 필요합니다.");
        }
        if (response.status === 404) {
          throw new Error("계좌를 찾을 수 없습니다.");
        }
        throw new Error("수익 현황을 불러오는데 실패했습니다.");
      }

      const data: ProfitStatusResponse = await response.json();
      setProfitStatus(data);

      // Auto-expand the most recent month (last in array since sorted ascending)
      if (data.months.length > 0) {
        setExpandedMonths(new Set([data.months[data.months.length - 1].yearMonth]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchProfitStatus();
  }, [fetchProfitStatus]);

  function toggleMonth(yearMonth: string): void {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(yearMonth)) {
        next.delete(yearMonth);
      } else {
        next.add(yearMonth);
      }
      return next;
    });
  }

  function expandAll(): void {
    if (profitStatus) {
      setExpandedMonths(new Set(profitStatus.months.map((m) => m.yearMonth)));
    }
  }

  function collapseAll(): void {
    setExpandedMonths(new Set());
  }

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary d-flex justify-content-between align-items-center">
        <h5 className="mb-0 text-light">수익 현황</h5>
        {profitStatus && profitStatus.months.length > 0 && (
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={expandAll}
            >
              모두 펼치기
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={collapseAll}
            >
              모두 접기
            </button>
          </div>
        )}
      </div>
      <div className="card-body">
        {isLoading && (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary" role="status">
              <span className="visually-hidden">로딩 중...</span>
            </div>
            <span className="text-secondary ms-2">수익 현황을 불러오는 중...</span>
          </div>
        )}

        {error && (
          <div className="alert alert-danger mb-0" role="alert">
            {error}
            <button
              type="button"
              className="btn btn-sm btn-outline-danger ms-2"
              onClick={fetchProfitStatus}
            >
              다시 시도
            </button>
          </div>
        )}

        {!isLoading && !error && profitStatus && (
          <>
            {profitStatus.months.length === 0 ? (
              <div className="text-center text-secondary py-4">
                아직 수익 기록이 없습니다.
              </div>
            ) : (
              <>
                {/* Monthly Sections */}
                {profitStatus.months.map((summary) => (
                  <MonthSection
                    key={summary.yearMonth}
                    summary={summary}
                    isExpanded={expandedMonths.has(summary.yearMonth)}
                    onToggle={() => toggleMonth(summary.yearMonth)}
                  />
                ))}

                {/* Grand Total */}
                <div className="card bg-secondary bg-opacity-25 border-secondary mt-4">
                  <div className="card-body py-3">
                    <div className="row text-center">
                      <div className="col">
                        <div className="text-secondary small">총 거래</div>
                        <div className="fw-bold text-light">
                          {profitStatus.grandTotal.totalTrades}건
                        </div>
                      </div>
                      <div className="col">
                        <div className="text-secondary small">총 매수금액</div>
                        <div className="fw-bold text-light">
                          {formatCurrency(profitStatus.grandTotal.totalBuyAmount)}
                        </div>
                      </div>
                      <div className="col">
                        <div className="text-secondary small">총 매도금액</div>
                        <div className="fw-bold text-light">
                          {formatCurrency(profitStatus.grandTotal.totalSellAmount)}
                        </div>
                      </div>
                      <div className="col">
                        <div className="text-secondary small">총 수익</div>
                        <div className={`fw-bold ${getProfitColorClass(profitStatus.grandTotal.totalProfit)}`}>
                          {formatCurrency(profitStatus.grandTotal.totalProfit)}
                        </div>
                      </div>
                      <div className="col">
                        <div className="text-secondary small">평균 수익률</div>
                        <div className={`fw-bold ${getProfitColorClass(profitStatus.grandTotal.averageProfitRate)}`}>
                          {formatPercent(profitStatus.grandTotal.averageProfitRate)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
