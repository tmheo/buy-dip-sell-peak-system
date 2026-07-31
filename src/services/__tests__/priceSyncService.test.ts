/**
 * 가격 시계열 동기화 서비스 테스트 (이슈 #42, ADR-0002)
 *
 * - diffPriceSnapshots: DB 시계열과 원천 스냅샷의 날짜별 대조 (순수 함수)
 * - syncTickerPrices: 전체 히스토리 재페치 → 분할 가드 → 가격 upsert → 지표 전체 재계산
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { DailyPrice } from "@/types/index";

// dataFetcher는 fetchAllHistory만 mock하고 normalizePrice 등은 실제 구현을 쓴다
vi.mock("@/services/dataFetcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataFetcher")>();
  return { ...actual, fetchAllHistory: vi.fn() };
});

vi.mock("@/database/prices", () => ({
  getAllPricesByTicker: vi.fn(),
  upsertDailyPrices: vi.fn(),
}));

vi.mock("@/database/metrics", () => ({
  upsertMetrics: vi.fn(),
}));

vi.mock("@/services/metricsRows", () => ({
  buildDailyMetricRows: vi.fn(),
}));

import { fetchAllHistory } from "@/services/dataFetcher";
import { getAllPricesByTicker, upsertDailyPrices } from "@/database/prices";
import { upsertMetrics } from "@/database/metrics";
import { buildDailyMetricRows } from "@/services/metricsRows";
import { diffPriceSnapshots, syncTickerPrices } from "@/services/priceSyncService";

/** 거래일 흉내: 2020-01-01부터 count개 날짜 생성 */
function makeDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(2020, 0, 1 + i));
    return d.toISOString().split("T")[0];
  });
}

function makePrice(date: string, base: number): DailyPrice {
  return {
    date,
    open: base,
    high: base + 1,
    low: base - 1,
    close: base + 0.5,
    adjClose: base + 0.5,
    volume: 1_000_000,
  };
}

function makeSeries(count: number): DailyPrice[] {
  return makeDates(count).map((date, i) => makePrice(date, 50 + i * 0.1));
}

describe("diffPriceSnapshots", () => {
  it("DB에 없는 날짜는 신규 행으로 분류한다", () => {
    const fetched = makeSeries(5);
    const db = fetched.slice(0, 3);

    const diff = diffPriceSnapshots(db, fetched);

    expect(diff.newRows.map((r) => r.date)).toEqual(fetched.slice(3).map((r) => r.date));
    expect(diff.changedRows).toHaveLength(0);
    expect(diff.guardViolations).toHaveLength(0);
    expect(diff.dbOnlyDates).toHaveLength(0);
  });

  it("배당식 소급 조정(adjClose만 일괄 변경)을 변경 행으로 잡고 가드는 발동하지 않는다", () => {
    const db = makeSeries(10);
    // 과거 6행의 adjClose가 0.4% 하향 조정된 재수집본 (배당 미반영 드리프트 해소 상황)
    const fetched = db.map((row, i) =>
      i < 6 ? { ...row, adjClose: row.adjClose * 0.996 } : { ...row }
    );

    const diff = diffPriceSnapshots(db, fetched);

    expect(diff.changedRows).toHaveLength(6);
    expect(diff.changedColumnCounts.adjClose).toBe(6);
    expect(diff.changedColumnCounts.close).toBe(0);
    expect(diff.guardViolations).toHaveLength(0);
  });

  it("소수점 2자리 정규화 후 같은 값은 변경으로 잡지 않는다 (float4 표현 오차)", () => {
    const db = [{ ...makePrice("2020-01-01", 50), adjClose: 50.50000191 }];
    const fetched = [{ ...makePrice("2020-01-01", 50), adjClose: 50.5 }];

    const diff = diffPriceSnapshots(db, fetched);

    expect(diff.changedRows).toHaveLength(0);
  });

  it("close가 5% 초과로 소급 변경되면 가드 위반으로 보고한다 (분할 의심)", () => {
    const db = makeSeries(10);
    // 2:1 분할처럼 과거 close가 반토막 난 재수집본
    const fetched = db.map((row, i) =>
      i < 5 ? { ...row, close: row.close / 2, adjClose: row.adjClose / 2 } : { ...row }
    );

    const diff = diffPriceSnapshots(db, fetched);

    expect(diff.guardViolations).toHaveLength(5);
    expect(diff.guardViolations[0]).toMatchObject({ date: db[0].date });
    expect(diff.guardViolations[0].changeRatio).toBeCloseTo(0.5, 5);
  });

  it("close 5% 이내 변경은 가드를 발동하지 않는다", () => {
    const db = [makePrice("2020-01-01", 50)];
    const fetched = [{ ...db[0], close: db[0].close * 1.04 }];

    const diff = diffPriceSnapshots(db, fetched);

    expect(diff.guardViolations).toHaveLength(0);
    expect(diff.changedColumnCounts.close).toBe(1);
  });

  it("volume 변경도 컬럼별 변경 수에 포함한다", () => {
    const db = [makePrice("2020-01-01", 50)];
    const fetched = [{ ...db[0], volume: db[0].volume + 100 }];

    const diff = diffPriceSnapshots(db, fetched);

    expect(diff.changedRows).toHaveLength(1);
    expect(diff.changedColumnCounts.volume).toBe(1);
  });

  it("재수집본에 없는 DB 날짜는 dbOnlyDates로 보고한다", () => {
    const db = makeSeries(5);
    const fetched = db.slice(1);

    const diff = diffPriceSnapshots(db, fetched);

    expect(diff.dbOnlyDates).toEqual([db[0].date]);
  });
});

