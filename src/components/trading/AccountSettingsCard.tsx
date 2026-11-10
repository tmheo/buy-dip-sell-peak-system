"use client";

/**
 * 계좌 설정 카드 컴포넌트
 *
 * 종목은 계좌를 만들 때 정하므로 편집 모드에서도 읽기 전용이고, 운용 시작일은 첫 일일
 * 마감 뒤에 읽기 전용이 된다 (#112).
 */

import type React from "react";
import { useState } from "react";
import type { TradingAccountWithHoldings, Strategy } from "@/types/trading";
import { canEditTradingStartDate, strategyChangeWarning } from "./account-settings";
import { formatLongDate } from "./format";

interface AccountSettingsCardProps {
  account: TradingAccountWithHoldings;
  onSave: (data: UpdateAccountData) => Promise<void>;
  isSaving: boolean;
}

// 종목은 바꿀 수 없으므로 보내지 않는다. 운용 시작일은 바꾸지 않았어도 함께 보낸다 -
// 지금 값과 같은 날짜는 첫 일일 마감 뒤에도 받는다.
export interface UpdateAccountData {
  seedCapital: number;
  strategy: Strategy;
  cycleStartDate: string;
}

const STRATEGY_OPTIONS: Strategy[] = ["Pro1", "Pro2", "Pro3"];

/** 편집을 시작하거나 취소할 때의 입력값 - 저장된 계좌 설정 그대로 */
function savedSettings(account: TradingAccountWithHoldings): UpdateAccountData {
  return {
    seedCapital: account.seedCapital,
    strategy: account.strategy,
    cycleStartDate: account.cycleStartDate,
  };
}

/** 편집 모드에서 바꿀 수 없는 칸 - 다른 칸과 같은 모양의 읽기 전용 입력 */
function ReadOnlyField({
  id,
  label,
  value,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
}): React.ReactElement {
  const hintId = `${id}-hint`;
  return (
    <>
      <label htmlFor={id} className="form-label text-secondary small">
        {label}
      </label>
      <input
        id={id}
        type="text"
        readOnly
        className="form-control form-control-sm bg-secondary bg-opacity-25 text-light border-secondary"
        value={value}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <div id={hintId} className="form-text text-secondary text-keep-all">
          {hint}
        </div>
      )}
    </>
  );
}

export default function AccountSettingsCard({
  account,
  onSave,
  isSaving,
}: AccountSettingsCardProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formData, setFormData] = useState<UpdateAccountData>(() => savedSettings(account));

  const canEdit = !account.isCycleInProgress;
  const startDateEditable = canEditTradingStartDate(account);
  const strategyWarning = strategyChangeWarning(account.strategy, formData.strategy);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  }

  function handleCancel(): void {
    setFormData(savedSettings(account));
    setIsEditing(false);
  }

  async function handleSave(): Promise<void> {
    if (!formData.seedCapital || formData.seedCapital < 2000) {
      setSaveError("시드 자금은 최소 $2,000 이상이어야 합니다.");
      return;
    }
    setSaveError(null);
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
        {!canEdit && <span className="badge bg-warning text-dark">사이클 진행 중</span>}
      </div>
      <div className="card-body">
        {isEditing ? (
          <div className="row g-3">
            <div className="col-md-6 col-lg-4">
              <ReadOnlyField
                id="settings-ticker"
                label="종목(Ticker)"
                value={account.ticker}
                hint="계좌를 만들 때 정하며 바꿀 수 없습니다."
              />
            </div>
            <div className="col-md-6 col-lg-4">
              <label htmlFor="settings-seed" className="form-label text-secondary small">
                시드($)
              </label>
              <input
                id="settings-seed"
                type="number"
                className="form-control form-control-sm bg-dark text-light border-secondary"
                name="seedCapital"
                value={formData.seedCapital || ""}
                onChange={handleChange}
                min="2000"
                step="1"
                disabled={isSaving}
              />
            </div>
            <div className="col-md-6 col-lg-4">
              <label htmlFor="settings-strategy" className="form-label text-secondary small">
                전략
              </label>
              <select
                id="settings-strategy"
                className="form-select form-select-sm bg-dark text-light border-secondary"
                name="strategy"
                value={formData.strategy}
                onChange={handleChange}
                disabled={isSaving}
                aria-describedby={strategyWarning ? "settings-strategy-warning" : undefined}
              >
                {STRATEGY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {strategyWarning && (
                <div
                  id="settings-strategy-warning"
                  className="form-text text-warning text-keep-all"
                  role="alert"
                >
                  {strategyWarning}
                </div>
              )}
            </div>
            <div className="col-md-6 col-lg-4">
              {startDateEditable ? (
                <>
                  <label htmlFor="settings-start-date" className="form-label text-secondary small">
                    운용 시작일
                  </label>
                  <input
                    id="settings-start-date"
                    type="date"
                    className="form-control form-control-sm bg-dark text-light border-secondary"
                    name="cycleStartDate"
                    value={formData.cycleStartDate}
                    onChange={handleChange}
                    disabled={isSaving}
                  />
                </>
              ) : (
                <ReadOnlyField
                  id="settings-start-date"
                  label="운용 시작일"
                  value={formatLongDate(account.cycleStartDate)}
                  hint="첫 일일 마감이 끝나 바꿀 수 없습니다."
                />
              )}
            </div>
            <div className="col-md-6 col-lg-4">
              <ReadOnlyField
                id="settings-cycle-number"
                label="회차(Cycle)"
                value={String(account.cycleNumber)}
              />
            </div>
            {saveError && (
              <div className="col-12">
                <div className="alert alert-danger py-1 mb-0 small">{saveError}</div>
              </div>
            )}
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
              <div className="text-secondary small mb-1">운용 시작일</div>
              <div className="text-light">{formatLongDate(account.cycleStartDate)}</div>
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
