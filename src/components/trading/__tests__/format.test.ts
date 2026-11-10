/**
 * 트레이딩 화면 공용 날짜 표시 형식 테스트
 *
 * 저장된 날짜는 시각 없는 "YYYY-MM-DD" 문자열이다.
 * 브라우저의 시간대와 관계없이 저장된 그 날짜가 그대로 보여야 한다.
 */
import { afterEach, describe, it, expect } from "vitest";
import { formatDate, formatLongDate, formatMonthDayWithWeekday, formatSeedAmount } from "../format";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe("formatDate", () => {
  it("저장된 날짜를 두 자리 월·일로 보여야 한다", () => {
    expect(formatDate("2026-01-05")).toBe("2026. 01. 05.");
  });

  it("날짜가 없으면 '-'를 보여야 한다", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("UTC보다 늦은 시간대에서도 하루 앞당겨 보이지 않아야 한다", () => {
    process.env.TZ = "America/New_York";

    expect(formatDate("2026-01-05")).toBe("2026. 01. 05.");
  });
});

describe("formatLongDate", () => {
  it("저장된 날짜를 '년 월 일'로 보여야 한다", () => {
    expect(formatLongDate("2026-01-05")).toBe("2026년 1월 5일");
  });

  it("UTC보다 늦은 시간대에서도 하루 앞당겨 보이지 않아야 한다", () => {
    process.env.TZ = "America/New_York";

    expect(formatLongDate("2026-01-05")).toBe("2026년 1월 5일");
  });
});

describe("formatMonthDayWithWeekday", () => {
  it("저장된 날짜를 월·일과 요일로 보여야 한다", () => {
    expect(formatMonthDayWithWeekday("2026-11-11")).toBe("11월 11일(수)");
    expect(formatMonthDayWithWeekday("2026-11-16")).toBe("11월 16일(월)");
  });

  it("UTC보다 늦은 시간대에서도 하루 앞당겨 보이지 않아야 한다", () => {
    process.env.TZ = "America/New_York";

    expect(formatMonthDayWithWeekday("2026-11-11")).toBe("11월 11일(수)");
  });
});

describe("formatSeedAmount", () => {
  it("시드 금액은 센트가 없으면 달러까지만 보여야 한다", () => {
    expect(formatSeedAmount(10_000)).toBe("$10,000");
  });

  it("센트가 있으면 센트까지 보여야 한다", () => {
    expect(formatSeedAmount(65_303.83)).toBe("$65,303.83");
  });

  it("센트가 10의 배수여도 소수 둘째 자리까지 보여야 한다", () => {
    expect(formatSeedAmount(3_000.5)).toBe("$3,000.50");
  });
});
