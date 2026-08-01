/**
 * 주문표 신선도 정책 테스트 (#80)
 *
 * 저장 모듈을 대역으로 바꿔, getOrCreateDailyOrders가 소유하는 판정만 검증한다.
 * - 미체결 주문은 계좌 설정 변경 또는 더 최신 가격 적재 시 재생성한다
 * - 체결된 주문이 하나라도 있으면 재생성하지 않는다
 * - regenerate는 판정 없이 무조건 재생성한다
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { DailyOrder, TradingAccount } from "@/types/trading";

vi.mock("@/database/trading", () => ({
  deleteDailyOrders: vi.fn(),
  getDailyOrders: vi.fn(),
  getTierHoldings: vi.fn(),
  hasNewerPriceSince: vi.fn(),
  getPreviousTradingClose: vi.fn(),
  listTradingDatesBetween: vi.fn(),
  replaceDailyOrders: vi.fn(),
}));

import {
  deleteDailyOrders,
  getDailyOrders,
  getTierHoldings,
  hasNewerPriceSince,
  getPreviousTradingClose,
  replaceDailyOrders,
} from "@/database/trading";

import { getOrCreateDailyOrders } from "../orders";

const mockedDeleteDailyOrders = vi.mocked(deleteDailyOrders);
const mockedGetDailyOrders = vi.mocked(getDailyOrders);
const mockedGetTierHoldings = vi.mocked(getTierHoldings);
const mockedHasNewerPriceSince = vi.mocked(hasNewerPriceSince);
const mockedGetPreviousTradingClose = vi.mocked(getPreviousTradingClose);
const mockedReplaceDailyOrders = vi.mocked(replaceDailyOrders);

const ACCOUNT_ID = "account-1";
const DATE = "2026-07-15";

/** 주문 생성 시각 기준선. 계좌 수정 시각을 이 앞뒤로 두어 판정을 가른다. */
const ORDER_CREATED_AT = "2026-07-15T00:10:00.000Z";

function createAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: ACCOUNT_ID,
    userId: "user-1",
    name: "테스트 계좌",
    ticker: "SOXL",
    seedCapital: 100_000,
    strategy: "Pro2",
    cycleStartDate: "2026-07-01",
    cycleNumber: 1,
    lastProcessedDate: "2026-07-14",
    lastViewedAt: "2026-07-15T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function createOrder(overrides: Partial<DailyOrder> = {}): DailyOrder {
  return {
    id: "order-1",
    accountId: ACCOUNT_ID,
    date: DATE,
    tier: 1,
    type: "BUY",
    orderMethod: "LOC",
    limitPrice: 50,
    shares: 100,
    executed: false,
    createdAt: ORDER_CREATED_AT,
    updatedAt: ORDER_CREATED_AT,
    ...overrides,
  };
}

/** 재생성 여부를 눈에 보이게 하는 표식. 생성 경로를 탔을 때만 반환된다. */
const REGENERATED: DailyOrder[] = [createOrder({ id: "regenerated", limitPrice: 49 })];

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetTierHoldings.mockResolvedValue([]);
  mockedGetPreviousTradingClose.mockResolvedValue({ date: "2026-07-14", adjClose: 50 });
  mockedReplaceDailyOrders.mockResolvedValue(REGENERATED);
  mockedHasNewerPriceSince.mockResolvedValue(false);
});

