"use client";

/**
 * 계좌 설정 카드 컴포넌트
 *
 * 종목은 계좌를 만들 때 정하므로 편집 모드에서도 읽기 전용이고, 운용 시작일은 첫 일일
 * 마감 뒤에 읽기 전용이 된다 (#112).
 *
 * 시드는 다른 칸과 따로 보낸다 - 바꾼 시드는 다음 거래일 주문표부터 쓰이므로(ADR-0005),
 * 적용 전 변경이 있으면 시드 칸에 그 변경과 적용일, 다시 바꾸기·되돌리기를 보인다.
 *
 * 새 시드가 쓰이기 시작한 뒤의 안내도 이 카드가 맡는다 (#118, ADR-0006).
 * - 새 시드가 처음 쓰이는 날(사이클이 이어질 때): 감액이면 이제 출금, 증액이면 아직이면 입금
 * - 시드 감액으로 사이클을 끝내는 날: 머리에 "사이클 종료 매도일" 배지 (안내 문장은 주문표 위 한 곳)
 * - 시드 감액으로 끝난 다음 사이클 동안: 증권사 잔고를 새 시드에 맞추라는 안내와 시드 감액 정산의
 *   계산 과정
 * 안내 문장과 계산 과정의 줄은 applied-seed-notices.ts가 만든다.
 */

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { MIN_SEED_CAPITAL, MIN_SEED_CAPITAL_MESSAGE } from "@/lib/validations/seed-capital-bounds";
import type { SeedCutSettlement } from "@/trading";
import type { TradingAccountDetail, Strategy } from "@/types/trading";
import {
  canEditTradingStartDate,
  pendingSeedChangeText,
  seedChangeToSend,
  seedInputValue,
  strategyChangeWarning,
} from "./account-settings";
import {
  appliedSeedNotice,
  seedCutSettlementLines,
  seedCutSettlementTitle,
  type SettlementLine,
} from "./applied-seed-notices";
import { formatLongDate, formatSeedAmount } from "./format";

interface AccountSettingsCardProps {
  account: TradingAccountDetail;
  /** 오늘이 시드 감액으로 사이클을 끝내는 날인지 (cashBreakdown.endsCycleBySeedCut) */
  endsCycleBySeedCut: boolean;
  /** 앞 사이클이 시드 감액으로 끝났으면 그 시드 감액 정산 (계좌 상세 응답의 seedCutSettlement) */
  seedCutSettlement: SeedCutSettlement | null;
  /** 바꾼 것만 보낸다. 저장에 성공하면 true */
  onSave: (changes: AccountSettingsChanges) => Promise<boolean>;
  isSaving: boolean;
}

// 종목은 바꿀 수 없으므로 보내지 않는다. 운용 시작일은 바꾸지 않았어도 함께 보낸다 -
// 지금 값과 같은 날짜는 첫 일일 마감 뒤에도 받는다.
export interface AccountSettingsUpdate {
  strategy: Strategy;
  cycleStartDate: string;
}

/**
 * 저장할 변경. settings는 전략·운용 시작일(PUT /api/trading/accounts/[id]),
 * seedCapital은 새 시드(PUT /api/trading/accounts/[id]/seed)이고, 바꾸지 않았으면 null이다.
 */
export interface AccountSettingsChanges {
  settings: AccountSettingsUpdate | null;
  seedCapital: number | null;
}

interface SettingsForm extends AccountSettingsUpdate {
  seedCapital: number;
}

const STRATEGY_OPTIONS: Strategy[] = ["Pro1", "Pro2", "Pro3"];

