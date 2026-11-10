/**
 * 새 시드가 쓰이기 시작한 뒤 설정 카드가 보일 안내 테스트 (#118, ADR-0006)
 *
 * - 새 시드가 처음 쓰이는 날(사이클이 이어질 때)에는 감액이면 출금, 증액이면 입금을 안내한다.
 * - 시드 감액으로 사이클을 끝내는 날에는 감액분을 아직 출금할 수 없으므로 그 안내를 내지 않는다.
 * - 시드 감액 정산은 옛 시드에서부터 계산 과정을 줄마다 보인다. 값은 모두 서버가 낸 정산의
 *   값이다 - 화면은 파생값을 다시 계산하지 않는다(ADR-0003).
 */
import { describe, it, expect } from "vitest";
import type { SeedCutSettlement } from "@/trading";
import type { SeedStatus } from "@/types/trading";
import {
  appliedSeedNotice,
  seedCutSettlementLines,
  seedCutSettlementTitle,
} from "../applied-seed-notices";

/** 시드 $10,000 → $3,000, 손익 -$140.20으로 끝난 사이클 1의 정산 (이슈 #118의 예) */
const LOSS_SETTLEMENT: SeedCutSettlement = {
  endedCycleNumber: 1,
  previousSeed: 10_000,
  realizedPnl: -140.2,
  cashAtCycleEnd: 9_859.8,
  newSeed: 3_000,
  withdrawal: 6_859.8,
};

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

  it("시드 감액으로 사이클을 끝내는 날에는 감액분을 아직 출금할 수 없으므로 안내하지 않는다", () => {
    const applied: SeedStatus = {
      current: 3_000,
      pending: null,
      appliedToday: { previous: 10_000, current: 3_000 },
    };

    expect(appliedSeedNotice(applied, true)).toBeNull();
  });

  it("오늘 처음 쓰이는 새 시드가 없으면 안내하지 않는다", () => {
    const settled: SeedStatus = { current: 10_000, pending: null, appliedToday: null };

    expect(appliedSeedNotice(settled, false)).toBeNull();
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
    expect(seedCutSettlementLines(LOSS_SETTLEMENT)).toEqual([
      { label: "옛 시드", value: "$10,000.00", tone: "default" },
      { label: "+ 사이클 1 실현손익", value: "-$140.20", tone: "loss" },
      {
        label: "= 사이클이 끝났을 때 증권사에 있어야 할 현금",
        value: "$9,859.80",
        tone: "default",
      },
      { label: "- 새 시드", value: "$3,000.00", tone: "default" },
      { label: "= 출금할 금액", value: "$6,859.80", tone: "total" },
    ]);
  });

  it("실현손익이 이익이면 이익 색으로 보인다", () => {
    const lines = seedCutSettlementLines({
      endedCycleNumber: 3,
      previousSeed: 10_000,
      realizedPnl: 159.8,
      cashAtCycleEnd: 10_159.8,
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
      cashAtCycleEnd: 859.8,
      newSeed: 9_000,
      withdrawal: -8_140.2,
    });

    expect(lines.at(-1)).toEqual({ label: "= 입금할 금액", value: "$8,140.20", tone: "total" });
  });
});
