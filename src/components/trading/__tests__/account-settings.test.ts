/**
 * 계좌 설정 카드의 편집 규칙 테스트 (#112)
 *
 * - 운용 시작일은 첫 일일 마감 전(lastProcessedDate가 null)에만 편집할 수 있다.
 * - 고른 전략이 지금 전략과 다르면 경고 문장을 보인다. 저장은 막지 않는다.
 * - 적용 전 시드 변경이 있으면 지금 시드와 바꿀 시드, 적용일을 보인다 (ADR-0005).
 * - 시드 칸은 바꿀 시드(적용 전 변경이 있으면 그 값)로 시작하고, 그 값과 다를 때만 보낸다.
 * - 적용 전 변경이 있으면 주문표 위에 오늘 주문표는 지금 시드 기준이라고 적는다 (#119).
 */
import { describe, it, expect } from "vitest";
import type { SeedStatus } from "@/types/trading";
import {
  canEditTradingStartDate,
  pendingSeedChangeText,
  pendingSeedOrdersNote,
  seedChangeToSend,
  seedInputValue,
  strategyChangeWarning,
} from "../account-settings";

/** 지금 시드 $10,000에서 $3,000으로 바꿔 2026-11-11(수)에 적용될 상태 */
const PENDING: SeedStatus = {
  current: 10_000,
  pending: { seedCapital: 3_000, effectiveDate: "2026-11-11" },
  appliedToday: null,
  changeEffectiveDate: "2026-11-11",
};
const SETTLED: SeedStatus = {
  current: 10_000,
  pending: null,
  appliedToday: null,
  changeEffectiveDate: "2026-11-11",
};

describe("canEditTradingStartDate()", () => {
  it("첫 일일 마감 전이면 운용 시작일을 편집할 수 있다", () => {
    expect(canEditTradingStartDate({ lastProcessedDate: null })).toBe(true);
  });

  it("첫 일일 마감 뒤에는 운용 시작일을 편집할 수 없다", () => {
    expect(canEditTradingStartDate({ lastProcessedDate: "2025-01-03" })).toBe(false);
  });
});

describe("strategyChangeWarning()", () => {
  it("다른 전략을 고르면 1번 티어 매수 주문을 냈는지 확인하라는 경고를 돌려준다", () => {
    expect(strategyChangeWarning("Pro1", "Pro3")).toBe(
      "이미 이 전략으로 1번 티어 매수 주문을 냈다면 바꾸지 마세요. 바꾼 전략으로 체결이 기록되어 증권사 잔고와 어긋납니다."
    );
  });

  it("지금 전략 그대로이면 경고가 없다", () => {
    expect(strategyChangeWarning("Pro2", "Pro2")).toBeNull();
  });
});

describe("pendingSeedChangeText()", () => {
  it("적용 전 변경이 있으면 지금 시드, 바꿀 시드, 적용일을 보인다", () => {
    expect(pendingSeedChangeText(PENDING)).toBe("$10,000 → $3,000, 11월 11일(수) 주문표부터");
  });

  it("적용 전 변경이 없으면 보일 것이 없다", () => {
    expect(pendingSeedChangeText(SETTLED)).toBeNull();
  });
});

describe("seedInputValue()", () => {
  it("적용 전 변경이 있으면 바꿀 시드로 시작한다 - 다시 바꾸기는 그 값을 덮어쓴다", () => {
    expect(seedInputValue(PENDING)).toBe(3_000);
  });

  it("적용 전 변경이 없으면 지금 시드로 시작한다", () => {
    expect(seedInputValue(SETTLED)).toBe(10_000);
  });
});

describe("seedChangeToSend()", () => {
  it("시드 칸이 시작 값 그대로이면 보내지 않는다", () => {
    expect(seedChangeToSend(PENDING, 3_000)).toBeNull();
    expect(seedChangeToSend(SETTLED, 10_000)).toBeNull();
  });

  it("시드 칸을 바꿨으면 그 값을 보낸다 - 지금 시드로 바꾸면 되돌리기다", () => {
    expect(seedChangeToSend(SETTLED, 3_000)).toBe(3_000);
    expect(seedChangeToSend(PENDING, 5_000)).toBe(5_000);
    expect(seedChangeToSend(PENDING, 10_000)).toBe(10_000);
  });
});

describe("pendingSeedOrdersNote()", () => {
  it("적용 전 변경이 있으면 오늘 주문표는 지금 시드 기준이라고만 적는다 - 새 시드와 적용일은 설정 카드가 보인다", () => {
    expect(pendingSeedOrdersNote(PENDING)).toBe("오늘 주문표는 지금 시드 $10,000 기준입니다.");
  });

  it("적용 전 변경이 없으면 적을 것이 없다", () => {
    expect(pendingSeedOrdersNote(SETTLED)).toBeNull();
  });
});
