/**
 * 트레이딩 화면 공용 날짜 표시 형식 테스트
 *
 * 저장된 날짜는 시각 없는 "YYYY-MM-DD" 문자열이다.
 * 브라우저의 시간대와 관계없이 저장된 그 날짜가 그대로 보여야 한다.
 */
import { afterEach, describe, it, expect } from "vitest";
import { formatDate, formatLongDate } from "../format";

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
