/**
 * 시드를 바꿀 때 설정 카드가 보일 안내 (#119, ADR-0004, ADR-0005, ADR-0006)
 *
 * 입력은 입금·출금 금액이 아니라 새 시드다 - 사이클을 끝내는 감액은 출금액이 감액분과 다르다.
 * 입금·출금할 금액과 그 시점은 이 안내가 알려 준다.
 *
 * 시드 변경 분류와 감액 경계는 src/strategy의 classifySeedChange와 seedCutLimits가 정한다. 이 모듈은
 * 서버와 같은 classifySeedChange로 분류해 문장을 만들 뿐 규칙을 다시 계산하지 않는다 - 화면이 보인
 * 분류와 서버가 확인하는 분류가 어긋나지 않게 하려는 것이다. 분류를 따로 받지 않으므로 호출하는
 * 쪽이 새 시드와 맞지 않는 분류를 넘길 수 없다.
 *
 * 새 시드가 쓰이기 시작하는 날은 시드 칸의 도움말이, 오늘 주문표가 지금 시드 기준이라는 것은
 * 주문표 위 문장이 알려 주므로 이 안내는 되풀이하지 않는다.
 */

import Decimal from "decimal.js";

import { MIN_SEED_CAPITAL } from "@/lib/validations/seed-capital-bounds";
import { classifySeedChange } from "@/strategy";
import type { CycleEndingSeedChange, SeedChangeKind, SeedCutLimits } from "@/strategy";

import { formatCurrency, formatMonthDayWithWeekday, formatSeedAmount } from "./format";

/** Bootstrap 색 이름 - 화면은 bg-, text-, alert- 뒤에 붙여 쓴다 */
export type SeedChangeColor = "info" | "success" | "warning" | "danger";

const SEED_CHANGE_COLORS: Record<SeedChangeKind, SeedChangeColor> = {
  increase: "info",
  keep: "success",
  depends: "warning",
  ends: "danger",
};

/** 시드 변경 분류의 색 - 감액 경계 막대의 칸과 안내가 같은 색을 쓴다 */
export function seedChangeColor(kind: SeedChangeKind): SeedChangeColor {
  return SEED_CHANGE_COLORS[kind];
}

export interface SeedChangeNotice {
  /** classifySeedChange로 본 시드 변경 분류 */
  kind: SeedChangeKind;
  title: string;
  lines: string[];
}

export interface SeedChangeInput {
  /** 오늘의 시드 */
  currentSeed: number;
  /** 새 시드 */
  newSeed: number;
  /** 감액 경계 (계좌 상세 응답의 seedCutLimits, 또는 409 응답의 seedCutLimits) */
  limits: SeedCutLimits;
  /** 새 시드가 쓰이기 시작하는 날 (YYYY-MM-DD) */
  effectiveDate: string;
}

/**
 * 시드 변경의 안내
 *
 * @returns 안내. 새 시드가 지금 시드와 같으면 null
 */
export function seedChangeNotice(input: SeedChangeInput): SeedChangeNotice | null {
  const { currentSeed, newSeed, limits, effectiveDate } = input;
  const change = new Decimal(newSeed).sub(currentSeed);
  if (change.isZero()) return null;
  const kind = classifySeedChange(currentSeed, newSeed, limits);
  const diff = formatSeedAmount(change.abs().toNumber());
  const day = formatMonthDayWithWeekday(effectiveDate);
  switch (kind) {
    case "increase":
      return {
        kind,
        title: `시드를 ${diff} 늘립니다`,
        lines: [`증권사 계좌에 ${diff}를 입금하세요. 입금은 언제 해도 됩니다.`],
      };
    case "keep":
      return {
        kind,
        title: `시드를 ${diff} 줄입니다 - 사이클은 이어집니다`,
        lines: [
          `${diff} 출금은 오늘 주문이 체결된 뒤, ${day} 아침 9시 이후에 하세요. 그 전에 빼면 오늘 매수에 쓸 돈이 모자랄 수 있습니다.`,
        ],
      };
    case "depends":
      return {
        kind,
        title: `시드를 ${diff} 줄입니다 - 오늘 매수가 체결되면 사이클이 끝납니다`,
        lines: [
          `오늘 매수가 체결되면 예수금이 ${formatCurrency(limits.cashIfTodayBuyFills)}로 줄어 감액이 예수금보다 커집니다.`,
          `그러면 ${day}에 매수 없이 보유 티어를 모두 MOC로 팔고 사이클이 끝납니다. 체결되지 않으면 사이클은 이어집니다.`,
          `어느 쪽인지는 ${day} 아침에 확정됩니다. 출금할 금액은 그때 안내합니다.`,
        ],
      };
    case "ends":
      return {
        kind,
        title: `시드를 ${diff} 줄입니다 - 사이클이 끝납니다`,
        lines: [
          `감액이 직전 마감 예수금 ${formatCurrency(limits.closedCash)}보다 큽니다.`,
          `${day}에 매수 없이 보유 티어를 모두 MOC로 팔고 사이클이 끝납니다. 그다음 거래일부터 새 시드 ${formatSeedAmount(newSeed)}로 다음 사이클을 시작합니다.`,
          "출금할 금액은 매도 가격에 달려 있어 매도가 체결된 뒤 알려 드립니다.",
        ],
      };
  }
}