describe("syncTickerPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(upsertDailyPrices).mockResolvedValue(undefined);
    vi.mocked(upsertMetrics).mockResolvedValue(undefined);
    vi.mocked(buildDailyMetricRows).mockReturnValue([]);
  });

  it("배당식 소급 조정을 흡수한다: 신규+변경 행만 ticker를 붙여 upsert한다", async () => {
    const db = makeSeries(70);
    const adjusted = db.map((row, i) =>
      i < 30 ? { ...row, adjClose: row.adjClose * 0.996 } : { ...row }
    );
    const fetched = [...adjusted, makePrice("2020-03-15", 60)];
    vi.mocked(fetchAllHistory).mockResolvedValue(fetched);
    vi.mocked(getAllPricesByTicker).mockResolvedValue(db as never);

    const summary = await syncTickerPrices("SOXL");

    expect(summary.status).toBe("synced");
    expect(summary.newPriceRows).toBe(1);
    expect(summary.changedPriceRows).toBe(30);

    // upsert 대상은 신규 1 + 변경 30 = 31행이고 전부 ticker가 붙는다
    expect(upsertDailyPrices).toHaveBeenCalledTimes(1);
    const upserted = vi.mocked(upsertDailyPrices).mock.calls[0][0];
    expect(upserted).toHaveLength(31);
    expect(upserted.every((r) => r.ticker === "SOXL")).toBe(true);

    // 변경 행은 재수집본 값으로 upsert되어 DB가 원천 스냅샷과 일치하게 된다
    const changed = upserted.find((r) => r.date === db[0].date);
    expect(changed?.adjClose).toBe(fetched[0].adjClose);
  });

  it("지표는 원천 스냅샷 전체 구간(MA60 최소 인덱스부터 끝까지)을 재계산해 upsert한다", async () => {
    const fetched = makeSeries(100);
    vi.mocked(fetchAllHistory).mockResolvedValue(fetched);
    vi.mocked(getAllPricesByTicker).mockResolvedValue(fetched as never);
    const metricRows = [
      {
        ticker: "SOXL",
        date: fetched[99].date,
        ma20: 1,
        ma60: 1,
        maSlope: 1,
        disparity: 1,
        rsi14: 1,
        roc12: 1,
        volatility20: 1,
        goldenCross: 1,
        isGoldenCross: true,
      },
    ];
    vi.mocked(buildDailyMetricRows).mockReturnValue(metricRows);

    const summary = await syncTickerPrices("SOXL");

    expect(buildDailyMetricRows).toHaveBeenCalledWith(
      fetched.map((p) => p.adjClose),
      fetched.map((p) => p.date),
      "SOXL",
      59,
      99
    );
    expect(upsertMetrics).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertMetrics).mock.calls[0][0]).toHaveLength(1);
    expect(summary.upsertedMetrics).toBe(1);
  });

  it("close 5% 초과 변경 시 해당 티커에 어떤 쓰기도 하지 않고 가드 발동으로 보고한다", async () => {
    const db = makeSeries(70);
    const fetched = db.map((row, i) =>
      i < 30 ? { ...row, close: row.close / 2, adjClose: row.adjClose / 2 } : { ...row }
    );
    vi.mocked(fetchAllHistory).mockResolvedValue(fetched);
    vi.mocked(getAllPricesByTicker).mockResolvedValue(db as never);

    const summary = await syncTickerPrices("SOXL");

    expect(summary.status).toBe("guard-triggered");
    expect(summary.guardViolations.length).toBe(30);
    expect(upsertDailyPrices).not.toHaveBeenCalled();
    expect(upsertMetrics).not.toHaveBeenCalled();
    expect(buildDailyMetricRows).not.toHaveBeenCalled();
  });

  it("bypassCloseGuard 옵션이 있으면 가드 위반을 보고만 하고 쓰기를 진행한다 (분할 런북용)", async () => {
    const db = makeSeries(70);
    const fetched = db.map((row) => ({ ...row, close: row.close / 2, adjClose: row.adjClose / 2 }));
    vi.mocked(fetchAllHistory).mockResolvedValue(fetched);
    vi.mocked(getAllPricesByTicker).mockResolvedValue(db as never);

    const summary = await syncTickerPrices("SOXL", { bypassCloseGuard: true });

    expect(summary.status).toBe("synced");
    expect(summary.guardViolations.length).toBe(70);
    expect(upsertDailyPrices).toHaveBeenCalledTimes(1);
  });

  it("DB가 비어 있으면(최초 적재) 전체 행을 신규로 upsert한다", async () => {
    const fetched = makeSeries(70);
    vi.mocked(fetchAllHistory).mockResolvedValue(fetched);
    vi.mocked(getAllPricesByTicker).mockResolvedValue([] as never);

    const summary = await syncTickerPrices("SOXL");

    expect(summary.status).toBe("synced");
    expect(summary.newPriceRows).toBe(70);
    expect(vi.mocked(upsertDailyPrices).mock.calls[0][0]).toHaveLength(70);
  });

  it("재수집본에 없는 DB 날짜가 유지되면 upsert 후 DB 시계열을 다시 읽어 지표를 계산한다", async () => {
    const fetched = makeSeries(70);
    // DB에는 재수집본에 없는 날짜가 하나 더 있다 (원천의 일시적 결손)
    const dbExtra = makePrice("2020-03-15", 60);
    const db = [...fetched, dbExtra];
    vi.mocked(getAllPricesByTicker)
      .mockResolvedValueOnce(db as never) // diff 계산용 1차 조회
      .mockResolvedValueOnce(db as never); // 지표 계산용 재조회 (upsert 후 DB 시계열)

    vi.mocked(fetchAllHistory).mockResolvedValue(fetched);

    const summary = await syncTickerPrices("SOXL");

    expect(summary.dbOnlyDates).toEqual([dbExtra.date]);
    // 지표는 재수집본이 아니라 유지된 날짜를 포함한 DB 시계열로 계산된다
    expect(getAllPricesByTicker).toHaveBeenCalledTimes(2);
    expect(buildDailyMetricRows).toHaveBeenCalledWith(
      db.map((p) => p.adjClose),
      db.map((p) => p.date),
      "SOXL",
      59,
      db.length - 1
    );
  });

  it("변경도 신규도 없으면 가격 upsert를 건너뛰지만 지표는 재계산한다", async () => {
    const fetched = makeSeries(70);
    vi.mocked(fetchAllHistory).mockResolvedValue(fetched);
    vi.mocked(getAllPricesByTicker).mockResolvedValue(fetched as never);

    await syncTickerPrices("SOXL");

    expect(upsertDailyPrices).not.toHaveBeenCalled();
    expect(buildDailyMetricRows).toHaveBeenCalledTimes(1);
  });

  it("재수집본이 비어 있으면 에러를 던진다 (원천 이상 시 잘못된 미러링 방지)", async () => {
    vi.mocked(fetchAllHistory).mockResolvedValue([]);

    await expect(syncTickerPrices("SOXL")).rejects.toThrow(/빈 히스토리/);
    expect(getAllPricesByTicker).not.toHaveBeenCalled();
    expect(upsertDailyPrices).not.toHaveBeenCalled();
  });

  it("페치가 일시적으로 실패하면 재시도 후 이어서 동기화한다", async () => {
    vi.useFakeTimers();
    const fetched = makeSeries(70);
    vi.mocked(fetchAllHistory)
      .mockRejectedValueOnce(new Error("일시적 네트워크 오류"))
      .mockResolvedValue(fetched);
    vi.mocked(getAllPricesByTicker).mockResolvedValue([] as never);

    const promise = syncTickerPrices("SOXL");
    await vi.advanceTimersByTimeAsync(1000);
    const summary = await promise;

    expect(summary.status).toBe("synced");
    expect(fetchAllHistory).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("페치가 3회 모두 실패하면 에러를 던지고 DB에는 접근하지 않는다", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchAllHistory).mockRejectedValue(new Error("네트워크 불통"));

    const promise = syncTickerPrices("SOXL");
    const expectation = expect(promise).rejects.toThrow("네트워크 불통");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await expectation;

    expect(fetchAllHistory).toHaveBeenCalledTimes(3);
    expect(getAllPricesByTicker).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
