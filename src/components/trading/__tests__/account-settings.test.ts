/**
 * 계좌 설정 카드의 편집 규칙 테스트 (#112)
 *
 * - 운용 시작일은 첫 일일 마감 전(lastProcessedDate가 null)에만 편집할 수 있다.
 * - 고른 전략이 지금 전략과 다르면 경고 문장을 보인다. 저장은 막지 않는다.
 * - 적용 전 시드 변경이 있으면 지금 시드와 바꿀 시드, 적용일을 보인다 (ADR-0005).
 * - 시드 칸은 바꿀 시드(적용 전 변경이 있으면 그 값)로 시작하고, 그 값과 다를 때만 보낸다.
 * - 새 시드가 처음 쓰이는 날(사이클이 이어질 때)에는 감액이면 출금, 증액이면 입금을 안내한다 (#118).
 * - 시드 감액으로 끝난 사이클의 출금액은 옛 시드에서부터 계산 과정을 줄마다 보인다 (#118).
 */
import { describe, it, expect } from "vitest";
import type { SeedStatus } from "@/types/trading";
import {
  appliedSeedNotice,
  canEditTradingStartDate,
  pendingSeedChangeText,
  seedChangeToSend,
  seedCutSettlementLines,
  seedCutSettlementTitle,
  seedInputValue,
  strategyChangeWarning,
} from "../account-settings";

/** 지금 시드 $10,000에서 $3,000으로 바꿔 2026-11-11(수)에 적용될 상태 */
const PENDING: SeedStatus = {
  current: 10_000,
  pending: { seedCapital: 3_000, effectiveDate: "2026-11-11" },
  appliedToday: null,
};
const SETTLED: SeedStatus = { current: 10_000, pending: null, appliedToday: null };

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

describe("appliedSeedNotice()", () => {
  it("줄인 시드가 처음 쓰이는 날에는 감액분을 이제 출금해도 된다고 안내한다", () => {
    const applied: SeedStatus = {
      current: 8_000,
      pending: null,
      appliedToday: { previous: 10_000, current: 8_000 },
    };

    expect(appliedSeedNotice(applied, false)).toBe(
      "오늘부터 시드는 $8,000입니다. 전 거래일 주문이 체결됐으니 이제 $2,000를 출금해도 됩니다."
    );
  });

  it("늘린 시드가 처음 쓰이는 날에는 아직 입금하지 않았으면 입금하라고 안내한다", () => {
    const applied: SeedStatus = {
      current: 12_000,
      pending: null,
      appliedToday: { previous: 10_000, current: 12_000 },
    };

    expect(appliedSeedNotice(applied, false)).toBe(
      "오늘부터 시드는 $12,000입니다. 아직 입금하지 않았다면 $2,000를 입금하세요."
    );
  });

  it("시드 감액으로 모두 파는 날에는 감액분을 아직 출금할 수 없으므로 안내하지 않는다", () => {
    const applied: SeedStatus = {
      current: 3_000,
      pending: null,
      appliedToday: { previous: 10_000, current: 3_000 },
    };

    expect(appliedSeedNotice(applied, true)).toBeNull();
  });

  it("오늘 처음 쓰이는 새 시드가 없으면 안내하지 않는다", () => {
    expect(appliedSeedNotice(SETTLED, false)).toBeNull();
  });
});

describe("seedCutSettlementTitle()", () => {
  it("끝난 사이클 번호와 함께 증권사 잔고를 새 시드에 맞추라고 알린다", () => {
    expect(seedCutSettlementTitle(1)).toBe(
      "사이클 1이 시드 감액으로 끝났습니다. 증권사 잔고를 새 시드에 맞추세요."
    );
  });

  it("사이클 번호를 읽는 소리에 맞춰 조사를 붙인다", () => {
    expect(seedCutSettlementTitle(2)).toMatch(/^사이클 2가 /);
    expect(seedCutSettlementTitle(10)).toMatch(/^사이클 10이 /);
    expect(seedCutSettlementTitle(14)).toMatch(/^사이클 14가 /);
  });
});

describe("seedCutSettlementLines()", () => {
  it("옛 시드 + 끝난 사이클 실현손익에서 새 시드를 빼 출금할 금액을 보인다", () => {
    const lines = seedCutSettlementLines({
      endedCycleNumber: 1,
      previousSeed: 10_000,
      realizedPnl: -140.2,
      newSeed: 3_000,
      withdrawal: 6_859.8,
    });

    expect(lines).toEqual([
      { label: "옛 시드", value: "$10,000.00", tone: "default" },
      { label: "+ 사이클 1 실현손익", value: "-$140.20", tone: "loss" },
      {
        label: "= 사이클이 끝났을 때 증권사에 있어야 할 현금",
        value: "$9,859.80",
        tone: "default",
      },
      { label: "− 새 시드", value: "$3,000.00", tone: "default" },
      { label: "= 출금할 금액", value: "$6,859.80", tone: "total" },
    ]);
  });

  it("실현손익이 이익이면 이익 색으로 보인다", () => {
    const lines = seedCutSettlementLines({
      endedCycleNumber: 3,
      previousSeed: 10_000,
      realizedPnl: 159.8,
      newSeed: 3_000,
      withdrawal: 7_159.8,
    });

    expect(lines[1]).toEqual({ label: "+ 사이클 3 실현손익", value: "$159.80", tone: "profit" });
  });

  it("손실이 커서 출금할 금액이 음수이면 그만큼 입금할 금액으로 보인다", () => {
    const lines = seedCutSettlementLines({
      endedCycleNumber: 1,
      previousSeed: 10_000,
      realizedPnl: -9_140.2,
      newSeed: 9_000,
      withdrawal: -8_140.2,
    });

    expect(lines.at(-1)).toEqual({ label: "= 입금할 금액", value: "$8,140.20", tone: "total" });
  });
});
