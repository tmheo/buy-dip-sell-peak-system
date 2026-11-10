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
 * 사이클 중에는 "시드 변경"으로 시드 칸만 열리고 전략·운용 시작일에는 "사이클 중 잠김"을 붙인다
 * (ADR-0004, #119). 입력은 새 시드이고, 입금·출금할 금액은 입력 아래 안내가 알려 준다. 감액이면
 * 감액 경계 막대(이어감, 오늘 매수에 달림, 사이클 끝)에 입력한 감액의 위치를 보인다. 사이클을 끝낼
 * 수 있는 감액은 확인 체크를 해야 저장된다. 서버가 지금의 분류로 다시 물으면(409) 그 응답의 분류와
 * 감액 경계로 막대와 안내를 다시 그리고 다시 확인받는다. 안내·확인·보낼 변경은 seed-change-form.ts가
 * 정하고, 이 카드는 그리기만 한다. 저장한 변경의 안내는 적용될 때까지 카드 안에 남는다.
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
import type { SeedCutLimits } from "@/strategy";
import type { SeedCutSettlement } from "@/trading";
import type { TradingAccountDetail, Strategy } from "@/types/trading";
import {
  canEditTradingStartDate,
  pendingSeedChangeText,
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
import {
  pendingSeedChangeNotice,
  seedChangeForm,
  type CycleEndConfirmation,
  type SeedChangeRecheck,
  type SeedChangeRequest,
} from "./seed-change-form";
import {
  cutZoneBar,
  cycleEndConfirmation,
  seedChangeColor,
  type SeedChangeNotice,
} from "./seed-change-notices";

interface AccountSettingsCardProps {
  account: TradingAccountDetail;
  /** 오늘이 시드 감액으로 사이클을 끝내는 날인지 (cashBreakdown.endsCycleBySeedCut) */
  endsCycleBySeedCut: boolean;
  /** 앞 사이클이 시드 감액으로 끝났으면 그 시드 감액 정산 (계좌 상세 응답의 seedCutSettlement) */
  seedCutSettlement: SeedCutSettlement | null;
  /** 사이클 중 오늘 시드를 줄일 때의 감액 경계 (계좌 상세 응답의 seedCutLimits). 사이클 사이에는 null */
  seedCutLimits: SeedCutLimits | null;
  /** 바꾼 것만 보낸다 */
  onSave: (changes: AccountSettingsChanges) => Promise<AccountSettingsSaveResult>;
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
 * seed는 새 시드와 사용자가 확인한 분류(PUT /api/trading/accounts/[id]/seed)이고, 바꾸지 않았으면 null이다.
 */
export interface AccountSettingsChanges {
  settings: AccountSettingsUpdate | null;
  seed: SeedChangeRequest | null;
}

/**
 * 저장 결과. needsConfirmation은 서버가 지금의 감액 경계로 이 감액이 사용자가 확인한 것보다 더
 * 사이클을 끝낼 수 있다며 다시 물은 경우다(409) - 그 응답의 분류와 경계로 다시 그리고 다시 확인받는다.
 */
export type AccountSettingsSaveResult =
  | { status: "saved" }
  | { status: "failed" }
  | { status: "needsConfirmation"; recheck: SeedChangeRecheck };

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
  lockedInCycle = false,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  /** 사이클 중이라 잠긴 칸이면 이름 옆에 "사이클 중 잠김"을 붙인다 */
  lockedInCycle?: boolean;
}): React.ReactElement {
  const hintId = `${id}-hint`;
  return (
    <>
      <label htmlFor={id} className="form-label text-secondary small">
        {label}
        {lockedInCycle && <LockedInCycleTag />}
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

/** 사이클 중에 바꿀 수 없는 칸의 표시 */
function LockedInCycleTag(): React.ReactElement {
  return (
    <span className="badge border border-secondary text-secondary fw-normal ms-2 locked-in-cycle-tag">
      사이클 중 잠김
    </span>
  );
}

/** 감액 경계 막대 - 줄일 수 있는 금액 전체에서 시드 변경 분류마다의 칸과 입력한 감액의 위치 */
function CutZoneBar({
  currentSeed,
  newSeed,
  limits,
}: {
  currentSeed: number;
  newSeed: number;
  limits: SeedCutLimits;
}): React.ReactElement {
  const { zones, markerPercent } = cutZoneBar(currentSeed, newSeed, limits);
  const cut = formatSeedAmount(currentSeed - newSeed);
  return (
    <div className="mb-3">
      <div
        className="cut-zone-bar position-relative"
        role="img"
        aria-label={`감액 ${cut}의 위치: ${zones.map((zone) => zone.label).join(", ")}`}
      >
        <div className="d-flex h-100 rounded overflow-hidden">
          {zones.map((zone) => (
            <div
              key={zone.kind}
              className={`bg-${seedChangeColor(zone.kind)}`}
              style={{ width: `${zone.percent}%` }}
            />
          ))}
        </div>
        <div className="cut-zone-marker" style={{ left: `${markerPercent}%` }} />
      </div>
      <div className="d-flex flex-wrap column-gap-3 row-gap-1 small text-secondary mt-2">
        {zones.map((zone) => (
          <span key={zone.kind} className="text-nowrap">
            <span className={`text-${seedChangeColor(zone.kind)}`} aria-hidden="true">
              ■
            </span>{" "}
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 시드 변경 안내의 제목과 문장 */
function NoticeLines({
  notice,
  titleClassName,
}: {
  notice: SeedChangeNotice;
  titleClassName: string;
}): React.ReactElement {
  return (
    <>
      <div className={`fw-bold mb-1 text-keep-all ${titleClassName}`}>{notice.title}</div>
      {notice.lines.map((line) => (
        <div key={line} className="mb-1 text-keep-all">
          {line}
        </div>
      ))}
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

/**
 * 계좌 설정 카드. 읽기 모드에서는 설정과 새 시드가 쓰인 뒤의 안내를, 편집 모드에서는 입력 칸을 보인다.
 *
 * @param endsCycleBySeedCut - 오늘이 시드 감액으로 사이클을 끝내는 날인지 (cashBreakdown)
 * @param seedCutSettlement - 앞 사이클의 시드 감액 정산. 앞 사이클이 시드 감액으로 끝나지 않았으면 null
 * @param seedCutLimits - 사이클 중 감액 경계. 사이클 사이에는 null
 */
export default function AccountSettingsCard({
  account,
  endsCycleBySeedCut,
  seedCutSettlement,
  seedCutLimits,
  onSave,
  isSaving,
}: AccountSettingsCardProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formData, setFormData] = useState<SettingsForm>(() => savedSettings(account));
  // "다시 바꾸기"나 사이클 중 "시드 변경"으로 편집을 열면 시드 칸에 바로 입력할 수 있게 한다
  const [focusSeed, setFocusSeed] = useState(false);
  // 사용자가 한 확인 - 확인한 분류·새 시드·감액 경계 중 하나라도 바뀌면 풀린다(seedChangeForm)
  const [confirmation, setConfirmation] = useState<CycleEndConfirmation | null>(null);
  // 서버가 지금의 분류로 다시 물었을 때(409) 그 응답. 편집을 마치거나 저장에 실패하면 지운다
  const [recheck, setRecheck] = useState<SeedChangeRecheck | null>(null);
  const seedInputRef = useRef<HTMLInputElement>(null);

  const inCycle = account.isCycleInProgress;
  const startDateEditable = !inCycle && canEditTradingStartDate(account);
  const strategyWarning = strategyChangeWarning(account.strategy, formData.strategy);
  const pendingSeedText = pendingSeedChangeText(account.seed);
  const appliedNotice = appliedSeedNotice(account.seed, endsCycleBySeedCut);
  const currentSeed = account.seed.current;
  const enteredSeed = formData.seedCapital;
  const seedForm = seedChangeForm({
    seed: account.seed,
    enteredSeed,
    seedCutLimits,
    recheck,
    confirmation,
  });
  const { notice: enteredNotice, confirmationKind } = seedForm;
  const pendingNotice = pendingSeedChangeNotice(account.seed, seedCutLimits);

  useEffect(() => {
    if (isEditing && focusSeed) {
      seedInputRef.current?.focus();
      seedInputRef.current?.select();
      setFocusSeed(false);
    }
  }, [isEditing, focusSeed]);

  function resetEditState(): void {
    setFormData(savedSettings(account));
    setSaveError(null);
    setConfirmation(null);
    setRecheck(null);
  }

  function startEditing(options: { focusSeed: boolean }): void {
    resetEditState();
    setFocusSeed(options.focusSeed);
    setIsEditing(true);
  }

  function stopEditing(): void {
    resetEditState();
    setIsEditing(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  }

  async function handleSave(): Promise<void> {
    if (!enteredSeed || enteredSeed < MIN_SEED_CAPITAL) {
      setSaveError(`${MIN_SEED_CAPITAL_MESSAGE}.`);
      return;
    }
    if (!seedForm.canSave) return;
    setSaveError(null);

    // 사이클 중에는 전략·운용 시작일이 잠겨 있다
    const settingsChanged =
      !inCycle &&
      (formData.strategy !== account.strategy ||
        formData.cycleStartDate !== account.cycleStartDate);
    const changes: AccountSettingsChanges = {
      settings: settingsChanged
        ? { strategy: formData.strategy, cycleStartDate: formData.cycleStartDate }
        : null,
      seed: seedForm.request,
    };
    if (changes.settings === null && changes.seed === null) {
      stopEditing();
      return;
    }

    const result = await onSave(changes);
    if (result.status === "saved") {
      stopEditing();
    } else if (result.status === "needsConfirmation") {
      setRecheck(result.recheck);
      setConfirmation(null);
    } else {
      // 화면은 다시 읽은 감액 경계로 그린다 - 예전 409 응답의 경계를 붙들지 않는다
      setRecheck(null);
    }
  }

  /** 적용 전 변경을 지운다 - 지금 시드를 보내면 서버가 그 변경을 지운다 */
  async function handleRevertSeed(): Promise<void> {
    await onSave({ settings: null, seed: { seedCapital: currentSeed } });
  }

  const seedHint = seedForm.hint;
  const seedDescribedBy =
    [seedHint && "settings-seed-hint", inCycle && "settings-seed-change"]
      .filter(Boolean)
      .join(" ") || undefined;
  // 사이클 중 시드 변경의 안내 칸은 휴대폰 너비에서는 시드 칸 바로 아래, 넓은 화면에서는 칸들 아래
  // 한 줄로 놓인다. 그 뒤의 오류와 버튼도 넓은 화면에서 안내 칸 아래로 보낸다
  const lastOnWide = inCycle ? "order-md-last" : "";

  return (
    <div className="card bg-dark border-secondary mb-4">
      {/* 계좌 이름이 길면 이름만 줄바꿈한다 - 버튼과 배지 글자가 꺾이지 않게 한다 */}
      <div className="card-header border-secondary d-flex justify-content-between align-items-center gap-2">
        <h5 className="mb-0 text-light text-keep-all">{account.name}</h5>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {endsCycleBySeedCut ? (
            <span className="badge bg-danger">사이클 종료 매도일</span>
          ) : (
            inCycle && <span className="badge bg-warning text-dark">사이클 진행 중</span>
          )}
          {/* 사이클 중 적용 전 변경이 있으면 시드 칸의 "다시 바꾸기"가 같은 일을 한다 */}
          {!isEditing && !(inCycle && account.seed.pending) && (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary text-nowrap"
              onClick={() => startEditing({ focusSeed: inCycle })}
              disabled={isSaving}
            >
              {inCycle ? "시드 변경" : "설정 변경"}
            </button>
          )}
        </div>
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
                inputMode="numeric"
                className="form-control form-control-sm bg-dark text-light border-secondary"
                name="seedCapital"
                value={formData.seedCapital || ""}
                onChange={handleChange}
                min={MIN_SEED_CAPITAL}
                step="1"
                disabled={isSaving}
                aria-describedby={seedDescribedBy}
              />
              {seedHint && (
                <div id="settings-seed-hint" className="form-text text-secondary text-keep-all">
                  {seedHint}
                </div>
              )}
            </div>
            {inCycle && (
              <div className={`col-12 ${lastOnWide}`}>
                <div
                  id="settings-seed-change"
                  className="border border-secondary rounded p-3 small text-light"
                  aria-live="polite"
                >
                  {recheck && (
                    <div className="alert alert-warning py-2 mb-3 text-keep-all" role="alert">
                      화면을 연 뒤 예수금이나 오늘 매수가 바뀌어 감액 경계가 달라졌습니다. 바뀐
                      안내를 확인하고 다시 저장하세요.
                    </div>
                  )}
                  {seedForm.limits && seedForm.showsCutZoneBar && (
                    <CutZoneBar
                      currentSeed={currentSeed}
                      newSeed={enteredSeed}
                      limits={seedForm.limits}
                    />
                  )}
                  {enteredNotice && (
                    <NoticeLines
                      notice={enteredNotice}
                      titleClassName={`text-${seedChangeColor(enteredNotice.kind)}`}
                    />
                  )}
                  {seedForm.revertNote && (
                    <div className="mb-1 text-keep-all">{seedForm.revertNote}</div>
                  )}
                  {confirmationKind && (
                    <div className="form-check mt-2 mb-1">
                      <input
                        id="settings-seed-confirm"
                        type="checkbox"
                        className="form-check-input"
                        checked={seedForm.confirmed}
                        onChange={(e) =>
                          setConfirmation(e.target.checked ? seedForm.confirmationTarget : null)
                        }
                        disabled={isSaving}
                      />
                      <label
                        htmlFor="settings-seed-confirm"
                        className="form-check-label text-keep-all"
                      >
                        {cycleEndConfirmation(confirmationKind, seedForm.effectiveDate)}
                      </label>
                    </div>
                  )}
                  <div
                    className={`text-secondary text-keep-all ${
                      enteredNotice || seedForm.revertNote ? "mt-2" : ""
                    }`}
                  >
                    사이클 중에는 시드만 바꿀 수 있습니다. 전략은 사이클이 끝나 보유 티어가 없을 때
                    바꿀 수 있습니다.
                  </div>
                </div>
              </div>
            )}
            <div className="col-md-6 col-lg-4">
              {inCycle ? (
                <ReadOnlyField
                  id="settings-strategy"
                  label="전략"
                  value={account.strategy}
                  lockedInCycle
                />
              ) : (
                <>
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
                </>
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
                  hint={inCycle ? undefined : "첫 일일 마감이 끝나 바꿀 수 없습니다."}
                  lockedInCycle={inCycle}
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
              <div className={`col-12 ${lastOnWide}`}>
                <div className="alert alert-danger py-1 mb-0 small">{saveError}</div>
              </div>
            )}
            <div className={`col-12 mt-3 ${lastOnWide}`}>
              <button
                type="button"
                className={`btn btn-sm me-2 ${confirmationKind === "ends" ? "btn-danger" : "btn-primary"}`}
                onClick={handleSave}
                disabled={isSaving || !seedForm.canSave}
              >
                {isSaving
                  ? "저장 중..."
                  : confirmationKind === "ends"
                    ? "사이클을 끝내고 저장"
                    : "저장"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={stopEditing}
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
              <div className="text-light">{formatSeedAmount(currentSeed)}</div>
              {pendingSeedText && (
                <div className="mt-1">
                  <div className="small text-warning text-keep-all">{pendingSeedText}</div>
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
        {!isEditing && pendingNotice && (
          <div
            className={`alert alert-${seedChangeColor(pendingNotice.kind)} py-2 mb-0 mt-3 small`}
            role="status"
          >
            <NoticeLines notice={pendingNotice} titleClassName="" />
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
