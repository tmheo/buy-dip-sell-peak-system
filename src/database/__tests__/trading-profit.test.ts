/**
 * 수익 기록 DB 함수 단위 테스트 (SPEC-TRADING-002)
 * Drizzle ORM + PostgreSQL 환경
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";

// Test user IDs
const TEST_USER_ID = randomUUID();

// Dynamic import type
type TradingModule = typeof import("../trading");
let tradingModule: TradingModule;

describe("Profit Records DB Functions", () => {
  let testAccountId: string;

  beforeAll(async () => {
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
  });

  describe("createProfitRecord", () => {
    it("should create a profit record with correct calculations", async () => {
      // SPEC: AC-009 Decimal.js 정밀도 검증 (63.72 * 157 = 10,004.04)
      const record = await tradingModule.createProfitRecord({
        accountId: testAccountId,
        tier: 1,
        ticker: "SOXL",
        strategy: "Pro1",
        buyDate: "2025-01-02",
        buyPrice: 63.72,
        buyQuantity: 157,
        sellDate: "2025-01-03",
        sellPrice: 64.0,
      });

      expect(record.id).toBeDefined();
      expect(record.accountId).toBe(testAccountId);
      expect(record.tier).toBe(1);
      expect(record.ticker).toBe("SOXL");
      expect(record.strategy).toBe("Pro1");
      expect(record.buyDate).toBe("2025-01-02");
      expect(record.buyPrice).toBe(63.72);
      expect(record.buyQuantity).toBe(157);
      expect(record.sellDate).toBe("2025-01-03");
      expect(record.sellPrice).toBe(64.0);

      // Decimal.js precision: 63.72 * 157 = 10,004.04
      expect(record.buyAmount).toBe(10004.04);
      // 64.0 * 157 = 10,048.00
      expect(record.sellAmount).toBe(10048.0);
      // profit: 10048.00 - 10004.04 = 43.96
      expect(record.profit).toBe(43.96);
      // profitRate: 43.96 / 10004.04 * 100 = 0.439...
      expect(record.profitRate).toBeCloseTo(0.44, 1);
    });

    it("should handle negative profit (stop-loss scenario)", async () => {
      // SPEC: AC-003 손절 매도 시 음수 수익 기록
      const record = await tradingModule.createProfitRecord({
        accountId: testAccountId,
        tier: 2,
        ticker: "SOXL",
        strategy: "Pro2",
        buyDate: "2025-01-02",
        buyPrice: 100.0,
        buyQuantity: 100,
        sellDate: "2025-01-15", // stop-loss after 10+ days
        sellPrice: 90.0, // 10% loss
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
        tier: 3,
        ticker: "SOXL",
        strategy: "Pro1",
        buyDate: "2025-01-02",
        buyPrice: 50.0,
        buyQuantity: 100,
        sellDate: "2025-01-03",
        sellPrice: 51.0,
      });

      const record2 = await tradingModule.createProfitRecord({
        accountId: testAccountId,
        tier: 4,
        ticker: "SOXL",
        strategy: "Pro1",
        buyDate: "2025-01-02",
        buyPrice: 50.0,
        buyQuantity: 200,
        sellDate: "2025-01-03",
        sellPrice: 51.0,
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
        tier: 1,
        ticker: "TQQQ",
        strategy: "Pro2",
        buyDate: "2025-03-02",
        buyPrice: 100.0,
        buyQuantity: 100, // buyAmount: 10000
        sellDate: "2025-03-10",
        sellPrice: 102.0, // sellAmount: 10200, profit: 200 (2%)
      });

      await tradingModule.createProfitRecord({
        accountId: isolatedAccount.id,
        tier: 2,
        ticker: "TQQQ",
        strategy: "Pro2",
        buyDate: "2025-03-05",
        buyPrice: 100.0,
        buyQuantity: 100, // buyAmount: 10000
        sellDate: "2025-03-15",
        sellPrice: 104.0, // sellAmount: 10400, profit: 400 (4%)
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
