import { describe, it, expect } from "vitest";
import { getNextWeekday, getTodayTradingDate, isWeekday } from "../date";

describe("getTodayTradingDate", () => {
  it("실계좌 거래일의 오늘은 로컬 타임존이 아니라 UTC 날짜다", () => {
    // 한국 시각 2026-11-10 08:30은 UTC로 아직 2026-11-09다
    expect(getTodayTradingDate(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-09");
    expect(getTodayTradingDate(new Date("2026-11-10T00:00:00Z"))).toBe("2026-11-10");
  });
});

describe("getNextWeekday", () => {
  it("다음 날이 평일이면 그날이다", () => {
    expect(getNextWeekday("2026-11-10")).toBe("2026-11-11"); // 화 → 수
  });

  it("금요일과 주말의 다음 평일은 월요일이다", () => {
    expect(getNextWeekday("2026-11-13")).toBe("2026-11-16"); // 금 → 월
    expect(getNextWeekday("2026-11-14")).toBe("2026-11-16"); // 토 → 월
    expect(getNextWeekday("2026-11-15")).toBe("2026-11-16"); // 일 → 월
  });

  it("달과 해가 바뀌어도 날짜로 센다", () => {
    expect(getNextWeekday("2026-12-31")).toBe("2027-01-01"); // 목 → 금
  });
});

describe("isWeekday", () => {
  it("월요일부터 금요일까지는 평일이다", () => {
    expect(isWeekday("2026-11-09")).toBe(true); // 월
    expect(isWeekday("2026-11-13")).toBe(true); // 금
  });

  it("토요일과 일요일은 평일이 아니다", () => {
    expect(isWeekday("2026-11-14")).toBe(false); // 토
    expect(isWeekday("2026-11-15")).toBe(false); // 일
  });
});
