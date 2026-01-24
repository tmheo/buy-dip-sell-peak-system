/**
 * 트레이딩 계좌 CRUD 함수 (PRD-TRADING-001)
 */

import Database from "better-sqlite3";
import Decimal from "decimal.js";
import path from "path";
import { randomUUID } from "crypto";

import type {
  TradingAccount,
  TierHolding,
  DailyOrder,
  CreateTradingAccountRequest,
  UpdateTradingAccountRequest,
  TradingAccountWithHoldings,
  Ticker,
  Strategy,
  OrderType,
  OrderMethod,
} from "@/types/trading";
import {
  TIER_COUNT,
  TIER_RATIOS,
  BUY_THRESHOLDS,
  SELL_THRESHOLDS,
  STOP_LOSS_DAYS,
} from "@/types/trading";
import {
  calculateBuyLimitPrice,
  calculateSellLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
  getPreviousTradingDate,
  calculateTradingDays,
  percentToThreshold,
} from "@/utils/trading-core";
import {
  CREATE_TRADING_ACCOUNTS_TABLE,
  CREATE_TRADING_ACCOUNTS_USER_INDEX,
  CREATE_TIER_HOLDINGS_TABLE,
  CREATE_TIER_HOLDINGS_ACCOUNT_INDEX,
  CREATE_DAILY_ORDERS_TABLE,
  CREATE_DAILY_ORDERS_ACCOUNT_DATE_INDEX,
} from "./schema";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "prices.db");

let db: Database.Database | null = null;
let tablesInitialized = false;

/**
 * 데이터베이스 연결 (싱글톤)
 */
function getConnection(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initTradingTables(db);
  }
  return db;
}

/**
 * Trading 테이블 초기화
 */
function initTradingTables(database: Database.Database): void {
  if (tablesInitialized) return;

  database.exec(CREATE_TRADING_ACCOUNTS_TABLE);
  database.exec(CREATE_TRADING_ACCOUNTS_USER_INDEX);
  database.exec(CREATE_TIER_HOLDINGS_TABLE);
  database.exec(CREATE_TIER_HOLDINGS_ACCOUNT_INDEX);
  database.exec(CREATE_DAILY_ORDERS_TABLE);
  database.exec(CREATE_DAILY_ORDERS_ACCOUNT_DATE_INDEX);

  tablesInitialized = true;
}

// =====================================================
// DB Row 타입 (snake_case)
// =====================================================

interface TradingAccountRow {
  id: string;
  user_id: string;
  name: string;
  ticker: string;
  seed_capital: number;
  strategy: string;
  cycle_start_date: string;
  cycle_number: number;
  created_at: string;
  updated_at: string;
}

interface TierHoldingRow {
  id: string;
  account_id: string;
  tier: number;
  buy_price: number | null;
  shares: number;
  buy_date: string | null;
  sell_target_price: number | null;
  created_at: string;
  updated_at: string;
}

interface DailyOrderRow {
  id: string;
  account_id: string;
  date: string;
  tier: number;
  type: string;
  order_method: string;
  limit_price: number;
  shares: number;
  executed: number;
  created_at: string;
  updated_at: string;
}

// =====================================================
// Row 변환 함수
// =====================================================

