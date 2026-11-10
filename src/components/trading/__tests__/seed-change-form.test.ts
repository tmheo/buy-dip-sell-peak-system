/**
 * 설정 카드의 시드 칸 편집 규칙 테스트 (#119, ADR-0004, ADR-0005, ADR-0006)
 *
 * - 시드 변경 분류는 감액 경계(계좌 상세 응답, 또는 409 응답의 경계)로 서버와 같은 함수가 정한다.
 * - 사이클을 끝낼 수 있는 감액(오늘 매수에 달림, 사이클 끝)은 확인 체크를 해야 저장된다. 확인은
 *   확인한 분류·새 시드·감액 경계에 묶여, 그중 하나라도 바뀌면 풀린다.
 * - 새 시드가 쓰이기 시작하는 날은 서버가 준 날짜를 쓴다 - 브라우저 시계로 다시 계산하지 않는다.
 */
import { describe, it, expect } from "vitest";
import type { SeedStatus } from "@/types/trading";
import {
  pendingSeedChangeNotice,
  seedChangeForm,
  type SeedChangeFormInput,
} from "../seed-change-form";

/** 지금 시드 $10,000, 적용 전 변경 없음. 지금 바꾸면 11월 11일(수)부터 쓰인다 */
const SETTLED: SeedStatus = {
  current: 10_000,
  pending: null,
  appliedToday: null,
  changeEffectiveDate: "2026-11-11",
};
/** $10,000에서 $8,000으로 바꿔 둔 상태 */
const PENDING: SeedStatus = {
  ...SETTLED,
  pending: { seedCapital: 8_000, effectiveDate: "2026-11-11" },
};
/** 직전 마감 예수금 $5,000, 오늘 매수가 체결되면 예수금 $2,345.67 */
const LIMITS = { closedCash: 5_000, cashIfTodayBuyFills: 2_345.67 };

function form(overrides: Partial<SeedChangeFormInput>) {
  return seedChangeForm({
    seed: SETTLED,
    enteredSeed: SETTLED.current,
    seedCutLimits: LIMITS,
    recheck: null,
    confirmation: null,
    ...overrides,
  });
}

describe("seedChangeForm() - 안내와 저장", () => {
  it("시드를 그대로 두면 보낼 변경이 없고, 도움말은 서버가 준 적용일을 알린다", () => {
    expect(form({})).toMatchObject({
      request: null,
      notice: null,
      showsCutZoneBar: false,
      confirmationKind: null,
      canSave: true,
      hint: "새 시드는 11월 11일(수) 주문표부터 쓰입니다.",
    });
  });

  it("사이클 사이에는 감액 경계가 없어 안내·막대·확인 없이 새 시드를 보낸다", () => {
    // 금요일에 바꾸면 서버가 다음 월요일을 적용일로 준다
    const friday: SeedStatus = { ...SETTLED, changeEffectiveDate: "2026-11-16" };

    expect(form({ seed: friday, enteredSeed: 3_000, seedCutLimits: null })).toMatchObject({
      request: { seedCapital: 3_000 },
      notice: null,
      showsCutZoneBar: false,
      confirmationKind: null,
      canSave: true,
      hint: "새 시드는 11월 16일(월) 주문표부터 쓰입니다.",
    });
  });

  it("사이클 중 증액은 입금 안내만 하고 확인 없이 보낸다", () => {
    const result = form({ enteredSeed: 12_000 });

    expect(result.notice?.title).toBe("시드를 $2,000 늘립니다");
    expect(result).toMatchObject({
      showsCutZoneBar: false,
      confirmationKind: null,
      canSave: true,
      request: { seedCapital: 12_000 },
    });
  });

  it("사이클이 이어지는 감액은 감액 경계 막대를 보이고 확인 없이 보낸다", () => {
    expect(form({ enteredSeed: 8_000 })).toMatchObject({
      notice: { kind: "keep" },
      showsCutZoneBar: true,
      confirmationKind: null,
      canSave: true,
      request: { seedCapital: 8_000 },
    });
  });

  it("최소 시드보다 작게 입력하는 동안에는 안내와 막대를 보이지 않는다", () => {
    expect(form({ enteredSeed: 1_999 })).toMatchObject({
      notice: null,
      showsCutZoneBar: false,
      confirmationKind: null,
    });
  });
});

