/**
 * 체결할 미체결 주문이 없을 때의 체결 처리 테스트 (#96)
 *
 * 저장 모듈을 대역으로 바꿔, processOrderExecution이 신선도 판정 뒤의 주문표를 기준으로
 * 체결할 주문이 없으면 체결 트랜잭션을 열지 않는지 검증한다.
 * 저장돼 있던 주문표에는 미체결 주문이 있어도, 다시 만든 주문표가 비면 체결할 것이 없다.
 *
 * 시나리오 (SOXL, Pro1, 시드 $100, 체결일 2026-07-15):
 * - 직전 거래일 2026-07-14 종가 $50, 당일 종가 $49
 * - 보유 티어 없음, 티어 1 금액 $5로는 $49.99 지정가에 1주도 못 산다 → 다시 만든 주문표는 비어 있다
 * - 저장된 주문표: 옛 규칙으로 만든 티어 1 LOC 매수 $49.99 × 1주 (미체결)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { DailyOrder, TradingAccount } from "@/types/trading";

vi.mock("@/database/trading", () => ({
  completeCycleAndIncrement: vi.fn(),
  createProfitRecord: vi.fn(),
  getClosingPrice: vi.fn(),
  getDailyOrders: vi.fn(),
  getPreviousTradingClose: vi.fn(),
  getTierHoldings: vi.fn(),
  getTradingAccountByIdWithoutOwnerCheck: vi.fn(),
  hasExecutedOrdersAfter: vi.fn(),
  listTradingDatesBetween: vi.fn(),
  lockDailyOrders: vi.fn(),
  replaceDailyOrders: vi.fn(),
  runInTransaction: vi.fn(),
  updateAccountLastProcessedDate: vi.fn(),
  updateOrderExecuted: vi.fn(),
  updateTierHolding: vi.fn(),
}));

import {
  getClosingPrice,
  getDailyOrders,
  getPreviousTradingClose,
  getTierHoldings,
  getTradingAccountByIdWithoutOwnerCheck,
  hasExecutedOrdersAfter,
  listTradingDatesBetween,
  replaceDailyOrders,
  runInTransaction,
} from "@/database/trading";

import { processOrderExecution } from "../execution";

const ACCOUNT_ID = "account-1";
const DATE = "2026-07-15";

const ACCOUNT: TradingAccount = {
  id: ACCOUNT_ID,
  userId: "user-1",
  name: "테스트 계좌",
  ticker: "SOXL",
  seedCapital: 100,
  strategy: "Pro1",
  cycleStartDate: "2026-07-01",
  cycleNumber: 1,
  lastProcessedDate: "2026-07-14",
  lastViewedAt: "2026-07-15T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const STALE_ORDER: DailyOrder = {
  id: "order-1",
  accountId: ACCOUNT_ID,
  date: DATE,
  tier: 1,
  type: "BUY",
  orderMethod: "LOC",
  limitPrice: 49.99,
  shares: 1,
  executed: false,
  createdAt: "2026-07-15T00:10:00.000Z",
  updatedAt: "2026-07-15T00:10:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(getTradingAccountByIdWithoutOwnerCheck).mockResolvedValue(ACCOUNT);
  vi.mocked(getClosingPrice).mockResolvedValue(49);
  vi.mocked(getDailyOrders).mockResolvedValue([STALE_ORDER]);
  vi.mocked(getPreviousTradingClose).mockResolvedValue({ date: "2026-07-14", adjClose: 50 });
  vi.mocked(hasExecutedOrdersAfter).mockResolvedValue(false);
  vi.mocked(getTierHoldings).mockResolvedValue([]);
  vi.mocked(listTradingDatesBetween).mockResolvedValue([]);
  vi.mocked(replaceDailyOrders).mockResolvedValue([]);
});

describe("processOrderExecution - 다시 만든 주문표에 미체결 주문이 없을 때", () => {
  it("낡은 주문표를 빈 주문표로 바꾸고 체결 트랜잭션은 열지 않는다", async () => {
    const results = await processOrderExecution(ACCOUNT_ID, DATE);

    expect(replaceDailyOrders).toHaveBeenCalledWith(ACCOUNT_ID, DATE, []);
    expect(results).toEqual([]);
    expect(runInTransaction).not.toHaveBeenCalled();
  });
});
