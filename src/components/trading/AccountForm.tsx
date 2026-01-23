"use client";

/**
 * 트레이딩 계좌 생성/수정 폼 컴포넌트
 */

import type React from "react";
import { useState } from "react";
import type { Ticker, Strategy, TradingAccount } from "@/types/trading";

interface AccountFormProps {
  initialData?: Partial<TradingAccount>;
  onSubmit: (data: AccountFormData) => Promise<void>;
  isSubmitting: boolean;
  mode: "create" | "edit";
}

export interface AccountFormData {
  name: string;
  ticker: Ticker;
  seedCapital: number;
  strategy: Strategy;
  cycleStartDate: string;
}

const TICKER_OPTIONS: { value: Ticker; label: string }[] = [
  { value: "SOXL", label: "SOXL (Direxion Daily Semiconductor Bull 3X)" },
  { value: "TQQQ", label: "TQQQ (ProShares UltraPro QQQ)" },
];

const STRATEGY_OPTIONS: { value: Strategy; label: string }[] = [
  { value: "Pro1", label: "Pro1" },
  { value: "Pro2", label: "Pro2" },
  { value: "Pro3", label: "Pro3" },
];

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export default function AccountForm({
  initialData,
  onSubmit,
  isSubmitting,
  mode,
}: AccountFormProps): React.ReactElement {
  const [formData, setFormData] = useState<AccountFormData>({
    name: initialData?.name ?? "",
    ticker: initialData?.ticker ?? "SOXL",
    seedCapital: initialData?.seedCapital ?? 10000,
    strategy: initialData?.strategy ?? "Pro1",
    cycleStartDate: initialData?.cycleStartDate ?? getToday(),
  });

  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormData, string>>>({});

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
    // Clear error when field is changed
    if (errors[name as keyof AccountFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof AccountFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = "계좌 이름을 입력하세요.";
    }

    if (formData.seedCapital < 100) {
      newErrors.seedCapital = "시드 자금은 최소 $100 이상이어야 합니다.";
    }

    if (!formData.cycleStartDate) {
      newErrors.cycleStartDate = "시작일을 선택하세요.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    await onSubmit(formData);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-3">
        <label htmlFor="name" className="form-label text-light">
          계좌 이름 <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          className={`form-control bg-dark text-light border-secondary ${
            errors.name ? "is-invalid" : ""
          }`}
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="예: 메인 계좌, 테스트 계좌"
          disabled={isSubmitting}
        />
        {errors.name && <div className="invalid-feedback">{errors.name}</div>}
      </div>

      <div className="mb-3">
        <label htmlFor="ticker" className="form-label text-light">
          종목 <span className="text-danger">*</span>
        </label>
        <select
          className="form-select bg-dark text-light border-secondary"
          id="ticker"
          name="ticker"
          value={formData.ticker}
          onChange={handleChange}
          disabled={isSubmitting}
        >
          {TICKER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label htmlFor="seedCapital" className="form-label text-light">
          시드 자금($) <span className="text-danger">*</span>
        </label>
        <div className="input-group">
          <span className="input-group-text bg-secondary border-secondary text-light">$</span>
          <input
            type="number"
            className={`form-control bg-dark text-light border-secondary ${
              errors.seedCapital ? "is-invalid" : ""
            }`}
            id="seedCapital"
            name="seedCapital"
            value={formData.seedCapital}
            onChange={handleChange}
            min="100"
            step="100"
            disabled={isSubmitting}
          />
          {errors.seedCapital && (
            <div className="invalid-feedback">{errors.seedCapital}</div>
          )}
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor="cycleStartDate" className="form-label text-light">
          시작일 <span className="text-danger">*</span>
        </label>
        <input
          type="date"
          className={`form-control bg-dark text-light border-secondary ${
            errors.cycleStartDate ? "is-invalid" : ""
          }`}
          id="cycleStartDate"
          name="cycleStartDate"
          value={formData.cycleStartDate}
          onChange={handleChange}
          disabled={isSubmitting}
        />
        {errors.cycleStartDate && (
          <div className="invalid-feedback">{errors.cycleStartDate}</div>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="strategy" className="form-label text-light">
          전략 <span className="text-danger">*</span>
        </label>
        <select
          className="form-select bg-dark text-light border-secondary"
          id="strategy"
          name="strategy"
          value={formData.strategy}
          onChange={handleChange}
          disabled={isSubmitting}
        >
          {STRATEGY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="alert alert-secondary" role="alert">
        <small>* 설정은 계좌 생성 후에도 변경할 수 있습니다.</small>
      </div>

      <div className="d-grid gap-2">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? mode === "create"
              ? "생성 중..."
              : "저장 중..."
            : mode === "create"
            ? "계좌 생성"
            : "저장"}
        </button>
      </div>
    </form>
  );
}
