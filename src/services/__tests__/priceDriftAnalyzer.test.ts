/**
 * priceDriftAnalyzer.ts 단위 테스트
 * 이슈 #42: DB 가격 시계열과 재수집본(전체 히스토리를 새로 내려받은 것)의 불일치 규모 측정
 */
import { describe, it, expect } from "vitest";
import { analyzePriceDrift } from "../priceDriftAnalyzer";
import type { DailyPrice } from "../../types/index";

// 테스트용 가격 행 생성 (기본값은 모든 컬럼 동일가)
function makePrice(date: string, overrides: Partial<DailyPrice> = {}): DailyPrice {
  return {
    date,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    adjClose: 100.5,
    volume: 1000,
    ...overrides,
  };
}

function findColumn(report: ReturnType<typeof analyzePriceDrift>, column: string) {
  const stats = report.columns.find((c) => c.column === column);
  if (!stats) throw new Error(`컬럼 통계 없음: ${column}`);
  return stats;
}

describe("analyzePriceDrift", () => {
  describe("일치하는 시계열", () => {
    it("동일한 시계열은 불일치 0건으로 보고한다", () => {
      const rows = [makePrice("2024-01-02"), makePrice("2024-01-03")];
      const report = analyzePriceDrift(rows, rows);

      expect(report.comparedCount).toBe(2);
      expect(report.dbOnlyDates).toEqual([]);
      expect(report.fetchedOnlyDates).toEqual([]);
      for (const column of report.columns) {
        expect(column.mismatchCount).toBe(0);
        expect(column.mismatchRatio).toBe(0);
        expect(column.maxRelativeError).toBe(0);
        expect(column.meanRelativeError).toBe(0);
      }
      expect(report.adjCloseSegments).toEqual([]);
    });

    it("float4 표현 오차(30.549999...)는 불일치로 잡지 않는다", () => {
      // DB 컬럼이 real(float4)이라 소수점 2자리 값이 표현 오차를 포함해 반환된다
      const dbRows = [
        makePrice("2024-01-02", { adjClose: 30.549999237060547, close: 30.549999237060547 }),
      ];
      const fetchedRows = [makePrice("2024-01-02", { adjClose: 30.55, close: 30.55 })];

      const report = analyzePriceDrift(dbRows, fetchedRows);

      expect(findColumn(report, "adjClose").mismatchCount).toBe(0);
      expect(findColumn(report, "close").mismatchCount).toBe(0);
    });
  });

  describe("adjClose 불일치", () => {
    it("불일치 행 수·비율·상대 오차(최대/평균)를 보고한다", () => {
      // DB 값이 재수집본보다 0.2% 큰 상황 (배당 소급 미반영)
      const fetchedRows = [
        makePrice("2024-01-02", { adjClose: 100 }),
        makePrice("2024-01-03", { adjClose: 200 }),
        makePrice("2024-01-04", { adjClose: 300 }),
      ];
      const dbRows = [
        makePrice("2024-01-02", { adjClose: 100.2 }),
        makePrice("2024-01-03", { adjClose: 200.4 }),
        makePrice("2024-01-04", { adjClose: 300 }), // 일치
      ];

      const report = analyzePriceDrift(dbRows, fetchedRows);
      const adjClose = findColumn(report, "adjClose");

      expect(adjClose.comparedCount).toBe(3);
      expect(adjClose.mismatchCount).toBe(2);
      expect(adjClose.mismatchRatio).toBeCloseTo(2 / 3, 10);
      expect(adjClose.maxRelativeError).toBeCloseTo(0.002, 5);
      expect(adjClose.meanRelativeError).toBeCloseTo(0.002, 5);
    });

    it("연속된 불일치 구간을 세그먼트로 묶고 시작 날짜 경계를 남긴다", () => {
      // 앞 2일만 불일치, 이후 일치 → 세그먼트 1개
      const fetchedRows = [
        makePrice("2024-01-02", { adjClose: 100 }),
        makePrice("2024-01-03", { adjClose: 100 }),
        makePrice("2024-01-04", { adjClose: 100 }),
      ];
      const dbRows = [
        makePrice("2024-01-02", { adjClose: 100.5 }),
        makePrice("2024-01-03", { adjClose: 100.5 }),
        makePrice("2024-01-04", { adjClose: 100 }),
      ];

      const report = analyzePriceDrift(dbRows, fetchedRows);

      expect(report.adjCloseSegments).toHaveLength(1);
      const segment = report.adjCloseSegments[0];
      expect(segment.startDate).toBe("2024-01-02");
      expect(segment.endDate).toBe("2024-01-03");
      expect(segment.rowCount).toBe(2);
      expect(segment.meanRatio).toBeCloseTo(1.005, 5);
    });

    it("비율이 다른 구간은 별도 세그먼트로 나눈다 (배당 경계 추정 근거)", () => {
      // 오래된 구간일수록 미반영 배당이 누적되어 비율이 크다
      const fetchedRows = [
        makePrice("2024-01-02", { adjClose: 100 }),
        makePrice("2024-01-03", { adjClose: 100 }),
        makePrice("2024-01-04", { adjClose: 100 }),
        makePrice("2024-01-05", { adjClose: 100 }),
      ];
      const dbRows = [
        makePrice("2024-01-02", { adjClose: 100.5 }),
        makePrice("2024-01-03", { adjClose: 100.5 }),
        makePrice("2024-01-04", { adjClose: 100.2 }),
        makePrice("2024-01-05", { adjClose: 100.2 }),
      ];

      const report = analyzePriceDrift(dbRows, fetchedRows);

      expect(report.adjCloseSegments).toHaveLength(2);
      expect(report.adjCloseSegments[0].startDate).toBe("2024-01-02");
      expect(report.adjCloseSegments[0].meanRatio).toBeCloseTo(1.005, 5);
      expect(report.adjCloseSegments[1].startDate).toBe("2024-01-04");
      expect(report.adjCloseSegments[1].meanRatio).toBeCloseTo(1.002, 5);
    });

    it("저가 구간의 1센트 반올림 잡음은 세그먼트를 쪼개지 않는다", () => {
      // 진짜 드리프트 ~0.23%가 소수점 2자리에서 6.51/6.52로 번갈아 나타나는 상황
      const fetchedRows = [
        makePrice("2024-01-02", { adjClose: 6.5 }),
        makePrice("2024-01-03", { adjClose: 6.5 }),
        makePrice("2024-01-04", { adjClose: 6.5 }),
        makePrice("2024-01-05", { adjClose: 6.5 }),
      ];
      const dbRows = [
        makePrice("2024-01-02", { adjClose: 6.51 }),
        makePrice("2024-01-03", { adjClose: 6.52 }),
        makePrice("2024-01-04", { adjClose: 6.51 }),
        makePrice("2024-01-05", { adjClose: 6.52 }),
      ];

      const report = analyzePriceDrift(dbRows, fetchedRows);

      expect(report.adjCloseSegments).toHaveLength(1);
      expect(report.adjCloseSegments[0].rowCount).toBe(4);
      expect(report.adjCloseSegments[0].meanRatio).toBeCloseTo(26.06 / 26, 5);
    });

    it("드리프트가 반올림 한계 아래로 내려가 일치한 행이 끼어도 같은 비율이면 세그먼트를 유지한다", () => {
      const fetchedRows = [
        makePrice("2024-01-02", { adjClose: 100 }),
        makePrice("2024-01-03", { adjClose: 100 }),
        makePrice("2024-01-04", { adjClose: 100 }),
      ];
      const dbRows = [
        makePrice("2024-01-02", { adjClose: 100.5 }),
        makePrice("2024-01-03", { adjClose: 100 }), // 일치
        makePrice("2024-01-04", { adjClose: 100.5 }),
      ];

      const report = analyzePriceDrift(dbRows, fetchedRows);

      expect(report.adjCloseSegments).toHaveLength(1);
      expect(report.adjCloseSegments[0].startDate).toBe("2024-01-02");
      expect(report.adjCloseSegments[0].endDate).toBe("2024-01-04");
      expect(report.adjCloseSegments[0].rowCount).toBe(2);
    });
  });

  describe("다른 가격 컬럼", () => {
    it("close 불일치를 adjClose와 독립적으로 보고한다", () => {
      const fetchedRows = [makePrice("2024-01-02", { close: 100, adjClose: 100 })];
      const dbRows = [makePrice("2024-01-02", { close: 250, adjClose: 100 })];

      const report = analyzePriceDrift(dbRows, fetchedRows);

      expect(findColumn(report, "close").mismatchCount).toBe(1);
      expect(findColumn(report, "close").maxRelativeError).toBeCloseTo(1.5, 5);
      expect(findColumn(report, "adjClose").mismatchCount).toBe(0);
    });

    it("open/high/low 컬럼 통계도 포함한다", () => {
      const report = analyzePriceDrift([makePrice("2024-01-02")], [makePrice("2024-01-02")]);
      const columns = report.columns.map((c) => c.column);

      expect(columns).toEqual(["open", "high", "low", "close", "adjClose"]);
    });
  });

  describe("날짜 집합 차이", () => {
    it("한쪽에만 있는 날짜는 비교에서 제외하고 별도로 보고한다", () => {
      const dbRows = [makePrice("2024-01-02"), makePrice("2024-01-03")];
      const fetchedRows = [makePrice("2024-01-03"), makePrice("2024-01-04")];

      const report = analyzePriceDrift(dbRows, fetchedRows);

      expect(report.comparedCount).toBe(1);
      expect(report.dbOnlyDates).toEqual(["2024-01-02"]);
      expect(report.fetchedOnlyDates).toEqual(["2024-01-04"]);
    });

    it("빈 입력은 빈 보고서를 반환한다", () => {
      const report = analyzePriceDrift([], []);

      expect(report.comparedCount).toBe(0);
      expect(report.columns.every((c) => c.mismatchCount === 0)).toBe(true);
      expect(report.adjCloseSegments).toEqual([]);
    });
  });
});