function mapTradingAccountRow(row: TradingAccountRow): TradingAccount {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    ticker: row.ticker as Ticker,
    seedCapital: row.seed_capital,
    strategy: row.strategy as Strategy,
    cycleStartDate: row.cycle_start_date,
    cycleNumber: row.cycle_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTierHoldingRow(row: TierHoldingRow): TierHolding {
  return {
    id: row.id,
    accountId: row.account_id,
    tier: row.tier,
    buyPrice: row.buy_price,
    shares: row.shares,
    buyDate: row.buy_date,
    sellTargetPrice: row.sell_target_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDailyOrderRow(row: DailyOrderRow): DailyOrder {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    tier: row.tier,
    type: row.type as OrderType,
    orderMethod: row.order_method as OrderMethod,
    limitPrice: row.limit_price,
    shares: row.shares,
    executed: row.executed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =====================================================
// TradingAccount CRUD
// =====================================================

/**
 * 트레이딩 계좌 생성 (티어 홀딩 7개 자동 생성)
 */
export function createTradingAccount(
  userId: string,
  request: CreateTradingAccountRequest
): TradingAccount {
  const database = getConnection();
  const accountId = randomUUID();

  const insertAccount = database.transaction(() => {
    // 1. 계좌 생성
    const accountStmt = database.prepare(
      "INSERT INTO trading_accounts (id, user_id, name, ticker, seed_capital, strategy, cycle_start_date, cycle_number) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
    );
    accountStmt.run(
      accountId,
      userId,
      request.name,
      request.ticker,
      request.seedCapital,
      request.strategy,
      request.cycleStartDate
    );

    // 2. 티어 홀딩 7개 자동 생성
    const holdingStmt = database.prepare(
      "INSERT INTO tier_holdings (id, account_id, tier, shares) VALUES (?, ?, ?, 0)"
    );
    for (let tier = 1; tier <= TIER_COUNT; tier++) {
      holdingStmt.run(randomUUID(), accountId, tier);
    }
  });

  insertAccount();

  return getTradingAccountById(accountId, userId)!;
}

/**
 * 사용자의 모든 계좌 조회
 */
export function getTradingAccountsByUserId(userId: string): TradingAccount[] {
  const database = getConnection();
  const stmt = database.prepare(
    "SELECT id, user_id, name, ticker, seed_capital, strategy, cycle_start_date, cycle_number, created_at, updated_at FROM trading_accounts WHERE user_id = ? ORDER BY created_at DESC"
  );
  const rows = stmt.all(userId) as TradingAccountRow[];
  return rows.map(mapTradingAccountRow);
}

/**
 * 단일 계좌 조회 (본인 확인)
 */
export function getTradingAccountById(id: string, userId: string): TradingAccount | null {
  const database = getConnection();
  const stmt = database.prepare(
    "SELECT id, user_id, name, ticker, seed_capital, strategy, cycle_start_date, cycle_number, created_at, updated_at FROM trading_accounts WHERE id = ? AND user_id = ?"
  );
  const row = stmt.get(id, userId) as TradingAccountRow | undefined;
  return row ? mapTradingAccountRow(row) : null;
}

/**
 * 계좌 상세 조회 (holdings 포함)
 */
export function getTradingAccountWithHoldings(
  id: string,
  userId: string
): TradingAccountWithHoldings | null {
  const account = getTradingAccountById(id, userId);
  if (!account) return null;

  const holdings = getTierHoldings(id);
  const totalShares = getTotalShares(id);

  return {
    ...account,
    holdings,
    totalShares,
    isCycleInProgress: totalShares > 0,
  };
}

/**
 * 계좌 수정 (사이클 미진행 시만)
 */
export function updateTradingAccount(
  id: string,
  userId: string,
  data: UpdateTradingAccountRequest
): TradingAccount | null {
  const account = getTradingAccountById(id, userId);
  if (!account) return null;

  // 사이클 진행 중 확인
  const totalShares = getTotalShares(id);
  if (totalShares > 0) {
    throw new Error("Cannot update account while cycle is in progress");
  }

  const database = getConnection();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    values.push(data.name);
  }
  if (data.ticker !== undefined) {
    updates.push("ticker = ?");
    values.push(data.ticker);
  }
  if (data.seedCapital !== undefined) {
    updates.push("seed_capital = ?");
    values.push(data.seedCapital);
  }
  if (data.strategy !== undefined) {
    updates.push("strategy = ?");
    values.push(data.strategy);
  }
  if (data.cycleStartDate !== undefined) {
    updates.push("cycle_start_date = ?");
    values.push(data.cycleStartDate);
  }

  if (updates.length === 0) {
    return account;
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id, userId);

  const sql = "UPDATE trading_accounts SET " + updates.join(", ") + " WHERE id = ? AND user_id = ?";
  const stmt = database.prepare(sql);
  stmt.run(...values);

  return getTradingAccountById(id, userId);
}

/**
 * 계좌 삭제
 */
export function deleteTradingAccount(id: string, userId: string): boolean {
  const database = getConnection();
  const stmt = database.prepare("DELETE FROM trading_accounts WHERE id = ? AND user_id = ?");
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

// =====================================================
// TierHolding CRUD
// =====================================================

/**
 * 티어별 보유 현황 조회
 */
export function getTierHoldings(accountId: string): TierHolding[] {
  const database = getConnection();
  const stmt = database.prepare(
    "SELECT id, account_id, tier, buy_price, shares, buy_date, sell_target_price, created_at, updated_at FROM tier_holdings WHERE account_id = ? ORDER BY tier ASC"
  );
  const rows = stmt.all(accountId) as TierHoldingRow[];
  return rows.map(mapTierHoldingRow);
}

/**
 * 총 보유 수량 조회
 */
export function getTotalShares(accountId: string): number {
  const database = getConnection();
  const stmt = database.prepare(
    "SELECT COALESCE(SUM(shares), 0) as total FROM tier_holdings WHERE account_id = ?"
  );
  const result = stmt.get(accountId) as { total: number };
  return result.total;
}

/**
 * 티어 홀딩 업데이트
 */
export function updateTierHolding(
  accountId: string,
  tier: number,
  data: {
    buyPrice?: number | null;
    shares?: number;
    buyDate?: string | null;
    sellTargetPrice?: number | null;
  }
): TierHolding | null {
  const database = getConnection();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.buyPrice !== undefined) {
    updates.push("buy_price = ?");
    values.push(data.buyPrice);
  }
  if (data.shares !== undefined) {
    updates.push("shares = ?");
    values.push(data.shares);
  }
  if (data.buyDate !== undefined) {
    updates.push("buy_date = ?");
    values.push(data.buyDate);
  }
  if (data.sellTargetPrice !== undefined) {
    updates.push("sell_target_price = ?");
    values.push(data.sellTargetPrice);
  }

  if (updates.length === 0) {
    return null;
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(accountId, tier);

  const sql =
    "UPDATE tier_holdings SET " + updates.join(", ") + " WHERE account_id = ? AND tier = ?";
  const stmt = database.prepare(sql);
  stmt.run(...values);

  const selectStmt = database.prepare(
    "SELECT id, account_id, tier, buy_price, shares, buy_date, sell_target_price, created_at, updated_at FROM tier_holdings WHERE account_id = ? AND tier = ?"
  );
  const row = selectStmt.get(accountId, tier) as TierHoldingRow | undefined;
  return row ? mapTierHoldingRow(row) : null;
}

// =====================================================
// DailyOrder CRUD
// =====================================================

/**
 * 당일 주문표 조회
 */
export function getDailyOrders(accountId: string, date: string): DailyOrder[] {
  const database = getConnection();
  const stmt = database.prepare(
    "SELECT id, account_id, date, tier, type, order_method, limit_price, shares, executed, created_at, updated_at FROM daily_orders WHERE account_id = ? AND date = ? ORDER BY tier ASC, type ASC"
  );
  const rows = stmt.all(accountId, date) as DailyOrderRow[];
  return rows.map(mapDailyOrderRow);
}

/**
 * 주문 생성
 */
export function createDailyOrder(
  accountId: string,
  data: {
    date: string;
    tier: number;
    type: OrderType;
    orderMethod: OrderMethod;
    limitPrice: number;
    shares: number;
  }
): DailyOrder {
  const database = getConnection();
  const id = randomUUID();

  const stmt = database.prepare(
    "INSERT INTO daily_orders (id, account_id, date, tier, type, order_method, limit_price, shares, executed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
  );
  stmt.run(
    id,
    accountId,
    data.date,
    data.tier,
    data.type,
    data.orderMethod,
    data.limitPrice,
    data.shares
  );

  const selectStmt = database.prepare(
    "SELECT id, account_id, date, tier, type, order_method, limit_price, shares, executed, created_at, updated_at FROM daily_orders WHERE id = ?"
  );
  const row = selectStmt.get(id) as DailyOrderRow;
  return mapDailyOrderRow(row);
}

/**
 * 주문 실행 상태 업데이트
 */
export function updateOrderExecuted(orderId: string, executed: boolean): boolean {
  const database = getConnection();
  const stmt = database.prepare(
    "UPDATE daily_orders SET executed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  );
  const result = stmt.run(executed ? 1 : 0, orderId);
  return result.changes > 0;
}

/**
 * 특정 날짜의 종가 조회
 */
export function getClosingPrice(ticker: Ticker, date: string): number | null {
  const database = getConnection();
  const stmt = database.prepare(
    "SELECT adj_close FROM daily_prices WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1"
  );
  const result = stmt.get(ticker, date) as { adj_close: number } | undefined;
  return result?.adj_close ?? null;
}

/**
 * 당일 주문 삭제 (재생성 용)
 */
export function deleteDailyOrders(accountId: string, date: string): void {
  const database = getConnection();
  const stmt = database.prepare("DELETE FROM daily_orders WHERE account_id = ? AND date = ?");
  stmt.run(accountId, date);
}

/**
 * 당일 주문 자동 생성
 * - 티어 고정 방식: 가장 낮은 빈 티어에만 매수 주문 (한 번에 하나의 티어만)
 * - 보유 티어: 매도 주문 생성
 */
export function generateDailyOrders(
  accountId: string,
  date: string,
  ticker: Ticker,
  strategy: Strategy,
  seedCapital: number,
  holdings: TierHolding[]
): DailyOrder[] {
  // 전일 종가 조회 (주문 생성일 기준 이전 거래일)
  const prevDate = getPreviousTradingDate(date);
  const closePrice = getClosingPrice(ticker, prevDate);

  if (!closePrice) {
    return []; // 가격 데이터 없으면 주문 생성 불가
  }

  const buyThreshold = percentToThreshold(BUY_THRESHOLDS[strategy]);
  const sellThreshold = percentToThreshold(SELL_THRESHOLDS[strategy]);
  const tierRatios = TIER_RATIOS[strategy];

  const orders: DailyOrder[] = [];

  // 기존 주문 삭제
  deleteDailyOrders(accountId, date);

  const stopLossDay = STOP_LOSS_DAYS[strategy];

  // 1. 보유 중인 티어들의 매도 주문 생성 (손절 또는 일반 매도)
  for (const holding of holdings) {
    if (holding.shares > 0 && holding.buyPrice && holding.buyDate) {
      // 보유일 계산 (거래일 기준)
      const holdingDays = calculateTradingDays(holding.buyDate, date);

      if (holdingDays >= stopLossDay) {
        // 손절일 도달: MOC 주문 (시장가, 무조건 체결)
        const order = createDailyOrder(accountId, {
          date,
          tier: holding.tier,
          type: "SELL" as OrderType,
          orderMethod: "MOC" as OrderMethod,
          limitPrice: closePrice, // MOC는 시장가이므로 종가로 설정
          shares: holding.shares,
        });
        orders.push(order);
      } else {
        // 일반 매도: LOC 주문 (지정가)
        const sellPrice = calculateSellLimitPrice(holding.buyPrice, sellThreshold);
        const order = createDailyOrder(accountId, {
          date,
          tier: holding.tier,
          type: "SELL" as OrderType,
          orderMethod: "LOC" as OrderMethod,
          limitPrice: sellPrice,
          shares: holding.shares,
        });
        orders.push(order);
      }
    }
  }

  // 2. 다음 매수할 티어 찾기 (티어 고정 방식: 가장 낮은 빈 티어)
  const nextBuyTier = getNextBuyTier(holdings);

  if (nextBuyTier !== null) {
    const tierIndex = nextBuyTier - 1;
    // Decimal로 티어 비율 및 할당 금액 계산
    const tierRatio = new Decimal(tierRatios[tierIndex]).div(100);
    const allocatedSeed = new Decimal(seedCapital).mul(tierRatio).toNumber();

    if (allocatedSeed > 0) {
      const buyPrice = calculateBuyLimitPrice(closePrice, buyThreshold);
      const shares = calculateBuyQuantity(allocatedSeed, buyPrice);

      if (shares > 0) {
        const order = createDailyOrder(accountId, {
          date,
          tier: nextBuyTier,
          type: "BUY" as OrderType,
          orderMethod: "LOC" as OrderMethod,
          limitPrice: buyPrice,
          shares,
        });
        orders.push(order);
      }
    }
  }

  return orders;
}

/**
 * 다음 매수할 티어 번호 반환 (티어 고정 방식)
 * 티어 1-6 중 가장 낮은 빈 티어를 반환
 * 티어 1-6이 모두 활성화되고 예수금이 있으면 티어 7(예비) 반환
 */
function getNextBuyTier(holdings: TierHolding[]): number | null {
  const BASE_TIER_COUNT = 6;
  const RESERVE_TIER_NUMBER = 7;

  // 보유 중인 티어 Set
  const activeTiers = new Set(holdings.filter((h) => h.shares > 0).map((h) => h.tier));

  // 티어 1-6 중 가장 낮은 빈 티어 찾기
  for (let i = 1; i <= BASE_TIER_COUNT; i++) {
    if (!activeTiers.has(i)) {
      return i;
    }
  }

  // 티어 1-6 모두 보유 중이면 예비 티어(7) 반환
  if (!activeTiers.has(RESERVE_TIER_NUMBER)) {
    return RESERVE_TIER_NUMBER;
  }

  return null; // 모든 티어 보유 중
}

// =====================================================
// 주문 체결 처리
// =====================================================

export interface ExecutionResult {
  orderId: string;
  tier: number;
  type: "BUY" | "SELL";
  executed: boolean;
  limitPrice: number;
  closePrice: number;
  shares: number;
}

/**
 * 당일 주문 체결 처리
 * - 종가 기준으로 체결 여부 판정
 * - 체결된 주문은 tier_holdings 업데이트
 * - LOC 매수: 종가 <= 지정가 → 체결 (종가로 매수)
 * - LOC 매도: 종가 >= 지정가 → 체결 (종가로 매도)
 *
 * @param accountId - 계좌 ID
 * @param date - 체결 처리할 날짜
 * @param ticker - 종목
 * @returns 체결 결과 목록
 */
export function processOrderExecution(
  accountId: string,
  date: string,
  ticker: Ticker
): ExecutionResult[] {
  // 당일 종가 조회
  const closePrice = getClosingPrice(ticker, date);
  if (!closePrice) {
    return []; // 종가 데이터 없으면 체결 처리 불가
  }

  // 당일 주문 조회
  const orders = getDailyOrders(accountId, date);
  const results: ExecutionResult[] = [];

  for (const order of orders) {
    // 이미 체결된 주문은 스킵
    if (order.executed) {
      results.push({
        orderId: order.id,
        tier: order.tier,
        type: order.type,
        executed: true,
        limitPrice: order.limitPrice,
        closePrice,
        shares: order.shares,
      });
      continue;
    }

    let shouldExecute = false;

    if (order.orderMethod === "MOC") {
      // MOC 주문: 무조건 체결 (손절용)
      shouldExecute = true;
    } else if (order.type === "BUY") {
      shouldExecute = shouldExecuteBuy(closePrice, order.limitPrice);
    } else {
      shouldExecute = shouldExecuteSell(closePrice, order.limitPrice);
    }

    if (shouldExecute) {
      // 주문 체결 처리
      updateOrderExecuted(order.id, true);

      if (order.type === "BUY") {
        // 매수 체결: 티어에 보유 정보 추가
        const sellThreshold = percentToThreshold(SELL_THRESHOLDS[getAccountStrategy(accountId)]);
        const sellTargetPrice = calculateSellLimitPrice(closePrice, sellThreshold);

        updateTierHolding(accountId, order.tier, {
          buyPrice: closePrice,
          shares: order.shares,
          buyDate: date,
          sellTargetPrice,
        });
      } else {
        // 매도 체결: 티어 보유 정보 초기화
        updateTierHolding(accountId, order.tier, {
          buyPrice: null,
          shares: 0,
          buyDate: null,
          sellTargetPrice: null,
        });
      }
    }

    results.push({
      orderId: order.id,
      tier: order.tier,
      type: order.type,
      executed: shouldExecute,
      limitPrice: order.limitPrice,
      closePrice,
      shares: order.shares,
    });
  }

  return results;
}

/**
 * 계좌의 전략 조회 (내부 헬퍼)
 */
function getAccountStrategy(accountId: string): Strategy {
  const database = getConnection();
  const stmt = database.prepare("SELECT strategy FROM trading_accounts WHERE id = ?");
  const result = stmt.get(accountId) as { strategy: string } | undefined;
  if (!result) {
    throw new Error(`Account not found: ${accountId}`);
  }
  return result.strategy as Strategy;
}

/**
 * 이전 거래일 미체결 주문 체결 처리
 * REQ-001: 오늘 주문 조회 시 이전 거래일 미체결 주문 자동 체결
 * CON-001: 종가 데이터가 없으면 체결하지 않음
 * CON-002: 이미 체결된 주문은 다시 체결하지 않음 (processOrderExecution에서 처리)
 *
 * @param accountId - 계좌 ID
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param ticker - 종목
 * @returns 체결 결과 목록
 */
export function processPreviousDayExecution(
  accountId: string,
  currentDate: string,
  ticker: Ticker
): ExecutionResult[] {
  // 1. 이전 거래일 계산 (주말 제외)
  const prevDate = getPreviousTradingDate(currentDate);

  // 2. 이전 거래일 종가 확인 (CON-001 준수: 종가 없으면 체결 불가)
  const closePrice = getClosingPrice(ticker, prevDate);
  if (!closePrice) {
    return [];
  }

  // 3. 이전 거래일 미체결 주문 조회
  const orders = getDailyOrders(accountId, prevDate);
  const hasUnexecutedOrders = orders.some((o) => !o.executed);

  if (!hasUnexecutedOrders) {
    return [];
  }

  // 4. 체결 처리 (기존 함수 재사용, CON-002 준수: 이미 체결된 주문은 스킵됨)
  return processOrderExecution(accountId, prevDate, ticker);
}
