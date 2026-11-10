/**
 * 사이클 중 시드를 바꿀 때 설정 카드가 보일 안내 테스트 (#119, ADR-0004, ADR-0006)
 *
 * - 입력은 새 시드다. 입금·출금할 금액과 그 시점은 안내 문구가 알려 준다.
 * - 시드 변경 분류(증액, 이어감, 오늘 매수에 달림, 사이클 끝)는 src/strategy의 classifySeedChange가
 *   정한다 - 이 안내는 그 함수로 분류해 문장을 만들 뿐 규칙을 다시 계산하지 않는다.
 * - 새 시드가 쓰이기 시작하는 날과 오늘 주문표의 시드는 시드 칸의 도움말과 주문표 위 문장이
 *   알려 주므로 이 안내는 되풀이하지 않는다.
 */
import { describe, it, expect } from "vitest";
import {
  cutZoneBar,
  cycleEndConfirmation,
  seedChangeColor,
  seedChangeNotice,
} from "../seed-change-notices";

/** 지금 시드 $10,000, 직전 마감 예수금 $5,000, 오늘 매수가 체결되면 예수금 $2,345.67 */
const LIMITS = { closedCash: 5_000, cashIfTodayBuyFills: 2_345.67 };
const EFFECTIVE_DATE = "2026-11-11";

describe("seedChangeNotice()", () => {
  it("증액이면 차액을 언제든 입금하라고 한다", () => {
    expect(
      seedChangeNotice({
        currentSeed: 10_000,
        newSeed: 12_000,
        limits: LIMITS,
        effectiveDate: EFFECTIVE_DATE,
      })
    ).toEqual({
      kind: "increase",
      title: "시드를 $2,000 늘립니다",
      lines: ["증권사 계좌에 $2,000를 입금하세요. 입금은 언제 해도 됩니다."],
    });
  });

  it("예수금 이내의 감액이면 오늘 주문이 체결된 뒤, 적용일 아침 9시 이후에 출금하라고 한다", () => {
    expect(
      seedChangeNotice({
        currentSeed: 10_000,
        newSeed: 8_000,
        limits: LIMITS,
        effectiveDate: EFFECTIVE_DATE,
      })
    ).toEqual({
      kind: "keep",
      title: "시드를 $2,000 줄입니다 - 사이클은 이어집니다",
      lines: [
        "$2,000 출금은 오늘 주문이 체결된 뒤, 11월 11일(수) 아침 9시 이후에 하세요. 그 전에 빼면 오늘 매수에 쓸 돈이 모자랄 수 있습니다.",
      ],
    });
  });

  it("오늘 매수에 달린 감액이면 체결되면 적용일에 모두 팔고 끝나고, 아니면 이어지며, 출금은 적용일 아침에 안내한다고 한다", () => {
    expect(
      seedChangeNotice({
        currentSeed: 10_000,
        newSeed: 6_000,
        limits: LIMITS,
        effectiveDate: EFFECTIVE_DATE,
      })
    ).toEqual({
      kind: "depends",
      title: "시드를 $4,000 줄입니다 - 오늘 매수가 체결되면 사이클이 끝납니다",
      lines: [
        "오늘 매수가 체결되면 예수금이 $2,345.67로 줄어 감액이 예수금보다 커집니다.",
        "그러면 11월 11일(수)에 매수 없이 보유 티어를 모두 MOC로 팔고 사이클이 끝납니다. 체결되지 않으면 사이클은 이어집니다.",
        "어느 쪽인지는 11월 11일(수) 아침에 확정됩니다. 출금할 금액은 그때 안내합니다.",
      ],
    });
  });

  it("사이클을 끝내는 감액이면 적용일에 모두 MOC로 팔고 그다음 거래일부터 새 시드로 다음 사이클을 시작하며, 출금할 금액은 매도가 체결된 뒤 알린다고 한다", () => {
    expect(
      seedChangeNotice({
        currentSeed: 10_000,
        newSeed: 3_000,
        limits: LIMITS,
        effectiveDate: EFFECTIVE_DATE,
      })
    ).toEqual({
      kind: "ends",
      title: "시드를 $7,000 줄입니다 - 사이클이 끝납니다",
      lines: [
        "감액이 직전 마감 예수금 $5,000.00보다 큽니다.",
        "11월 11일(수)에 매수 없이 보유 티어를 모두 MOC로 팔고 사이클이 끝납니다. 그다음 거래일부터 새 시드 $3,000로 다음 사이클을 시작합니다.",
        "출금할 금액은 매도 가격에 달려 있어 매도가 체결된 뒤 알려 드립니다.",
      ],
    });
  });

  it("새 시드가 지금 시드와 같으면 입금도 출금도 없으니 안내하지 않는다", () => {
    expect(
      seedChangeNotice({
        currentSeed: 10_000,
        newSeed: 10_000,
        limits: LIMITS,
        effectiveDate: EFFECTIVE_DATE,
      })
    ).toBeNull();
  });
});