describe("seedChangeForm() - 사이클을 끝낼 수 있는 감액의 확인", () => {
  it("사이클을 끝내는 감액은 확인하기 전에는 저장할 수 없다", () => {
    expect(form({ enteredSeed: 3_000 })).toMatchObject({
      notice: { kind: "ends" },
      confirmationKind: "ends",
      canSave: false,
      request: { seedCapital: 3_000 },
    });
  });

  it("확인하면 저장할 수 있고, 확인한 분류를 함께 보낸다", () => {
    const unconfirmed = form({ enteredSeed: 3_000 });

    const confirmed = form({ enteredSeed: 3_000, confirmation: unconfirmed.confirmationTarget });

    expect(confirmed).toMatchObject({
      confirmed: true,
      canSave: true,
      request: { seedCapital: 3_000, confirmedClassification: "ends" },
    });
  });

  it("확인한 뒤 새 시드를 바꾸면 같은 분류여도 확인이 풀린다", () => {
    const confirmation = form({ enteredSeed: 3_000 }).confirmationTarget;

    expect(form({ enteredSeed: 4_000, confirmation })).toMatchObject({
      confirmationKind: "ends",
      confirmed: false,
      canSave: false,
    });
  });

  it("저장에 실패해 다시 읽은 감액 경계로 분류가 바뀌면 확인이 풀리고 확인한 분류를 보내지 않는다", () => {
    // $6,000은 오늘 매수에 달린 감액($4,000)이었는데, 다시 읽어 보니 직전 마감 예수금이 $3,000으로 줄었다
    const confirmation = form({ enteredSeed: 6_000 }).confirmationTarget;
    expect(confirmation?.classification).toBe("depends");

    const reloaded = form({
      enteredSeed: 6_000,
      seedCutLimits: { closedCash: 3_000, cashIfTodayBuyFills: 1_000 },
      confirmation,
    });

    expect(reloaded.request).toEqual({ seedCapital: 6_000 });
    expect(reloaded).toMatchObject({ confirmationKind: "ends", confirmed: false, canSave: false });
  });

  it("다시 읽은 감액 경계가 달라지면 분류가 같아도 확인이 풀린다", () => {
    const confirmation = form({ enteredSeed: 3_000 }).confirmationTarget;

    const reloaded = form({
      enteredSeed: 3_000,
      seedCutLimits: { closedCash: 4_000, cashIfTodayBuyFills: 2_000 },
      confirmation,
    });

    expect(reloaded).toMatchObject({ confirmationKind: "ends", confirmed: false });
  });
});

describe("seedChangeForm() - 서버가 409로 다시 물었을 때", () => {
  // 화면을 연 뒤 예수금이 줄어, 오늘 매수에 달린 감액으로 확인한 $6,000이 사이클을 끝내는 감액이 됐다
  const RECHECK = {
    seedCapital: 6_000,
    classification: "ends" as const,
    seedCutLimits: { closedCash: 3_000, cashIfTodayBuyFills: 1_000 },
    effectiveDate: "2026-11-12",
  };

  it("응답의 분류와 감액 경계와 적용일로 다시 그리고 다시 확인받는다", () => {
    const confirmation = form({ enteredSeed: 6_000 }).confirmationTarget;

    const result = form({ enteredSeed: 6_000, recheck: RECHECK, confirmation });

    expect(result).toMatchObject({
      limits: RECHECK.seedCutLimits,
      effectiveDate: "2026-11-12",
      notice: { kind: "ends" },
      confirmationKind: "ends",
      confirmed: false,
      canSave: false,
      hint: "새 시드는 11월 12일(목) 주문표부터 쓰입니다.",
    });
  });

  it("다시 물은 뒤 새 시드를 고치면 응답의 감액 경계로 분류한다", () => {
    // 응답의 경계로는 감액 $2,000이 오늘 매수에 달린 감액이다
    expect(form({ enteredSeed: 8_000, recheck: RECHECK })).toMatchObject({
      limits: RECHECK.seedCutLimits,
      notice: { kind: "depends" },
      confirmationKind: "depends",
    });
  });
});

describe("seedChangeForm() - 적용 전 변경이 있을 때", () => {
  it("도움말에 지금 시드를 함께 알린다", () => {
    expect(form({ seed: PENDING, enteredSeed: 7_000 }).hint).toBe(
      "지금 시드는 $10,000입니다. 새 시드는 11월 11일(수) 주문표부터 쓰입니다."
    );
  });

  it("지금 시드로 되돌리면 적용 전 변경을 지운다고 알리고, 확인 없이 지금 시드를 보낸다", () => {
    expect(form({ seed: PENDING, enteredSeed: 10_000 })).toMatchObject({
      revertsPending: true,
      notice: null,
      confirmationKind: null,
      request: { seedCapital: 10_000 },
      hint: "지금 시드는 $10,000입니다.",
      revertNote: "저장하면 적용 전 변경을 지우고 지금 시드 $10,000를 그대로 씁니다.",
    });
  });

  it("적용 전 변경 그대로이면 보낼 변경이 없다", () => {
    expect(form({ seed: PENDING, enteredSeed: 8_000 })).toMatchObject({
      request: null,
      revertsPending: false,
      revertNote: null,
      confirmationKind: null,
    });
  });
});

describe("pendingSeedChangeNotice()", () => {
  it("사이클 중 저장한 변경의 안내를 그 적용일로 보인다", () => {
    expect(pendingSeedChangeNotice(PENDING, LIMITS)).toEqual({
      kind: "keep",
      title: "시드를 $2,000 줄입니다 - 사이클은 이어집니다",
      lines: [
        "$2,000 출금은 오늘 주문이 체결된 뒤, 11월 11일(수) 아침 9시 이후에 하세요. 그 전에 빼면 오늘 매수에 쓸 돈이 모자랄 수 있습니다.",
      ],
    });
  });

  it("적용 전 변경이 없거나 사이클 사이이면 안내하지 않는다", () => {
    expect(pendingSeedChangeNotice(SETTLED, LIMITS)).toBeNull();
    expect(pendingSeedChangeNotice(PENDING, null)).toBeNull();
  });
});
