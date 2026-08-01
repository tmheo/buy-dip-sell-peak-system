/**
 * 마감 스케줄러 정책 테스트 (#80)
 *
 * 거래일 단위 마감 처리(processHistoricalOrders)와 저장 모듈을 대역으로 바꿔,
 * processDailyClose가 소유하는 정책만 검증한다.
 * - 활성 계좌 판정 기간 14일
 * - 계좌별 실패 격리
 * - 시간 예산 50초 초과 시 남은 계좌 이월
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { TradingAccount } from "@/types/trading";

vi.mock("@/database/trading", () => ({
  getActiveTradingAccounts: vi.fn(),
  getTradingAccountByIdWithoutOwnerCheck: vi.fn(),
}));

vi.mock("../execution", () => ({
  processHistoricalOrders: vi.fn(),
}));

import {
  getActiveTradingAccounts,
  getTradingAccountByIdWithoutOwnerCheck,
} from "@/database/trading";

import { processHistoricalOrders } from "../execution";
import { processDailyClose } from "../scheduler";

const mockedGetActiveTradingAccounts = vi.mocked(getActiveTradingAccounts);
const mockedGetTradingAccountById = vi.mocked(getTradingAccountByIdWithoutOwnerCheck);
const mockedProcessHistoricalOrders = vi.mocked(processHistoricalOrders);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 정책 값은 일부러 구현에서 가져오지 않고 여기에 다시 적는다.
 * 값 자체가 검증 대상이므로(#80: 정책 값 불변), 구현을 그대로 참조하면
 * 값이 바뀌어도 테스트가 통과해 버린다.
 */
const TIME_BUDGET_MS = 50_000;
const ACTIVE_WINDOW_DAYS = 14;

/**
 * 고정 기준 시각 (2026-07-15T00:00:00Z). 가짜 시계를 이 값에서 시작해 앞으로만 옮긴다.
 * Date.now뿐 아니라 new Date()도 함께 고정해야 마감 기준일(today)까지 검증할 수 있다.
 */
const START_TIME = Date.UTC(2026, 6, 15);
const TODAY = "2026-07-15";

let clock: number;

/** 가짜 시계를 elapsedMs만큼 앞으로 옮긴다. */
function advanceClock(elapsedMs: number): void {
  clock += elapsedMs;
  vi.setSystemTime(clock);
}

