/**
 * 수익 기록 DB 함수 단위 테스트 (SPEC-TRADING-002)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

// Test database path (unique per test run)
const TEST_DB_PATH = path.join(process.cwd(), "data", `test-profit-${Date.now()}.db`);

// Set environment variable before importing trading module
process.env.DB_PATH = TEST_DB_PATH;

// Import schema for users table
import { CREATE_USERS_TABLE, CREATE_DAILY_PRICES_TABLE, CREATE_TICKER_DATE_INDEX } from "../schema";

// Test user IDs
const TEST_USER_ID = randomUUID();

// Dynamic import type
type TradingModule = typeof import("../trading");
let tradingModule: TradingModule;

describe("Profit Records DB Functions", () => {
  let testAccountId: string;

  beforeAll(async () => {
    // Create data directory if not exists
    const dataDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Set up users table before importing trading module
    const db = new Database(TEST_DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Create users table
    db.exec(CREATE_USERS_TABLE);

    // Create daily_prices table
    db.exec(CREATE_DAILY_PRICES_TABLE);
    db.exec(CREATE_TICKER_DATE_INDEX);

    // Add test user
    const stmt = db.prepare("INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)");
    stmt.run(TEST_USER_ID, "Profit Test User", `test-profit-${TEST_USER_ID}@example.com`);
    db.close();

    // Now import trading module
    tradingModule = await import("../trading");

    // Create a test account
    const account = tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "수익 테스트 계좌",
      ticker: "SOXL",
      seedCapital: 10000,
      strategy: "Pro1",
      cycleStartDate: "2025-01-02",
    });
    testAccountId = account.id;
  });

  afterAll(() => {
    // Clean up test DB files
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      if (fs.existsSync(`${TEST_DB_PATH}-wal`)) {
        fs.unlinkSync(`${TEST_DB_PATH}-wal`);
      }
      if (fs.existsSync(`${TEST_DB_PATH}-shm`)) {
        fs.unlinkSync(`${TEST_DB_PATH}-shm`);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createProfitRecord", () => {
    it("should create a profit record with correct calculations", () => {
      // SPEC: AC-009 Decimal.js 정밀도 검증 (63.72 * 157 = 10,004.04)
      const record = tradingModule.createProfitRecord({
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

    it("should handle negative profit (stop-loss scenario)", () => {
      // SPEC: AC-003 손절 매도 시 음수 수익 기록
      const record = tradingModule.createProfitRecord({
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

    it("should create individual records for multiple tiers (AC-002)", () => {
      // SPEC: AC-002 다중 티어 동시 매도 시 개별 기록
      const record1 = tradingModule.createProfitRecord({
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

      const record2 = tradingModule.createProfitRecord({
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
    it("should return records for the account", () => {
      // Records were created in previous tests
      const records = tradingModule.getProfitRecords(testAccountId);
      expect(records.length).toBeGreaterThanOrEqual(4);
    });

    it("should return empty array for non-existent account", () => {
      const records = tradingModule.getProfitRecords("non-existent-account");
      expect(records).toEqual([]);
    });
  });

  describe("groupProfitsByMonth", () => {
    it("should group records by month and calculate summaries", () => {
      const result = tradingModule.groupProfitsByMonth(testAccountId);

      expect(result.accountId).toBe(testAccountId);
      expect(result.months.length).toBeGreaterThanOrEqual(1);
      expect(result.grandTotal.totalTrades).toBeGreaterThanOrEqual(4);
    });

    it("should return empty months for non-existent account", () => {
      const result = tradingModule.groupProfitsByMonth("non-existent-account");

      expect(result.accountId).toBe("non-existent-account");
      expect(result.months).toEqual([]);
      expect(result.grandTotal.totalTrades).toBe(0);
      expect(result.grandTotal.totalBuyAmount).toBe(0);
      expect(result.grandTotal.totalSellAmount).toBe(0);
      expect(result.grandTotal.totalProfit).toBe(0);
      expect(result.grandTotal.averageProfitRate).toBe(0);
    });

    it("should calculate average profit rate correctly", () => {
      // Create a new account for isolated testing
      const isolatedAccount = tradingModule.createTradingAccount(TEST_USER_ID, {
        name: "수익률 테스트 계좌",
        ticker: "TQQQ",
        seedCapital: 50000,
        strategy: "Pro2",
        cycleStartDate: "2025-03-01",
      });

      // Two trades with different profit rates
      tradingModule.createProfitRecord({
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

      tradingModule.createProfitRecord({
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

      const result = tradingModule.groupProfitsByMonth(isolatedAccount.id);

      // Total: buyAmount=20000, sellAmount=20600, profit=600
      // Average rate: 600/20000 * 100 = 3%
      expect(result.grandTotal.totalBuyAmount).toBe(20000);
      expect(result.grandTotal.totalSellAmount).toBe(20600);
      expect(result.grandTotal.totalProfit).toBe(600);
      expect(result.grandTotal.averageProfitRate).toBe(3);

      // Cleanup
      tradingModule.deleteTradingAccount(isolatedAccount.id, TEST_USER_ID);
    });
  });
});