describe("getOrCreateDailyOrders - 주문표 신선도 정책", () => {
  it("주문이 없으면 생성한다", async () => {
    mockedGetDailyOrders.mockResolvedValue([]);

    const orders = await getOrCreateDailyOrders(createAccount(), DATE);

    expect(orders).toEqual(REGENERATED);
    expect(mockedReplaceDailyOrders).toHaveBeenCalledOnce();
    expect(mockedDeleteDailyOrders).not.toHaveBeenCalled();
  });

  it("미체결 주문이 최신이면 그대로 반환하고 다시 만들지 않는다", async () => {
    const existing = [createOrder()];
    mockedGetDailyOrders.mockResolvedValue(existing);

    const orders = await getOrCreateDailyOrders(createAccount(), DATE);

    expect(orders).toBe(existing);
    expect(mockedDeleteDailyOrders).not.toHaveBeenCalled();
    expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
  });

  it("계좌 설정이 주문 생성 이후 수정됐으면 삭제하고 재생성한다", async () => {
    mockedGetDailyOrders.mockResolvedValue([createOrder()]);
    const account = createAccount({ updatedAt: "2026-07-15T00:20:00.000Z" });

    const orders = await getOrCreateDailyOrders(account, DATE);

    expect(orders).toEqual(REGENERATED);
    expect(mockedDeleteDailyOrders).toHaveBeenCalledWith(ACCOUNT_ID, DATE);
    // 계좌 변경만으로 판정이 끝나므로 가격 조회까지 가지 않는다
    expect(mockedHasNewerPriceSince).not.toHaveBeenCalled();
  });

  it("주문 생성 이후 더 최신 가격이 적재됐으면 삭제하고 재생성한다", async () => {
    mockedGetDailyOrders.mockResolvedValue([createOrder()]);
    mockedHasNewerPriceSince.mockResolvedValue(true);

    const orders = await getOrCreateDailyOrders(createAccount(), DATE);

    expect(orders).toEqual(REGENERATED);
    expect(mockedDeleteDailyOrders).toHaveBeenCalledWith(ACCOUNT_ID, DATE);
    expect(mockedHasNewerPriceSince).toHaveBeenCalledWith("SOXL", DATE, new Date(ORDER_CREATED_AT));
  });

  it("신선도는 가장 이른 주문 생성 시각으로 판정한다", async () => {
    mockedGetDailyOrders.mockResolvedValue([
      createOrder({ id: "later", createdAt: "2026-07-15T05:00:00.000Z" }),
      createOrder({ id: "earlier", createdAt: "2026-07-15T01:00:00.000Z" }),
    ]);

    await getOrCreateDailyOrders(createAccount(), DATE);

    expect(mockedHasNewerPriceSince).toHaveBeenCalledWith(
      "SOXL",
      DATE,
      new Date("2026-07-15T01:00:00.000Z")
    );
  });

  it("체결된 주문이 있으면 계좌 설정이 바뀌었어도 재생성하지 않는다", async () => {
    const existing = [createOrder({ id: "executed", executed: true }), createOrder({ id: "open" })];
    mockedGetDailyOrders.mockResolvedValue(existing);
    const account = createAccount({ updatedAt: "2026-07-15T00:20:00.000Z" });

    const orders = await getOrCreateDailyOrders(account, DATE);

    expect(orders).toBe(existing);
    expect(mockedDeleteDailyOrders).not.toHaveBeenCalled();
    expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
  });

  it("체결된 주문이 있으면 더 최신 가격이 적재됐어도 재생성하지 않는다", async () => {
    const existing = [createOrder({ executed: true })];
    mockedGetDailyOrders.mockResolvedValue(existing);
    mockedHasNewerPriceSince.mockResolvedValue(true);

    const orders = await getOrCreateDailyOrders(createAccount(), DATE);

    expect(orders).toBe(existing);
    expect(mockedHasNewerPriceSince).not.toHaveBeenCalled();
    expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
  });

  it("regenerate면 판정 없이 삭제하고 재생성한다", async () => {
    // 삭제 후에는 조회 결과가 비므로, 재조회에서 빈 목록을 돌려준다
    mockedGetDailyOrders.mockResolvedValue([]);

    const orders = await getOrCreateDailyOrders(createAccount(), DATE, { regenerate: true });

    expect(orders).toEqual(REGENERATED);
    expect(mockedDeleteDailyOrders).toHaveBeenCalledWith(ACCOUNT_ID, DATE);
    expect(mockedHasNewerPriceSince).not.toHaveBeenCalled();
  });

  it("가격 데이터가 없으면 주문을 만들지 않는다", async () => {
    mockedGetDailyOrders.mockResolvedValue([]);
    mockedGetPreviousTradingClose.mockResolvedValue(null);

    const orders = await getOrCreateDailyOrders(createAccount(), DATE);

    expect(orders).toEqual([]);
    expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
  });
});