/** 감액 경계 막대의 한 칸 - 한 시드 변경 분류. percent는 줄일 수 있는 금액 전체에서 차지하는 너비(%) */
export interface CutZone {
  kind: Exclude<SeedChangeKind, "increase">;
  percent: number;
  label: string;
}

export interface CutZoneBarLayout {
  zones: CutZone[];
  /** 입력한 감액의 위치(%) */
  markerPercent: number;
}

/**
 * 감액 경계 막대 - 줄일 수 있는 금액(지금 시드 - 최소 시드)을 감액 경계로 나눠 이어감, 오늘 매수에
 * 달림, 사이클 끝의 칸을 두고 입력한 감액의 위치를 표시한다. 경계는 seedCutLimits의 값 그대로다.
 *
 * @param currentSeed - 오늘의 시드
 * @param newSeed - 새 시드 (지금 시드보다 작다)
 * @param limits - 감액 경계
 */
export function cutZoneBar(
  currentSeed: number,
  newSeed: number,
  limits: SeedCutLimits
): CutZoneBarLayout {
  const maxCut = new Decimal(currentSeed).sub(MIN_SEED_CAPITAL);
  const percentOf = (cut: Decimal.Value): Decimal =>
    Decimal.min(100, Decimal.max(0, new Decimal(cut).div(maxCut).mul(100)));
  const keepEnd = percentOf(limits.cashIfTodayBuyFills);
  const dependsEnd = percentOf(limits.closedCash);
  // 너비가 없는 칸은 보이지 않는다 - 오늘 체결될 매수가 없으면 오늘 매수에 달림 칸이,
  // 직전 마감 예수금이 줄일 수 있는 금액보다 크면 사이클 끝 칸이 없다
  const zones = (
    [
      {
        kind: "keep",
        percent: keepEnd.toNumber(),
        label: `감액 ${formatCurrency(limits.cashIfTodayBuyFills)}까지 이어감`,
      },
      {
        kind: "depends",
        percent: dependsEnd.sub(keepEnd).toNumber(),
        label: `감액 ${formatCurrency(limits.closedCash)}까지 오늘 매수에 달림`,
      },
      {
        kind: "ends",
        percent: new Decimal(100).sub(dependsEnd).toNumber(),
        label: "그보다 크면 사이클 끝",
      },
    ] satisfies CutZone[]
  ).filter((zone) => zone.percent > 0);
  return { zones, markerPercent: percentOf(new Decimal(currentSeed).sub(newSeed)).toNumber() };
}

/**
 * 사이클을 끝낼 수 있는 감액(src/strategy의 mayEndCycle)을 저장하기 전에 확인받는 문장
 *
 * @param kind - 사이클을 끝내는 감액(ends) 또는 오늘 매수에 달린 감액(depends)
 * @param effectiveDate - 새 시드가 쓰이기 시작하는 날 (YYYY-MM-DD)
 */
export function cycleEndConfirmation(kind: CycleEndingSeedChange, effectiveDate: string): string {
  const day = formatMonthDayWithWeekday(effectiveDate);
  return kind === "ends"
    ? `${day}에 보유 티어를 모두 팔고 사이클을 끝내는 것을 확인했습니다.`
    : `오늘 매수가 체결되면 ${day}에 보유 티어를 모두 팔고 사이클이 끝날 수 있음을 확인했습니다.`;
}
