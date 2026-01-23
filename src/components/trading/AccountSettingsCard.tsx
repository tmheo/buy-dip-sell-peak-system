"use client";

/**
 * 계좌 설정 카드 컴포넌트
 */

import type React from "react";
import { useState } from "react";
import type { TradingAccountWithHoldings, Ticker, Strategy } from "@/types/trading";

interface AccountSettingsCardProps {
  account: TradingAccountWithHoldings;
  onSave: (data: UpdateAccountData) => Promise<void>;
  isSaving: boolean;
}

export interface UpdateAccountData {
  ticker: Ticker;
  seedCapital: number;
  strategy: Strategy;
  cycleStartDate: string;
}

const TICKER_OPTIONS: Ticker[] = ["SOXL", "TQQQ"];
const STRATEGY_OPTIONS: Strategy[] = ["Pro1", "Pro2", "Pro3"];

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function AccountSettingsCard({
  account,
  onSave,
  isSaving,
}: AccountSettingsCardProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UpdateAccountData>({
    ticker: account.ticker,
    seedCapital: account.seedCapital,
    strategy: account.strategy,
    cycleStartDate: account.cycleStartDate,
  });

  const canEdit = !account.isCycleInProgress;

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  }

  function handleCancel(): void {
    setFormData({
      ticker: account.ticker,
      seedCapital: account.seedCapital,
      strategy: account.strategy,
      cycleStartDate: account.cycleStartDate,
    });
    setIsEditing(false);
  }

  async function handleSave(): Promise<void> {
    try {
      await onSave(formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save account settings:", error);
    }
  }

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary d-flex justify-content-between align-items-center">
        <h5 className="mb-0 text-light">{account.name}</h5>
        {canEdit && !isEditing && (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setIsEditing(true)}
          >
            설정 변경
          </button>
        )}
        {!canEdit && (
          <span className="badge bg-warning text-dark">사이클 진행 중</span>
        )}
      </div>
      <div className="card-body">
        {isEditing ? (
          <div className="row g-3">
            <div className="col-md-6 col-lg-4">
              <label className="form-label text-secondary small">종목(Ticker)</label>
              <select
                className="form-select form-select-sm bg-dark text-light border-secondary"
                name="ticker"
                value={formData.ticker}
                onChange={handleChange}
                disabled={isSaving}
              >
                {TICKER_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6 col-lg-4">
              <label className="form-label text-secondary small">시드($)</label>
              <input
                type="number"
                className="form-control form-control-sm bg-dark text-light border-secondary"
                name="seedCapital"
                value={formData.seedCapital}
                onChange={handleChange}
                min="2000"
                step="1"
                disabled={isSaving}
              />
            </div>
            <div className="col-md-6 col-lg-4">
              <label className="form-label text-secondary small">전략</label>
              <select
                className="form-select form-select-sm bg-dark text-light border-secondary"
                name="strategy"
                value={formData.strategy}
                onChange={handleChange}
                disabled={isSaving}
              >
                {STRATEGY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6 col-lg-4">
              <label className="form-label text-secondary small">사이클 시작일</label>
              <input
                type="date"
                className="form-control form-control-sm bg-dark text-light border-secondary"
                name="cycleStartDate"
                value={formData.cycleStartDate}
                onChange={handleChange}
                disabled={isSaving}
              />
            </div>
            <div className="col-md-6 col-lg-4">
              <label className="form-label text-secondary small">회차(Cycle)</label>
              <div className="form-control form-control-sm bg-secondary bg-opacity-25 text-light border-secondary">
                {account.cycleNumber}
              </div>
            </div>
            <div className="col-12 mt-3">
              <button
                type="button"
                className="btn btn-primary btn-sm me-2"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCancel}
                disabled={isSaving}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="row g-3">
            <div className="col-md-6 col-lg-4">
              <div className="text-secondary small mb-1">종목(Ticker)</div>
              <div className="text-light">
                <span className="badge bg-info">{account.ticker}</span>
              </div>
            </div>
            <div className="col-md-6 col-lg-4">
              <div className="text-secondary small mb-1">시드($)</div>
              <div className="text-light">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                }).format(account.seedCapital)}
              </div>
            </div>
            <div className="col-md-6 col-lg-4">
              <div className="text-secondary small mb-1">전략</div>
              <div className="text-light">
                <span className="badge bg-secondary">{account.strategy}</span>
              </div>
            </div>
            <div className="col-md-6 col-lg-4">
              <div className="text-secondary small mb-1">사이클 시작일</div>
              <div className="text-light">{formatDate(account.cycleStartDate)}</div>
            </div>
            <div className="col-md-6 col-lg-4">
              <div className="text-secondary small mb-1">회차(Cycle)</div>
              <div className="text-light">
                <span className="badge bg-primary">{account.cycleNumber}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
