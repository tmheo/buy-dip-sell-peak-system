"use client";

/**
 * 트레이딩 계좌 목록 테이블 컴포넌트
 */

import type React from "react";
import Link from "next/link";
import type { TradingAccount, TierHolding } from "@/types/trading";

interface AccountWithHoldings extends TradingAccount {
  holdings: TierHolding[];
  totalShares: number;
}

interface AccountListTableProps {
  accounts: AccountWithHoldings[];
  onDeleteClick: (account: AccountWithHoldings) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  const localDate = new Date(Number(year), Number(month) - 1, Number(day));
  return localDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function countHeldTiers(holdings: TierHolding[]): number {
  return holdings.filter((h) => h.shares > 0).length;
}

function getTotalTiers(holdings: TierHolding[]): number {
  return holdings.length;
}

export default function AccountListTable({
  accounts,
  onDeleteClick,
}: AccountListTableProps): React.ReactElement {
  if (accounts.length === 0) {
    return (
      <div className="card bg-dark border-secondary">
        <div className="card-body text-center py-5">
          <p className="text-secondary mb-3">등록된 계좌가 없습니다.</p>
          <Link href="/trading/new" className="btn btn-primary">
            새 계좌 만들기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 모바일 카드 뷰 (768px 이하) */}
      <div className="trading-mobile-card">
        {accounts.map((account) => {
          const heldTiers = countHeldTiers(account.holdings);
          const totalTiers = getTotalTiers(account.holdings);

          return (
            <div key={account.id} className="card bg-dark border-secondary mb-2">
              <div className="card-body py-2">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 className="card-title mb-1">{account.name}</h6>
                    <div>
                      <span className="badge bg-info">{account.ticker}</span>{" "}
                      <span className="badge bg-secondary">{account.strategy}</span>{" "}
                      <span className="badge bg-primary">{account.cycleNumber}회차</span>
                    </div>
                  </div>
                  <div className="d-flex gap-1">
                    <Link
                      href={`/trading/${account.id}`}
                      className="btn btn-sm btn-outline-primary"
                    >
                      자세히
                    </Link>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => onDeleteClick(account)}
                      data-bs-toggle="modal"
                      data-bs-target="#deleteAccountModal"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div className="d-flex justify-content-between mt-2 small text-secondary">
                  <span>시드: {formatCurrency(account.seedCapital)}</span>
                  <span>
                    보유:{" "}
                    <span className={heldTiers > 0 ? "text-success" : "text-secondary"}>
                      {heldTiers}/{totalTiers}
                    </span>
                  </span>
                  <span>시작: {formatDate(account.cycleStartDate)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 데스크톱 테이블 뷰 (769px 이상) */}
      <div className="trading-desktop-table">
        <div className="card bg-dark border-secondary">
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover mb-0">
                <thead>
                  <tr>
                    <th className="text-center">#</th>
                    <th>계좌 이름</th>
                    <th className="text-center">종목</th>
                    <th className="text-end">시드</th>
                    <th className="text-center">전략</th>
                    <th className="text-center">보유</th>
                    <th className="text-center">시작일</th>
                    <th className="text-center">회차</th>
                    <th className="text-center">작업</th>
                    <th className="text-center">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account, index) => {
                    const heldTiers = countHeldTiers(account.holdings);
                    const totalTiers = getTotalTiers(account.holdings);

                    return (
                      <tr key={account.id}>
                        <td className="text-center">{index + 1}</td>
                        <td>
                          <span className="text-light">{account.name}</span>
                        </td>
                        <td className="text-center">
                          <span className="badge bg-info">{account.ticker}</span>
                        </td>
                        <td className="text-end">{formatCurrency(account.seedCapital)}</td>
                        <td className="text-center">
                          <span className="badge bg-secondary">{account.strategy}</span>
                        </td>
                        <td className="text-center">
                          <span className={heldTiers > 0 ? "text-success" : "text-secondary"}>
                            {heldTiers}/{totalTiers}
                          </span>
                        </td>
                        <td className="text-center">{formatDate(account.cycleStartDate)}</td>
                        <td className="text-center">
                          <span className="badge bg-primary">{account.cycleNumber}</span>
                        </td>
                        <td className="text-center">
                          <Link
                            href={`/trading/${account.id}`}
                            className="btn btn-sm btn-outline-primary"
                          >
                            자세히
                          </Link>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => onDeleteClick(account)}
                            data-bs-toggle="modal"
                            data-bs-target="#deleteAccountModal"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