function createAccount(id: string): TradingAccount {
  return {
    id,
    userId: "user-1",
    name: `계좌 ${id}`,
    ticker: "SOXL",
    seedCapital: 100_000,
    strategy: "Pro2",
    cycleStartDate: "2026-07-01",
    cycleNumber: 1,
    lastProcessedDate: "2026-07-13",
    lastViewedAt: "2026-07-14T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

/** 한 계좌 처리에 elapsedMs가 걸리도록 가짜 시계를 진행시킨다. */
function takesTime(elapsedMs: number) {
  return async () => {
    advanceClock(elapsedMs);
    return [];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clock = START_TIME;
  // shouldAdvanceTime을 끄지 않으면 대기 중에 시계가 저절로 흘러 예산 판정이 흔들린다
  vi.useFakeTimers({ now: START_TIME, shouldAdvanceTime: false });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockedProcessHistoricalOrders.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("processDailyClose - 활성 계좌 판정", () => {
  it("최근 14일 안에 조회된 계좌만 처리 대상으로 조회한다", async () => {
    mockedGetActiveTradingAccounts.mockResolvedValue([createAccount("a")]);

    await processDailyClose();

    expect(mockedGetActiveTradingAccounts).toHaveBeenCalledWith(
      new Date(START_TIME - ACTIVE_WINDOW_DAYS * DAY_MS)
    );
    expect(mockedGetTradingAccountById).not.toHaveBeenCalled();
  });

  it("accountId를 지정하면 활동 여부와 무관하게 그 계좌만 처리한다", async () => {
    mockedGetTradingAccountById.mockResolvedValue(createAccount("b"));

    const outcome = await processDailyClose({ accountId: "b" });

    expect(outcome).toMatchObject({ status: "completed", accountCount: 1, processedCount: 1 });
    expect(mockedGetTradingAccountById).toHaveBeenCalledWith("b");
    expect(mockedGetActiveTradingAccounts).not.toHaveBeenCalled();
    expect(mockedProcessHistoricalOrders).toHaveBeenCalledOnce();
    expect(mockedProcessHistoricalOrders.mock.calls[0][0]).toBe("b");
  });

  it("지정한 accountId의 계좌가 없으면 아무것도 처리하지 않고 알린다", async () => {
    mockedGetTradingAccountById.mockResolvedValue(null);

    const outcome = await processDailyClose({ accountId: "missing" });

    expect(outcome).toEqual({ status: "account-not-found", accountId: "missing" });
    expect(mockedProcessHistoricalOrders).not.toHaveBeenCalled();
  });
});

describe("processDailyClose - 계좌별 실패 격리", () => {
  it("한 계좌가 실패해도 나머지 계좌를 계속 처리하고 실패를 결과에 담는다", async () => {
    mockedGetActiveTradingAccounts.mockResolvedValue([
      createAccount("a"),
      createAccount("b"),
      createAccount("c"),
    ]);
    mockedProcessHistoricalOrders
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("가격 데이터 없음"))
      .mockResolvedValueOnce([]);

    const outcome = await processDailyClose();

    expect(outcome).toMatchObject({
      status: "completed",
      accountCount: 3,
      processedCount: 3,
      skippedCount: 0,
      failedCount: 1,
    });
    if (outcome.status !== "completed") return;
    expect(outcome.results).toEqual([
      { accountId: "a", executed: 0 },
      { accountId: "b", executed: 0, error: "가격 데이터 없음" },
      { accountId: "c", executed: 0 },
    ]);
  });

  it("Error가 아닌 값으로 실패해도 결과에 사유를 남긴다", async () => {
    mockedGetActiveTradingAccounts.mockResolvedValue([createAccount("a")]);
    mockedProcessHistoricalOrders.mockRejectedValueOnce("문자열 실패");

    const outcome = await processDailyClose();

    expect(outcome).toMatchObject({ failedCount: 1 });
    if (outcome.status !== "completed") return;
    expect(outcome.results[0].error).toBe("Unknown error");
  });
});

describe("processDailyClose - 시간 예산", () => {
  it("시간 예산을 넘기면 남은 계좌를 처리하지 않고 다음 실행으로 미룬다", async () => {
    mockedGetActiveTradingAccounts.mockResolvedValue([
      createAccount("a"),
      createAccount("b"),
      createAccount("c"),
    ]);
    // 계좌당 30초 - 두 계좌를 처리하면 60초로 50초 예산을 넘긴다
    mockedProcessHistoricalOrders.mockImplementation(takesTime(30_000));

    const outcome = await processDailyClose();

    expect(outcome).toMatchObject({
      status: "completed",
      accountCount: 3,
      processedCount: 2,
      skippedCount: 1,
      failedCount: 0,
    });
    expect(mockedProcessHistoricalOrders).toHaveBeenCalledTimes(2);
  });

  it("실패로 예산을 다 쓴 경우에도 남은 계좌를 미처리로 남긴다", async () => {
    mockedGetActiveTradingAccounts.mockResolvedValue([createAccount("a"), createAccount("b")]);
    mockedProcessHistoricalOrders.mockImplementation(async () => {
      advanceClock(TIME_BUDGET_MS);
      throw new Error("느린 실패");
    });

    const outcome = await processDailyClose();

    expect(outcome).toMatchObject({ processedCount: 1, skippedCount: 1, failedCount: 1 });
  });

  it("거래일 루프가 예산 안에서 멈추도록 마감 시각을 넘긴다", async () => {
    mockedGetActiveTradingAccounts.mockResolvedValue([createAccount("a")]);

    await processDailyClose();

    const [
      accountId,
      cycleStartDate,
      lastProcessedDate,
      today,
      ticker,
      strategy,
      seedCapital,
      deadline,
    ] = mockedProcessHistoricalOrders.mock.calls[0];
    expect(deadline).toBe(START_TIME + TIME_BUDGET_MS);
    expect({
      accountId,
      cycleStartDate,
      lastProcessedDate,
      today,
      ticker,
      strategy,
      seedCapital,
    }).toEqual({
      accountId: "a",
      cycleStartDate: "2026-07-01",
      lastProcessedDate: "2026-07-13",
      today: TODAY,
      ticker: "SOXL",
      strategy: "Pro2",
      seedCapital: 100_000,
    });
  });
});