describe("cutZoneBar()", () => {
  // 줄일 수 있는 금액은 지금 시드 $10,000에서 최소 시드 $2,000까지 $8,000이다
  const BAR_LIMITS = { closedCash: 5_000, cashIfTodayBuyFills: 2_000 };

  it("줄일 수 있는 금액 전체를 감액 경계로 나눠 시드 변경 분류마다 칸을 두고, 입력한 감액의 위치를 표시한다", () => {
    expect(cutZoneBar(10_000, 6_000, BAR_LIMITS)).toEqual({
      zones: [
        { kind: "keep", percent: 25, label: "감액 $2,000.00까지 이어감" },
        { kind: "depends", percent: 37.5, label: "감액 $5,000.00까지 오늘 매수에 달림" },
        { kind: "ends", percent: 37.5, label: "그보다 크면 사이클 끝" },
      ],
      markerPercent: 50,
    });
  });

  it("오늘 체결될 매수가 없어 두 경계가 같으면 오늘 매수에 달림 칸을 보이지 않는다", () => {
    const noBuyToday = { closedCash: 5_000, cashIfTodayBuyFills: 5_000 };
    expect(cutZoneBar(10_000, 3_000, noBuyToday)).toEqual({
      zones: [
        { kind: "keep", percent: 62.5, label: "감액 $5,000.00까지 이어감" },
        { kind: "ends", percent: 37.5, label: "그보다 크면 사이클 끝" },
      ],
      markerPercent: 87.5,
    });
  });

  it("직전 마감 예수금이 줄일 수 있는 금액보다 크면 사이클 끝 칸이 없다", () => {
    const richCash = { closedCash: 9_000, cashIfTodayBuyFills: 4_000 };
    expect(cutZoneBar(10_000, 2_000, richCash)).toEqual({
      zones: [
        { kind: "keep", percent: 50, label: "감액 $4,000.00까지 이어감" },
        { kind: "depends", percent: 50, label: "감액 $9,000.00까지 오늘 매수에 달림" },
      ],
      markerPercent: 100,
    });
  });
});

describe("cycleEndConfirmation()", () => {
  it("사이클을 끝내는 감액은 적용일에 모두 팔고 끝내는 것을 확인받는다", () => {
    expect(cycleEndConfirmation("ends", EFFECTIVE_DATE)).toBe(
      "11월 11일(수)에 보유 티어를 모두 팔고 사이클을 끝내는 것을 확인했습니다."
    );
  });

  it("오늘 매수에 달린 감액은 체결되면 적용일에 모두 팔고 끝날 수 있음을 확인받는다", () => {
    expect(cycleEndConfirmation("depends", EFFECTIVE_DATE)).toBe(
      "오늘 매수가 체결되면 11월 11일(수)에 보유 티어를 모두 팔고 사이클이 끝날 수 있음을 확인했습니다."
    );
  });
});

describe("seedChangeColor()", () => {
  it("시드 변경 분류마다 막대 칸과 안내에 같은 Bootstrap 색을 쓴다", () => {
    expect(seedChangeColor("increase")).toBe("info");
    expect(seedChangeColor("keep")).toBe("success");
    expect(seedChangeColor("depends")).toBe("warning");
    expect(seedChangeColor("ends")).toBe("danger");
  });
});