/** 편집을 시작하거나 취소할 때의 입력값 - 저장된 계좌 설정, 시드는 바꿀 시드 */
function savedSettings(account: TradingAccountDetail): SettingsForm {
  return {
    seedCapital: seedInputValue(account.seed),
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

const SETTLEMENT_TONE_CLASS: Record<SettlementLine["tone"], string> = {
  default: "text-light",
  profit: "text-success",
  loss: "text-danger",
  total: "text-light fw-bold",
};

/** 시드 감액 정산의 계산 과정. 마지막 줄(출금·입금할 금액) 위에 구분선을 둔다 */
function SettlementBreakdown({
  settlement,
}: {
  settlement: SeedCutSettlement;
}): React.ReactElement {
  const lines = seedCutSettlementLines(settlement);
  return (
    <div className="seed-settlement-breakdown mt-2">
      {lines.map((line, index) => (
        <div
          key={line.label}
          className={`d-flex justify-content-between gap-3 ${
            index === lines.length - 1 ? "border-top border-secondary mt-1 pt-1" : ""
          }`}
        >
          <span className="text-secondary text-keep-all">{line.label}</span>
          <span className={`text-nowrap ${SETTLEMENT_TONE_CLASS[line.tone]}`}>{line.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AccountSettingsCard({
  account,
  endsCycleBySeedCut,
  seedCutSettlement,
  onSave,
  isSaving,
}: AccountSettingsCardProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formData, setFormData] = useState<SettingsForm>(() => savedSettings(account));
  // "다시 바꾸기"로 편집을 열면 시드 칸에 바로 입력할 수 있게 한다
  const [focusSeed, setFocusSeed] = useState(false);
  const seedInputRef = useRef<HTMLInputElement>(null);

  const canEdit = !account.isCycleInProgress;
  const startDateEditable = canEditTradingStartDate(account);
  const strategyWarning = strategyChangeWarning(account.strategy, formData.strategy);
  const pendingSeedText = pendingSeedChangeText(account.seed);
  const appliedNotice = appliedSeedNotice(account.seed, endsCycleBySeedCut);

  useEffect(() => {
    if (isEditing && focusSeed) {
      seedInputRef.current?.focus();
      seedInputRef.current?.select();
      setFocusSeed(false);
    }
  }, [isEditing, focusSeed]);

  function startEditing(options: { focusSeed: boolean }): void {
    setFormData(savedSettings(account));
    setSaveError(null);
    setFocusSeed(options.focusSeed);
    setIsEditing(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  }

  function handleCancel(): void {
    setFormData(savedSettings(account));
    setSaveError(null);
    setIsEditing(false);
  }

  async function handleSave(): Promise<void> {
    if (!formData.seedCapital || formData.seedCapital < MIN_SEED_CAPITAL) {
      setSaveError(`${MIN_SEED_CAPITAL_MESSAGE}.`);
      return;
    }
    setSaveError(null);

    const settingsChanged =
      formData.strategy !== account.strategy || formData.cycleStartDate !== account.cycleStartDate;
    const changes: AccountSettingsChanges = {
      settings: settingsChanged
        ? { strategy: formData.strategy, cycleStartDate: formData.cycleStartDate }
        : null,
      seedCapital: seedChangeToSend(account.seed, formData.seedCapital),
    };
    if (changes.settings === null && changes.seedCapital === null) {
      setIsEditing(false);
      return;
    }

    if (await onSave(changes)) {
      setIsEditing(false);
    }
  }

  /** 적용 전 변경을 지운다 - 지금 시드를 보내면 서버가 그 변경을 지운다 */
  async function handleRevertSeed(): Promise<void> {
    await onSave({ settings: null, seedCapital: account.seed.current });
  }

  return (
    <div className="card bg-dark border-secondary mb-4">
      {/* 계좌 이름이 길면 이름만 줄바꿈한다 - 버튼과 배지 글자가 꺾이지 않게 한다 */}
      <div className="card-header border-secondary d-flex justify-content-between align-items-center gap-2">
        <h5 className="mb-0 text-light text-keep-all">{account.name}</h5>
        {canEdit && !isEditing && (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary text-nowrap flex-shrink-0"
            onClick={() => startEditing({ focusSeed: false })}
          >
            설정 변경
          </button>
        )}
        {endsCycleBySeedCut ? (
          <span className="badge bg-danger flex-shrink-0">사이클 종료 매도일</span>
        ) : (
          !canEdit && (
            <span className="badge bg-warning text-dark flex-shrink-0">사이클 진행 중</span>
          )
        )}
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
                ref={seedInputRef}
                id="settings-seed"
                type="number"
                className="form-control form-control-sm bg-dark text-light border-secondary"
                name="seedCapital"
                value={formData.seedCapital || ""}
                onChange={handleChange}
                min={MIN_SEED_CAPITAL}
                step="1"
                disabled={isSaving}
                aria-describedby="settings-seed-hint"
              />
              <div id="settings-seed-hint" className="form-text text-secondary text-keep-all">
                {account.seed.pending &&
                  `지금 시드는 ${formatSeedAmount(account.seed.current)}입니다. `}
                바꾼 시드는 다음 거래일 주문표부터 쓰입니다.
              </div>
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
              <div className="text-light">{formatSeedAmount(account.seed.current)}</div>
              {pendingSeedText && (
                <div className="mt-1">
                  <div className="small text-warning text-keep-all">{pendingSeedText}</div>
                  {canEdit && (
                    <div className="d-flex gap-2 mt-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => startEditing({ focusSeed: true })}
                        disabled={isSaving}
                      >
                        다시 바꾸기
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={handleRevertSeed}
                        disabled={isSaving}
                      >
                        되돌리기
                      </button>
                    </div>
                  )}
                </div>
              )}
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
        {appliedNotice && (
          <div className="alert alert-info py-2 mb-0 mt-3 small text-keep-all" role="status">
            {appliedNotice}
          </div>
        )}
        {seedCutSettlement && (
          <div className="border border-warning rounded p-3 mt-3 small" role="status">
            <div className="fw-bold text-warning text-keep-all">
              {seedCutSettlementTitle(seedCutSettlement.endedCycleNumber)}
            </div>
            <SettlementBreakdown settlement={seedCutSettlement} />
          </div>
        )}
      </div>
    </div>
  );
}
