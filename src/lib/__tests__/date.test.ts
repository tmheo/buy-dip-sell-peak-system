import { describe, it, expect } from "vitest";
import { getTodayTradingDate } from "../date";

describe("getTodayTradingDate", () => {
  it("실계좌 거래일의 오늘은 로컬 타임존이 아니라 UTC 날짜다", () => {
    // 한국 시각 2026-11-10 08:30은 UTC로 아직 2026-11-09다
    expect(getTodayTradingDate(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-09");
    expect(getTodayTradingDate(new Date("2026-11-10T00:00:00Z"))).toBe("2026-11-10");
  });
});
