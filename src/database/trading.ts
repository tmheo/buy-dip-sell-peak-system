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
  ProfitRecord,
  MonthlyProfitSummary,
  ProfitStatusResponse,
} from "@/types/trading";
import {
  TIER_COUNT,
  TIER_RATIOS,
  BUY_THRESHOLDS,
  SELL_THRESHOLDS,
  STOP_LOSS_DAYS,
} from "@/types/trading";

// 티어 관련 상수
const BASE_TIER_COUNT = 6;
const RESERVE_TIER_NUMBER = 7;

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
  CREATE_PROFIT_RECORDS_TABLE,
  CREATE_PROFIT_RECORDS_ACCOUNT_INDEX,
  CREATE_PROFIT_RECORDS_SELL_DATE_INDEX,
  INSERT_PROFIT_RECORD,
  SELECT_PROFIT_RECORDS_BY_ACCOUNT,
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
  database.exec(CREATE_PROFIT_RECORDS_TABLE);
  database.exec(CREATE_PROFIT_RECORDS_ACCOUNT_INDEX);
  database.exec(CREATE_PROFIT_RECORDS_SELL_DATE_INDEX);

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

interface ProfitRecordRow {
  id: string;
  account_id: string;
  tier: number;
  ticker: string;
  strategy: string;
  buy_date: string;
  buy_price: number;
  buy_quantity: number;
  sell_date: string;
  sell_price: number;
  buy_amount: number;
  sell_amount: number;
  profit: number;
  profit_rate: number;
  created_at: string;
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

function mapProfitRecordRow(row: ProfitRecordRow): ProfitRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    tier: row.tier,
    ticker: row.ticker as Ticker,
    strategy: row.strategy as Strategy,
    buyDate: row.buy_date,
    buyPrice: row.buy_price,
    buyQuantity: row.buy_quantity,
    sellDate: row.sell_date,
    sellPrice: row.sell_price,
    buyAmount: row.buy_amount,
    sellAmount: row.sell_amount,
    profit: row.profit,
    profitRate: row.profit_rate,
    createdAt: row.created_at,
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
  // 이번에 새로 체결된 매도 여부 추적 (이미 체결된 주문은 제외)
  let hasNewSellExecution = false;

