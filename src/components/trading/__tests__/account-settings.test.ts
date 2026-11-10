/**
 * 계좌 설정 카드의 편집 규칙 테스트 (#112)
 *
 * - 운용 시작일은 첫 일일 마감 전(lastProcessedDate가 null)에만 편집할 수 있다.
 * - 고른 전략이 지금 전략과 다르면 경고 문장을 보인다. 저장은 막지 않는다.
 */
import { describe, it, expect } from "vitest";
import { canEditTradingStartDate, strategyChangeWarning } from "../account-settings";

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
