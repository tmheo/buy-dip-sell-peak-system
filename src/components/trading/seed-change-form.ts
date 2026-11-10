/**
 * 설정 카드의 시드 칸 편집 규칙 (#119, ADR-0004, ADR-0005, ADR-0006)
 *
 * 입력한 새 시드와 계좌의 시드 상태, 감액 경계로 시드 칸이 보일 안내와 확인, 보낼 변경을 정한다.
 * 카드는 이 결과를 그리기만 한다.
 *
 * - 감액 경계는 계좌 상세 응답의 seedCutLimits다. 서버가 409로 다시 물었으면 그 응답의 경계와
 *   분류, 적용일을 쓴다 - 화면을 연 뒤 오늘 주문표가 체결돼 경계가 바뀐 경우다.
 * - 새 시드가 쓰이기 시작하는 날(적용일)은 서버가 준 날짜다. 브라우저 시계로 다시 계산하지 않는다.
 * - 사이클을 끝낼 수 있는 감액(오늘 매수에 달림, 사이클 끝)은 확인 체크를 해야 저장된다. 확인은
 *   확인한 분류·새 시드·감액 경계에 묶여, 그중 하나라도 바뀌면 풀린다 - 저장에 실패해 다시 읽은
 *   경계로 분류가 바뀌었는데 예전 확인으로 보내는 일이 없게 한다.
 */

import { MIN_SEED_CAPITAL } from "@/lib/validations/seed-capital-bounds";
import { mayEndCycle } from "@/strategy";
import type { CycleEndingSeedChange, SeedCutLimits } from "@/strategy";
import type { SeedStatus } from "@/types/trading";

import { seedChangeToSend } from "./account-settings";
import { formatMonthDayWithWeekday, formatSeedAmount } from "./format";
import { seedChangeNotice, type SeedChangeNotice } from "./seed-change-notices";

/** 시드 변경 API에 보낼 본문 (PUT /api/trading/accounts/[id]/seed) */
export interface SeedChangeRequest {
  seedCapital: number;
  /** 사용자가 확인한 시드 변경 분류. 확인하지 않았으면 없다 */
  confirmedClassification?: CycleEndingSeedChange;
}

/** 서버가 사이클을 끝낼 수 있는 감액이라며 다시 물은 409 응답과, 그때 보낸 새 시드 */
export interface SeedChangeRecheck {
  seedCapital: number;
  classification: CycleEndingSeedChange;
  seedCutLimits: SeedCutLimits;
  effectiveDate: string;
}

/** 사용자가 확인 체크를 한 대상 - 이 셋 중 하나라도 바뀌면 확인이 풀린다 */
export interface CycleEndConfirmation {
  classification: CycleEndingSeedChange;
  seedCapital: number;
  limits: SeedCutLimits;
}

export interface SeedChangeFormInput {
  /** 계좌의 시드 상태 (계좌 상세 응답의 account.seed) */
  seed: SeedStatus;
  /** 시드 칸에 입력한 새 시드 */
  enteredSeed: number;
  /** 계좌 상세 응답의 감액 경계. 사이클 사이에는 null */
  seedCutLimits: SeedCutLimits | null;
  /** 서버가 409로 다시 물었으면 그 응답. 편집을 시작하면 지운다 */
  recheck: SeedChangeRecheck | null;
  /** 사용자가 한 확인. 확인하지 않았으면 null */
  confirmation: CycleEndConfirmation | null;
}

export interface SeedChangeForm {
  /** 분류에 쓴 감액 경계. 사이클 사이에는 null */
  limits: SeedCutLimits | null;
  /** 지금 바꾸면 새 시드가 쓰이기 시작하는 날 (YYYY-MM-DD) */
  effectiveDate: string;
  /** 입력한 새 시드의 안내. 사이클 사이이거나, 바꾸지 않거나, 최소 시드보다 작으면 null */
  notice: SeedChangeNotice | null;
  /** 감액 경계 막대를 보이는지 - 사이클 중 감액일 때 */
  showsCutZoneBar: boolean;
  /** 적용 전 변경을 지우고 지금 시드로 되돌리는지 */
  revertsPending: boolean;
  /** 되돌릴 때의 안내. 되돌리지 않으면 null */
  revertNote: string | null;
  /** 시드 칸 아래 도움말 */
  hint: string;
  /** 확인받아야 하는 분류 - 확인 체크를 보인다. 확인할 것이 없으면 null */
  confirmationKind: CycleEndingSeedChange | null;
  /** 확인 체크를 하면 남길 확인. 확인할 것이 없으면 null */
  confirmationTarget: CycleEndConfirmation | null;
  /** 지금의 분류·새 시드·감액 경계를 확인했는지 */
  confirmed: boolean;
  /** 저장할 수 있는지 - 확인할 것이 있으면 확인해야 한다 */
  canSave: boolean;
  /** 보낼 시드 변경. 시드 칸이 시작 값 그대로이면 null */
  request: SeedChangeRequest | null;
}