  for (const order of orders) {
    // 이미 체결된 주문은 스킵 (결과에만 포함, 사이클 완료 체크에서 제외)
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
        // 매도 체결: 수익 기록 생성 후 티어 보유 정보 초기화
        // 티어 초기화 전에 현재 보유 정보로 수익 기록 생성
        const holdings = getTierHoldings(accountId);
        const tierHolding = holdings.find((h) => h.tier === order.tier);

        if (tierHolding && tierHolding.buyPrice && tierHolding.buyDate && tierHolding.shares > 0) {
          const strategy = getAccountStrategy(accountId);
          createProfitRecord({
            accountId,
            tier: order.tier,
            ticker,
            strategy,
            buyDate: tierHolding.buyDate,
            buyPrice: tierHolding.buyPrice,
            buyQuantity: tierHolding.shares,
            sellDate: date,
            sellPrice: closePrice,
          });
        }

        // 티어 보유 정보 초기화
        updateTierHolding(accountId, order.tier, {
          buyPrice: null,
          shares: 0,
          buyDate: null,
          sellTargetPrice: null,
        });

        // 이번에 새로 체결된 매도 표시
        hasNewSellExecution = true;
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

  // 이번에 새로 체결된 매도가 있으면 사이클 완료 여부 확인
  // (이미 체결된 주문은 제외하여 중복 사이클 증가 방지)
  if (hasNewSellExecution) {
    const remainingShares = getTotalShares(accountId);
    if (remainingShares === 0) {
      // 모든 티어가 비었으면 사이클 완료
      completeCycleAndIncrement(accountId);
    }
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
 * 사이클 완료 시 cycleNumber 증가
 * 모든 티어가 비었을 때 호출되어 다음 사이클을 준비
 *
 * @param accountId - 계좌 ID
 * @returns 업데이트된 cycleNumber, 계좌가 없으면 null
 */
export function completeCycleAndIncrement(accountId: string): number | null {
  const database = getConnection();

  // 1. 현재 cycle_number 조회
  const selectStmt = database.prepare("SELECT cycle_number FROM trading_accounts WHERE id = ?");
  const current = selectStmt.get(accountId) as { cycle_number: number } | undefined;

  if (!current) {
    return null;
  }

  // 2. cycle_number 증가
  const newCycleNumber = current.cycle_number + 1;
  const updateStmt = database.prepare(
    "UPDATE trading_accounts SET cycle_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  );
  updateStmt.run(newCycleNumber, accountId);

  return newCycleNumber;
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

/**
 * 사이클 시작일부터 어제까지의 모든 주문을 순차적으로 처리
 * - 각 거래일에 대해 주문이 없으면 생성하고, 체결 조건을 확인하여 처리
 * - 체결 결과에 따라 holdings가 업데이트되므로 순차 처리 필수
 *
 * @param accountId - 계좌 ID
 * @param cycleStartDate - 사이클 시작일 (YYYY-MM-DD)
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param ticker - 종목
 * @param strategy - 전략
 * @param seedCapital - 시드 캐피털
 * @returns 전체 체결 결과 목록
 */
export function processHistoricalOrders(
  accountId: string,
  cycleStartDate: string,
  currentDate: string,
  ticker: Ticker,
  strategy: Strategy,
  seedCapital: number
): ExecutionResult[] {
  const allResults: ExecutionResult[] = [];

  // 사이클 시작일부터 어제까지의 모든 거래일 순회
  let processingDate = cycleStartDate;
  const yesterday = getPreviousTradingDate(currentDate);

  // 종료 조건: processingDate > yesterday
  while (processingDate <= yesterday) {
    // 1. 해당 날짜의 종가 확인
    const closePrice = getClosingPrice(ticker, processingDate);

    if (closePrice) {
      // 2. 해당 날짜의 주문 조회
      let orders = getDailyOrders(accountId, processingDate);

      // 3. 주문이 없으면 생성 (현재 holdings 상태 기준)
      if (orders.length === 0) {
        const holdings = getTierHoldings(accountId);
        orders = generateDailyOrders(
          accountId,
          processingDate,
          ticker,
          strategy,
          seedCapital,
          holdings
        );
      }

      // 4. 미체결 주문이 있으면 체결 처리
      const hasUnexecutedOrders = orders.some((o) => !o.executed);
      if (hasUnexecutedOrders) {
        const results = processOrderExecution(accountId, processingDate, ticker);
        allResults.push(...results);
      }
    }

    // 5. 다음 거래일로 이동
    processingDate = getNextTradingDate(processingDate);
  }

  return allResults;
}

/**
 * 다음 거래일 계산 (주말 제외)
 */
function getNextTradingDate(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setDate(d.getDate() + 1);

  // 주말이면 월요일로 이동
  const dayOfWeek = d.getUTCDay();
  if (dayOfWeek === 0) {
    // Sunday -> Monday
    d.setDate(d.getDate() + 1);
  } else if (dayOfWeek === 6) {
    // Saturday -> Monday
    d.setDate(d.getDate() + 2);
  }

  return d.toISOString().split("T")[0];
}

// =====================================================
// Profit Records CRUD (SPEC-TRADING-002)
// =====================================================

/**
 * 수익 기록 생성
 * 매도 체결 시 호출되어 수익 기록을 저장
 * Decimal.js로 정밀한 금융 계산 수행
 */
export function createProfitRecord(data: {
  accountId: string;
  tier: number;
  ticker: Ticker;
  strategy: Strategy;
  buyDate: string;
  buyPrice: number;
  buyQuantity: number;
  sellDate: string;
  sellPrice: number;
}): ProfitRecord {
  const database = getConnection();
  const id = randomUUID();

  // Decimal.js로 정밀한 금융 계산
  const buyAmount = new Decimal(data.buyPrice)
    .mul(data.buyQuantity)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  const sellAmount = new Decimal(data.sellPrice)
    .mul(data.buyQuantity)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  const profit = new Decimal(sellAmount)
    .minus(buyAmount)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // 수익률 계산: (매도금액 - 매수금액) / 매수금액 * 100
  const profitRate = new Decimal(profit)
    .div(buyAmount)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  const stmt = database.prepare(INSERT_PROFIT_RECORD);
  stmt.run(
    id,
    data.accountId,
    data.tier,
    data.ticker,
    data.strategy,
    data.buyDate,
    data.buyPrice,
    data.buyQuantity,
    data.sellDate,
    data.sellPrice,
    buyAmount,
    sellAmount,
    profit,
    profitRate
  );

  return {
    id,
    accountId: data.accountId,
    tier: data.tier,
    ticker: data.ticker,
    strategy: data.strategy,
    buyDate: data.buyDate,
    buyPrice: data.buyPrice,
    buyQuantity: data.buyQuantity,
    sellDate: data.sellDate,
    sellPrice: data.sellPrice,
    buyAmount,
    sellAmount,
    profit,
    profitRate,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 계좌의 모든 수익 기록 조회
 */
export function getProfitRecords(accountId: string): ProfitRecord[] {
  const database = getConnection();
  const stmt = database.prepare(SELECT_PROFIT_RECORDS_BY_ACCOUNT);
  const rows = stmt.all(accountId) as ProfitRecordRow[];
  return rows.map(mapProfitRecordRow);
}

interface ProfitAggregate {
  totalTrades: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalProfit: number;
  averageProfitRate: number;
}

/**
 * 수익 기록들의 합계 계산 (Decimal.js 정밀도)
 */
function aggregateProfits(records: ProfitRecord[]): ProfitAggregate {
  let buyAmount = new Decimal(0);
  let sellAmount = new Decimal(0);
  let profit = new Decimal(0);

  for (const record of records) {
    buyAmount = buyAmount.plus(record.buyAmount);
    sellAmount = sellAmount.plus(record.sellAmount);
    profit = profit.plus(record.profit);
  }

  const averageProfitRate = buyAmount.isZero()
    ? 0
    : profit.div(buyAmount).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  return {
    totalTrades: records.length,
    totalBuyAmount: buyAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalSellAmount: sellAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalProfit: profit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    averageProfitRate,
  };
}

/**
 * 수익 기록을 월별로 그룹화하여 요약 생성
 */
export function groupProfitsByMonth(accountId: string): ProfitStatusResponse {
  const records = getProfitRecords(accountId);

  // 월별로 그룹화
  const monthlyMap = new Map<string, ProfitRecord[]>();
  for (const record of records) {
    const yearMonth = record.sellDate.substring(0, 7);
    const monthRecords = monthlyMap.get(yearMonth) ?? [];
    monthRecords.push(record);
    monthlyMap.set(yearMonth, monthRecords);
  }

  // 월별 요약 생성 (과거 월 우선)
  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  const months: MonthlyProfitSummary[] = sortedMonths.map((yearMonth) => {
    const monthRecords = monthlyMap.get(yearMonth)!;
    const aggregate = aggregateProfits(monthRecords);
    return {
      yearMonth,
      records: monthRecords,
      ...aggregate,
    };
  });

  // 전체 총계 계산
  const grandTotal = aggregateProfits(records);

  return {
    accountId,
    months,
    grandTotal,
  };
}
