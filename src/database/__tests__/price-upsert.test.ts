/**
 * 가격/지표 upsert 통합 테스트 (이슈 #42, ADR-0002)
 *
 * 로컬 Supabase가 필요합니다:
 * DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npx vitest run ...
 *
 * 배당식 소급 조정(기존 행의 adjClose 일괄 변경)이 upsert로 실제 DB에
 * 반영되는지, 즉 동기화 후 DB 시계열이 페치본과 일치하는지 검증합니다.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// 테스트 전용 티커 (실데이터와 충돌 방지)
const TEST_TICKER = "TEST-UPSERT";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("가격/지표 upsert 통합 테스트", () => {
  let db: typeof import("../db-drizzle").db;
  let schema: typeof import("../schema/index");
  let pricesModule: typeof import("../prices");
  let metricsModule: typeof import("../metrics");

  beforeAll(async () => {
    db = (await import("../db-drizzle")).db;
    schema = await import("../schema/index");
    pricesModule = await import("../prices");
    metricsModule = await import("../metrics");

    await db.delete(schema.dailyPrices).where(eq(schema.dailyPrices.ticker, TEST_TICKER));
    await db.delete(schema.dailyMetrics).where(eq(schema.dailyMetrics.ticker, TEST_TICKER));
  });

  afterAll(async () => {
    await db.delete(schema.dailyPrices).where(eq(schema.dailyPrices.ticker, TEST_TICKER));
    await db.delete(schema.dailyMetrics).where(eq(schema.dailyMetrics.ticker, TEST_TICKER));
  });

  it("upsertDailyPrices: 신규 삽입 후 소급 조정 값으로 기존 행을 갱신한다", async () => {
    const initial = [
      {
        ticker: TEST_TICKER,
        date: "2020-01-02",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        adjClose: 10.5,
        volume: 100,
      },
      {
        ticker: TEST_TICKER,
        date: "2020-01-03",
        open: 10.5,
        high: 11.5,
        low: 9.5,
        close: 11,
        adjClose: 11,
        volume: 200,
      },
    ];
    await pricesModule.upsertDailyPrices(initial);

    // 배당식 소급 조정: 기존 행 adjClose 하향 + 신규 행 1건
    const adjusted = [
      { ...initial[0], adjClose: 10.46 },
      { ...initial[1], adjClose: 10.96, volume: 250 },
      {
        ticker: TEST_TICKER,
        date: "2020-01-06",
        open: 11,
        high: 12,
        low: 10,
        close: 11.5,
        adjClose: 11.5,
        volume: 300,
      },
    ];
    await pricesModule.upsertDailyPrices(adjusted);

    const rows = await pricesModule.getAllPricesByTicker(TEST_TICKER);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => ({ date: r.date, adjClose: r.adjClose, volume: r.volume }))).toEqual([
      { date: "2020-01-02", adjClose: 10.46, volume: 100 },
      { date: "2020-01-03", adjClose: 10.96, volume: 250 },
      { date: "2020-01-06", adjClose: 11.5, volume: 300 },
    ]);
  });

  it("upsertMetrics: 배치 upsert가 기존 지표 행을 갱신한다", async () => {
    const initial = [
      {
        ticker: TEST_TICKER,
        date: "2020-01-02",
        ma20: 10,
        ma60: 9,
        maSlope: 1,
        disparity: 2,
        rsi14: 50,
        roc12: 3,
        volatility20: 4,
        goldenCross: 5,
        isGoldenCross: true,
      },
      {
        ticker: TEST_TICKER,
        date: "2020-01-03",
        ma20: 11,
        ma60: 10,
        maSlope: 1,
        disparity: 2,
        rsi14: 51,
        roc12: 3,
        volatility20: 4,
        goldenCross: 5,
        isGoldenCross: true,
      },
    ];
    await metricsModule.upsertMetrics(initial);

    const recalculated = initial.map((m) => ({
      ...m,
      ma20: (m.ma20 ?? 0) - 0.5,
      isGoldenCross: false,
    }));
    await metricsModule.upsertMetrics(recalculated);

    const rows = await metricsModule.getMetricsRange(TEST_TICKER, "2020-01-01", "2020-01-31");
    expect(rows).toHaveLength(2);
    expect(
      rows.map((r) => ({ date: r.date, ma20: r.ma20, isGoldenCross: r.isGoldenCross }))
    ).toEqual([
      { date: "2020-01-02", ma20: 9.5, isGoldenCross: false },
      { date: "2020-01-03", ma20: 10.5, isGoldenCross: false },
    ]);
  });
});