function sameLimits(a: SeedCutLimits, b: SeedCutLimits): boolean {
  return a.closedCash === b.closedCash && a.cashIfTodayBuyFills === b.cashIfTodayBuyFills;
}

function sameConfirmation(a: CycleEndConfirmation, b: CycleEndConfirmation): boolean {
  return (
    a.classification === b.classification &&
    a.seedCapital === b.seedCapital &&
    sameLimits(a.limits, b.limits)
  );
}

/**
 * 시드 칸의 안내·확인·보낼 변경
 */
export function seedChangeForm(input: SeedChangeFormInput): SeedChangeForm {
  const { seed, enteredSeed, recheck, confirmation } = input;
  const limits = recheck?.seedCutLimits ?? input.seedCutLimits;
  const effectiveDate = recheck?.effectiveDate ?? seed.changeEffectiveDate;
  const seedToSend = seedChangeToSend(seed, enteredSeed);
  const valid = enteredSeed >= MIN_SEED_CAPITAL;

  const notice =
    limits && valid
      ? seedChangeNotice({ currentSeed: seed.current, newSeed: enteredSeed, limits, effectiveDate })
      : null;
  // 서버가 다시 물은 새 시드 그대로이면 서버의 분류로 확인받는다
  const kind =
    recheck && recheck.seedCapital === enteredSeed ? recheck.classification : notice?.kind;
  const confirmationKind = seedToSend !== null && kind && mayEndCycle(kind) ? kind : null;
  const confirmationTarget =
    confirmationKind && limits
      ? { classification: confirmationKind, seedCapital: enteredSeed, limits }
      : null;
  const confirmed =
    confirmationTarget !== null &&
    confirmation !== null &&
    sameConfirmation(confirmationTarget, confirmation);

  const revertsPending = seed.pending !== null && seedToSend === seed.current;
  const hint = [
    seed.pending && `지금 시드는 ${formatSeedAmount(seed.current)}입니다.`,
    !revertsPending && `새 시드는 ${formatMonthDayWithWeekday(effectiveDate)} 주문표부터 쓰입니다.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    limits,
    effectiveDate,
    notice,
    showsCutZoneBar: limits !== null && valid && enteredSeed < seed.current,
    revertsPending,
    revertNote: revertsPending
      ? `저장하면 적용 전 변경을 지우고 지금 시드 ${formatSeedAmount(seed.current)}를 그대로 씁니다.`
      : null,
    hint,
    confirmationKind,
    confirmationTarget,
    confirmed,
    canSave: confirmationKind === null || confirmed,
    request:
      seedToSend === null
        ? null
        : {
            seedCapital: seedToSend,
            ...(confirmed && confirmationKind ? { confirmedClassification: confirmationKind } : {}),
          },
  };
}

/**
 * 사이클 중 저장한(적용 전) 변경의 안내 - 적용될 때까지 카드 안에 남는다.
 *
 * @param limits - 계좌 상세 응답의 감액 경계. 사이클 사이에는 null
 * @returns 안내. 적용 전 변경이 없거나 사이클 사이이면 null
 */
export function pendingSeedChangeNotice(
  seed: SeedStatus,
  limits: SeedCutLimits | null
): SeedChangeNotice | null {
  if (!seed.pending || !limits) return null;
  return seedChangeNotice({
    currentSeed: seed.current,
    newSeed: seed.pending.seedCapital,
    limits,
    effectiveDate: seed.pending.effectiveDate,
  });
}
