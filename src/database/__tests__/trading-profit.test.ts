/**
 * 수익 기록 DB 함수 단위 테스트 (SPEC-TRADING-002)
 * Drizzle ORM + PostgreSQL 환경
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { hasDb } from "@/test-utils/db";
import { db } from "../db-drizzle";
import { users } from "../schema/auth";

// Test user IDs
const TEST_USER_ID = randomUUID();

// Dynamic import type
type TradingModule = typeof import("../trading");
let tradingModule: TradingModule;

describe.skipIf(!hasDb)("Profit Records DB Functions", () => {
  let testAccountId: string;

  beforeAll(async () => {
    // 테스트용 사용자 생성 (foreign key 제약조건 충족)
    await db
      .insert(users)
      .values({
        id: TEST_USER_ID,
        email: `profit-test-${TEST_USER_ID}@test.com`,
      })
      .onConflictDoNothing();

    // Import trading module (uses Drizzle ORM)
    tradingModule = await import("../trading");

    // Create a test account
    const account = await tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "수익 테스트 계좌",
      ticker: "SOXL",
      seedCapital: 10000,
      strategy: "Pro1",
      cycleStartDate: "2025-01-02",
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    // Clean up test account
    if (testAccountId) {
      await tradingModule.deleteTradingAccount(testAccountId, TEST_USER_ID);
    }

    // 테스트용 사용자 삭제
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  });

  describe("createProfitRecord", () => {
    it("settle이 계산한 매도금액과 손익을 그대로 저장하고 체결 시점 사이클 번호를 남긴다", async () => {
      // 매수금액은 보유 티어의 매수가 × 수량이다 (63.72 × 157 = 10,004.04)
      const record = await tradingModule.createProfitRecord({
        accountId: testAccountId,
        cycleNumber: 1,
        tier: 1,
        ticker: "SOXL",
        strategy: "Pro1",
        buyDate: "2025-01-02",
        buyPrice: 63.72,
        buyQuantity: 157,
        sellDate: "2025-01-03",
        sellPrice: 64.0,
        sellAmount: 10048.0,
        profit: 43.96,
      });

      expect(record.id).toBeDefined();
      expect(record.accountId).toBe(testAccountId);
      expect(record.cycleNumber).toBe(1);
      expect(record.tier).toBe(1);
      expect(record.ticker).toBe("SOXL");
      expect(record.strategy).toBe("Pro1");
      expect(record.buyDate).toBe("2025-01-02");
      expect(record.buyPrice).toBe(63.72);
      expect(record.buyQuantity).toBe(157);
      expect(record.sellDate).toBe("2025-01-03");
      expect(record.sellPrice).toBe(64.0);
      expect(record.buyAmount).toBe(10004.04);
      expect(record.sellAmount).toBe(10048.0);
      expect(record.profit).toBe(43.96);
      // profitRate: 43.96 / 10004.04 * 100 = 0.439...
      expect(record.profitRate).toBeCloseTo(0.44, 1);
    });

    it("should handle negative profit (stop-loss scenario)", async () => {
      // SPEC: AC-003 손절 매도 시 음수 수익 기록
      const record = await tradingModule.createProfitRecord({
        accountId: testAccountId,
        cycleNumber: 1,
        tier: 2,
        ticker: "SOXL",
        strategy: "Pro2",
        buyDate: "2025-01-02",
        buyPrice: 100.0,
        buyQuantity: 100,
        sellDate: "2025-01-15", // stop-loss after 10+ days
        sellPrice: 90.0, // 10% loss
        sellAmount: 9000.0,
        profit: -1000.0,
      });

      expect(record.buyAmount).toBe(10000.0);
      expect(record.sellAmount).toBe(9000.0);
      expect(record.profit).toBe(-1000.0);
      expect(record.profitRate).toBe(-10.0);
    });

    it("should create individual records for multiple tiers (AC-002)", async () => {
      // SPEC: AC-002 다중 티어 동시 매도 시 개별 기록
      const record1 = await tradingModule.createProfitRecord({
        accountId: testAccountId,
        cycleNumber: 1,
        tier: 3,
        ticker: "SOXL",
        strategy: "Pro1",
        buyDate: "2025-01-02",
        buyPrice: 50.0,
        buyQuantity: 100,
        sellDate: "2025-01-03",
        sellPrice: 51.0,
        sellAmount: 5100.0,
        profit: 100.0,
      });

      const record2 = await tradingModule.createProfitRecord({
        accountId: testAccountId,
        cycleNumber: 1,
        tier: 4,
        ticker: "SOXL",
        strategy: "Pro1",
        buyDate: "2025-01-02",
        buyPrice: 50.0,
        buyQuantity: 200,
        sellDate: "2025-01-03",
        sellPrice: 51.0,
        sellAmount: 10200.0,
        profit: 200.0,
      });

      expect(record1.id).not.toBe(record2.id);
      expect(record1.tier).toBe(3);
      expect(record2.tier).toBe(4);
    });
  });

  describe("getProfitRecords", () => {
    it("should return records for the account", async () => {
      // Records were created in previous tests
      const records = await tradingModule.getProfitRecords(testAccountId);
      expect(records.length).toBeGreaterThanOrEqual(4);
    });

    it("should return empty array for non-existent account", async () => {
      const records = await tradingModule.getProfitRecords("non-existent-account");
      expect(records).toEqual([]);
    });
  });

  describe("getCycleRealizedPnl", () => {
    it("그 계좌의 그 사이클에 기록된 손익만 합산한다", async () => {
      const account = await tradingModule.createTradingAccount(TEST_USER_ID, {
        name: "사이클 실현손익 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro3",
        cycleStartDate: "2025-04-01",
      });
      const other = await tradingModule.createTradingAccount(TEST_USER_ID, {
        name: "다른 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro3",
        cycleStartDate: "2025-04-01",
      });
      const record = (accountId: string, cycleNumber: number, tier: number, profit: number) =>
        tradingModule.createProfitRecord({
          accountId,
          cycleNumber,
          tier,
          ticker: "SOXL",
          strategy: "Pro3",
          buyDate: "2025-04-01",
          buyPrice: 10,
          buyQuantity: 100,
          sellDate: "2025-04-10",
          sellPrice: 10 + profit / 100,
          sellAmount: 1000 + profit,
          profit,
        });

      try {
        await record(account.id, 1, 1, 120.5); // 지난 사이클
        await record(account.id, 2, 1, 35.25);
        await record(account.id, 2, 2, -210.1);
        await record(other.id, 2, 1, 999); // 다른 계좌

        // 이익이 손실을 상계한다: 35.25 - 210.10 = -174.85
        expect(await tradingModule.getCycleRealizedPnl(account.id, 2)).toBe(-174.85);
        expect(await tradingModule.getCycleRealizedPnl(account.id, 1)).toBe(120.5);
        // 아직 매도가 없는 사이클은 0이다
        expect(await tradingModule.getCycleRealizedPnl(account.id, 3)).toBe(0);
      } finally {
        await tradingModule.deleteTradingAccount(account.id, TEST_USER_ID);
        await tradingModule.deleteTradingAccount(other.id, TEST_USER_ID);
      }
    });
  });

  describe("groupProfitsByMonth", () => {
    it("should group records by month and calculate summaries", async () => {
      const result = await tradingModule.groupProfitsByMonth(testAccountId);

      expect(result.accountId).toBe(testAccountId);
      expect(result.months.length).toBeGreaterThanOrEqual(1);
      expect(result.grandTotal.totalTrades).toBeGreaterThanOrEqual(4);
    });

    it("should return empty months for non-existent account", async () => {
      const result = await tradingModule.groupProfitsByMonth("non-existent-account");

      expect(result.accountId).toBe("non-existent-account");
      expect(result.months).toEqual([]);
      expect(result.grandTotal.totalTrades).toBe(0);
      expect(result.grandTotal.totalBuyAmount).toBe(0);
      expect(result.grandTotal.totalSellAmount).toBe(0);
      expect(result.grandTotal.totalProfit).toBe(0);
      expect(result.grandTotal.averageProfitRate).toBe(0);
    });

    it("should calculate average profit rate correctly", async () => {
      // Create a new account for isolated testing
      const isolatedAccount = await tradingModule.createTradingAccount(TEST_USER_ID, {
        name: "수익률 테스트 계좌",
        ticker: "TQQQ",
        seedCapital: 50000,
        strategy: "Pro2",
        cycleStartDate: "2025-03-01",
      });

      // Two trades with different profit rates
      await tradingModule.createProfitRecord({
        accountId: isolatedAccount.id,
        cycleNumber: 1,
        tier: 1,
        ticker: "TQQQ",
        strategy: "Pro2",
        buyDate: "2025-03-02",
        buyPrice: 100.0,
        buyQuantity: 100, // buyAmount: 10000
        sellDate: "2025-03-10",
        sellPrice: 102.0,
        sellAmount: 10200, // profit: 200 (2%)
        profit: 200,
      });

      await tradingModule.createProfitRecord({
        accountId: isolatedAccount.id,
        cycleNumber: 1,
        tier: 2,
        ticker: "TQQQ",
        strategy: "Pro2",
        buyDate: "2025-03-05",
        buyPrice: 100.0,
        buyQuantity: 100, // buyAmount: 10000
        sellDate: "2025-03-15",
        sellPrice: 104.0,
        sellAmount: 10400, // profit: 400 (4%)
        profit: 400,
      });

      const result = await tradingModule.groupProfitsByMonth(isolatedAccount.id);

      // Total: buyAmount=20000, sellAmount=20600, profit=600
      // Average rate: 600/20000 * 100 = 3%
      expect(result.grandTotal.totalBuyAmount).toBe(20000);
      expect(result.grandTotal.totalSellAmount).toBe(20600);
      expect(result.grandTotal.totalProfit).toBe(600);
      expect(result.grandTotal.averageProfitRate).toBe(3);

      // Cleanup
      await tradingModule.deleteTradingAccount(isolatedAccount.id, TEST_USER_ID);
    });
  });
});
