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
 * 세 구간 막대(이어감, 오늘 매수에 달림, 사이클 끝)에 입력한 감액의 위치를 보인다. 경계는 계좌 상세
 * 응답의 seedCutLimits, 분류는 서버와 같은 src/strategy의 classifySeedChange를 쓴다 - 화면이 규칙을
 * 다시 계산하지 않는다. 사이클을 끝낼 수 있는 감액은 확인 체크를 해야 저장된다. 서버가 그사이 바뀐
 * 경계로 다시 묻으면(409) 그 경계로 막대와 안내를 다시 그리고 다시 확인받는다.
 * 저장한 변경의 안내는 적용될 때까지 카드 안에 남는다.
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
import { getNextWeekday, getTodayTradingDate } from "@/lib/date";
import { MIN_SEED_CAPITAL, MIN_SEED_CAPITAL_MESSAGE } from "@/lib/validations/seed-capital-bounds";
import { classifySeedChange, mayEndCycle } from "@/strategy";
import type { SeedChangeKind, SeedCutLimits } from "@/strategy";
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
import {
  cutZoneBar,
  cycleEndConfirmation,
  seedChangeNotice,
  type SeedChangeNotice,
  type SeedChangeTone,
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
 * seed는 새 시드(PUT /api/trading/accounts/[id]/seed)이고, 바꾸지 않았으면 null이다.
 * confirmCycleEnd는 사이클을 끝낼 수 있는 감액을 사용자가 확인했는지다.
 */
export interface AccountSettingsChanges {
  settings: AccountSettingsUpdate | null;
  seed: { seedCapital: number; confirmCycleEnd: boolean } | null;
}

/**
 * 저장 결과. needsConfirmation은 서버가 그사이 바뀐 감액 경계로 이 감액이 사이클을 끝낼 수 있다며
 * 확인을 요구한 경우다(409) - 그 경계로 다시 그리고 다시 확인받는다.
 */
export type AccountSettingsSaveResult =
  | { status: "saved" }
  | { status: "failed" }
  | { status: "needsConfirmation"; seedCutLimits: SeedCutLimits };

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

const ZONE_BAR_CLASS: Record<Exclude<SeedChangeKind, "increase">, string> = {
  keep: "bg-success",
  depends: "bg-warning",
  ends: "bg-danger",
};

const ZONE_LEGEND_CLASS: Record<Exclude<SeedChangeKind, "increase">, string> = {
  keep: "text-success",
  depends: "text-warning",
  ends: "text-danger",
};

/** 감액 구간 막대 - 줄일 수 있는 금액 전체에서 세 구간과 입력한 감액의 위치 */
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
              className={ZONE_BAR_CLASS[zone.kind]}
              style={{ width: `${zone.percent}%` }}
            />
          ))}
        </div>
        <div className="cut-zone-marker" style={{ left: `${markerPercent}%` }} />
      </div>
      <div className="d-flex flex-wrap column-gap-3 row-gap-1 small text-secondary mt-2">
        {zones.map((zone) => (
          <span key={zone.kind} className="text-nowrap">
            <span className={ZONE_LEGEND_CLASS[zone.kind]} aria-hidden="true">
              ■
            </span>{" "}
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const NOTICE_TITLE_CLASS: Record<SeedChangeTone, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const NOTICE_ALERT_CLASS: Record<SeedChangeTone, string> = {
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  danger: "alert-danger",
};

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
  // 사이클을 끝낼 수 있는 감액을 확인했는지 - 새 시드나 경계가 바뀌면 다시 확인받는다
  const [cycleEndConfirmed, setCycleEndConfirmed] = useState(false);
  // 서버가 그사이 바뀐 경계로 다시 물었을 때(409) 그 경계. 편집을 마치면 지운다
  const [changedLimits, setChangedLimits] = useState<SeedCutLimits | null>(null);
  const seedInputRef = useRef<HTMLInputElement>(null);

  const inCycle = account.isCycleInProgress;
  const startDateEditable = !inCycle && canEditTradingStartDate(account);
  const strategyWarning = strategyChangeWarning(account.strategy, formData.strategy);
  const pendingSeedText = pendingSeedChangeText(account.seed);
  const appliedNotice = appliedSeedNotice(account.seed, endsCycleBySeedCut);
  const currentSeed = account.seed.current;
  const pending = account.seed.pending;
  // 새 시드가 쓰이기 시작하는 날 - 서버와 같은 규칙(오늘의 다음 평일)이다.
  // 적용 전 변경이 있으면 그 적용일이고, 같은 날 다시 바꿔도 적용일은 같다
  const effectiveDate = pending?.effectiveDate ?? getNextWeekday(getTodayTradingDate());

  // 편집 중인 새 시드의 분류와 안내 - 경계는 사이클 중에만 있다
  const editLimits = changedLimits ?? seedCutLimits;
  const enteredSeed = formData.seedCapital;
  const seedToSend = seedChangeToSend(account.seed, enteredSeed);
  const enteredKind =
    editLimits && enteredSeed >= MIN_SEED_CAPITAL
      ? classifySeedChange(currentSeed, enteredSeed, editLimits)
      : null;
  const enteredNotice =
    editLimits && enteredKind
      ? seedChangeNotice({
          kind: enteredKind,
          currentSeed,
          newSeed: enteredSeed,
          limits: editLimits,
          effectiveDate,
        })
      : null;
  const showsCutZoneBar = enteredKind !== null && enteredSeed < currentSeed;
  // 보낼 변경이 사이클을 끝낼 수 있으면 확인받는다
  const confirmationKind =
    enteredKind && seedToSend !== null && mayEndCycle(enteredKind) ? enteredKind : null;
  const revertsPending = pending !== null && seedToSend === currentSeed;

  // 저장한(적용 전) 변경의 안내 - 적용될 때까지 카드 안에 남는다
  const pendingNotice =
    seedCutLimits && pending
      ? seedChangeNotice({
          kind: classifySeedChange(currentSeed, pending.seedCapital, seedCutLimits),
          currentSeed,
          newSeed: pending.seedCapital,
          limits: seedCutLimits,
          effectiveDate: pending.effectiveDate,
        })
      : null;

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
    setCycleEndConfirmed(false);
    setChangedLimits(null);
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
    if (name === "seedCapital") setCycleEndConfirmed(false);
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
    if (confirmationKind && !cycleEndConfirmed) return;
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
      seed:
        seedToSend === null
          ? null
          : { seedCapital: seedToSend, confirmCycleEnd: confirmationKind !== null },
    };
    if (changes.settings === null && changes.seed === null) {
      stopEditing();
      return;
    }

    const result = await onSave(changes);
    if (result.status === "saved") {
      stopEditing();
    } else if (result.status === "needsConfirmation") {
      setChangedLimits(result.seedCutLimits);
      setCycleEndConfirmed(false);
    }
  }

  /** 적용 전 변경을 지운다 - 지금 시드를 보내면 서버가 그 변경을 지운다 */
  async function handleRevertSeed(): Promise<void> {
    await onSave({ settings: null, seed: { seedCapital: currentSeed, confirmCycleEnd: false } });
  }

  const seedHint = [
    pending && `지금 시드는 ${formatSeedAmount(currentSeed)}입니다.`,
    !enteredNotice && !revertsPending && "바꾼 시드는 다음 거래일 주문표부터 쓰입니다.",
  ]
    .filter(Boolean)
    .join(" ");
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
          {!isEditing && !(inCycle && pending) && (
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
                  {changedLimits && (
                    <div className="alert alert-warning py-2 mb-3 text-keep-all" role="alert">
                      화면을 연 뒤 예수금이나 오늘 매수가 바뀌어 감액 구간이 달라졌습니다. 바뀐
                      안내를 확인하고 다시 저장하세요.
                    </div>
                  )}
                  {editLimits && showsCutZoneBar && (
                    <CutZoneBar
                      currentSeed={currentSeed}
                      newSeed={enteredSeed}
                      limits={editLimits}
                    />
                  )}
                  {enteredNotice && (
                    <NoticeLines
                      notice={enteredNotice}
                      titleClassName={NOTICE_TITLE_CLASS[enteredNotice.tone]}
                    />
                  )}
                  {revertsPending && (
                    <div className="mb-1 text-keep-all">
                      저장하면 적용 전 변경을 지우고 지금 시드 {formatSeedAmount(currentSeed)}를
                      그대로 씁니다.
                    </div>
                  )}
                  {confirmationKind && (
                    <div className="form-check mt-2 mb-1">
                      <input
                        id="settings-seed-confirm"
                        type="checkbox"
                        className="form-check-input"
                        checked={cycleEndConfirmed}
                        onChange={(e) => setCycleEndConfirmed(e.target.checked)}
                        disabled={isSaving}
                      />
                      <label
                        htmlFor="settings-seed-confirm"
                        className="form-check-label text-keep-all"
                      >
                        {cycleEndConfirmation(confirmationKind, effectiveDate)}
                      </label>
                    </div>
                  )}
                  <div
                    className={`text-secondary text-keep-all ${
                      enteredNotice || revertsPending ? "mt-2" : ""
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
                disabled={isSaving || (confirmationKind !== null && !cycleEndConfirmed)}
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
            className={`alert ${NOTICE_ALERT_CLASS[pendingNotice.tone]} py-2 mb-0 mt-3 small`}
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
