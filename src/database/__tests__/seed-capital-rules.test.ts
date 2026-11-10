/**
 * 시드 이력 규칙 테스트 (ADR-0005, #116)
 *
 * 시드는 적용일이 붙은 이력으로 남는다. 이 파일은 DB 없이 이력을 읽고 바꾸는 규칙만 본다.
 * - 어느 날 D의 시드 = 적용일이 D 이하인 가장 최근 줄, 없으면 첫 줄
 * - 바꾼 시드의 적용일 = 바꾼 날(서버 UTC 날짜)의 다음 평일
 * - 적용 전 줄은 많아야 하나이고, 새 변경이 덮어쓴다. 지금 시드로 되돌리면 지운다.
 *
 * 날짜: 2026-11-10은 화요일, 2026-11-13은 금요일, 2026-11-16은 월요일이다.
 */
import { describe, it, expect } from "vitest";

import { changeSeedHistory, seedCapitalOn, seedStatus } from "../trading/seed-capital";

/** 2026-11-02에 $10,000로 만든 계좌의 이력 */
const CREATED = [{ effectiveDate: "2026-11-02", seedCapital: 10_000 }];

describe("seedCapitalOn", () => {
  it("적용일이 그날 이하인 가장 최근 줄의 시드다", () => {
    const history = [
      { effectiveDate: "2026-11-02", seedCapital: 10_000 },
      { effectiveDate: "2026-11-05", seedCapital: 3_000 },
      { effectiveDate: "2026-11-09", seedCapital: 8_000 },
    ];

    expect(seedCapitalOn(history, "2026-11-04")).toBe(10_000);
    expect(seedCapitalOn(history, "2026-11-05")).toBe(3_000);
    expect(seedCapitalOn(history, "2026-11-06")).toBe(3_000);
    expect(seedCapitalOn(history, "2026-11-20")).toBe(8_000);
  });

  it("첫 변경 전의 모든 날짜에는 첫 시드가 쓰인다 - 계좌를 만든 날보다 앞선 사이클 시작일에도", () => {
    const history = [
      { effectiveDate: "2026-11-05", seedCapital: 3_000 },
      { effectiveDate: "2026-11-02", seedCapital: 10_000 },
    ];

    expect(seedCapitalOn(history, "2026-10-01")).toBe(10_000);
  });

  it("이력이 없으면 던진다 - 계좌는 만들 때 첫 줄을 쓴다", () => {
    expect(() => seedCapitalOn([], "2026-11-10")).toThrow();
  });
});

describe("changeSeedHistory", () => {
  it("오늘 바꾼 시드는 오늘 주문표에 쓰이지 않고 다음 평일 주문표부터 쓰인다", () => {
    const history = changeSeedHistory(CREATED, 3_000, "2026-11-10");

    expect(seedCapitalOn(history, "2026-11-10")).toBe(10_000);
    expect(seedCapitalOn(history, "2026-11-11")).toBe(3_000);
  });

  it("금요일과 주말에 바꾼 시드는 월요일부터 쓰인다 - 휴장일은 알 수 없어 주말만 건너뛴다", () => {
    for (const today of ["2026-11-13", "2026-11-14", "2026-11-15"]) {
      expect(changeSeedHistory(CREATED, 3_000, today)).toEqual([
        ...CREATED,
        { effectiveDate: "2026-11-16", seedCapital: 3_000 },
      ]);
    }
  });

  it("적용 전 변경이 있으면 새 변경이 덮어쓴다 - 한 번도 쓰이지 않은 값은 남기지 않는다", () => {
    const pending = changeSeedHistory(CREATED, 3_000, "2026-11-10");

    expect(changeSeedHistory(pending, 5_000, "2026-11-10")).toEqual([
      ...CREATED,
      { effectiveDate: "2026-11-11", seedCapital: 5_000 },
    ]);
  });

  it("지금 적용 중인 시드로 바꾸면 적용 전 변경만 지운다(되돌리기)", () => {
    const pending = changeSeedHistory(CREATED, 3_000, "2026-11-10");

    expect(changeSeedHistory(pending, 10_000, "2026-11-10")).toEqual(CREATED);
  });

  it("적용 전 변경 없이 지금 시드를 다시 보내면 아무것도 바뀌지 않는다", () => {
    expect(changeSeedHistory(CREATED, 10_000, "2026-11-10")).toEqual(CREATED);
  });

  it("이미 적용된 줄은 고치지 않는다", () => {
    const applied = [...CREATED, { effectiveDate: "2026-11-05", seedCapital: 3_000 }];

    expect(changeSeedHistory(applied, 10_000, "2026-11-10")).toEqual([
      ...applied,
      { effectiveDate: "2026-11-11", seedCapital: 10_000 },
    ]);
  });
});

describe("seedStatus", () => {
  it("적용 전 변경이 있으면 지금 시드와 함께 그 변경과 적용일을 보인다", () => {
    const history = changeSeedHistory(CREATED, 3_000, "2026-11-10");

    expect(seedStatus(history, "2026-11-10", "2026-11-09")).toEqual({
      current: 10_000,
      pending: { seedCapital: 3_000, effectiveDate: "2026-11-11" },
      appliedToday: null,
    });
  });

  it("적용일에는 새 시드가 오늘 처음 적용됐다고 보인다", () => {
    const history = changeSeedHistory(CREATED, 3_000, "2026-11-10");

    expect(seedStatus(history, "2026-11-11", "2026-11-10")).toEqual({
      current: 3_000,
      pending: null,
      appliedToday: { previous: 10_000, current: 3_000 },
    });
    // 그다음 거래일에는 직전 거래일에도 새 시드였다
    expect(seedStatus(history, "2026-11-12", "2026-11-11").appliedToday).toBeNull();
  });

  it("적용일이 휴장일이면 그다음 거래일이 실제 첫 적용일이다", () => {
    // 금요일에 바꿔 적용일이 월요일(2026-11-16)인데 그날이 휴장이라 가격 행이 없다
    const history = changeSeedHistory(CREATED, 3_000, "2026-11-13");

    // 화요일의 직전 거래일(가격 행 기준)은 금요일이다
    expect(seedStatus(history, "2026-11-17", "2026-11-13").appliedToday).toEqual({
      previous: 10_000,
      current: 3_000,
    });
  });

  it("직전 거래일을 모르면(가격 행이 없으면) 오늘 적용 여부를 보이지 않는다", () => {
    const history = changeSeedHistory(CREATED, 3_000, "2026-11-10");

    expect(seedStatus(history, "2026-11-11", null).appliedToday).toBeNull();
  });

  it("같은 시드로 바뀐 줄은 새로 적용됐다고 보지 않는다", () => {
    const history = [...CREATED, { effectiveDate: "2026-11-11", seedCapital: 10_000 }];

    expect(seedStatus(history, "2026-11-11", "2026-11-10").appliedToday).toBeNull();
  });
});
