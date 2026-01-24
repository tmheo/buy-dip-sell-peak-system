/**
 * 데이터베이스 스키마 정의
 */

export const CREATE_DAILY_PRICES_TABLE = `
CREATE TABLE IF NOT EXISTS daily_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL DEFAULT 'SOXL',
    date TEXT NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    adj_close REAL NOT NULL,
    volume INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
)
`;

export const CREATE_TICKER_DATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_ticker_date ON daily_prices(ticker, date)
`;

export const INSERT_DAILY_PRICE = `
INSERT OR REPLACE INTO daily_prices (ticker, date, open, high, low, close, adj_close, volume)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SELECT_ALL_PRICES = `
SELECT id, ticker, date, open, high, low, close, adj_close as adjClose, volume, created_at as createdAt
FROM daily_prices
ORDER BY ticker, date ASC
`;

export const SELECT_ALL_PRICES_BY_TICKER = `
SELECT id, ticker, date, open, high, low, close, adj_close as adjClose, volume, created_at as createdAt
FROM daily_prices
WHERE ticker = ?
ORDER BY date ASC
`;

export const SELECT_PRICES_BY_DATE_RANGE = `
SELECT id, ticker, date, open, high, low, close, adj_close as adjClose, volume, created_at as createdAt
FROM daily_prices
WHERE ticker = ? AND date >= ? AND date <= ?
ORDER BY date ASC
`;

export const SELECT_LATEST_DATE = `
SELECT date FROM daily_prices WHERE ticker = ? ORDER BY date DESC LIMIT 1
`;

export const SELECT_COUNT = `
SELECT COUNT(*) as count FROM daily_prices WHERE ticker = ?
`;

export const SELECT_TOTAL_COUNT = `
SELECT COUNT(*) as count FROM daily_prices
`;

export const SELECT_LATEST_PRICES = `
SELECT date, adj_close as adjClose FROM daily_prices WHERE ticker = ? ORDER BY date DESC LIMIT ?
`;

// =====================================================
// daily_metrics 테이블 (SPEC-PERFORMANCE-001)
// =====================================================

export const CREATE_DAILY_METRICS_TABLE = `
CREATE TABLE IF NOT EXISTS daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL DEFAULT 'SOXL',
    date TEXT NOT NULL,
    ma20 REAL,
    ma60 REAL,
    ma_slope REAL,
    disparity REAL,
    rsi14 REAL,
    roc12 REAL,
    volatility20 REAL,
    golden_cross REAL,
    is_golden_cross INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
)
`;

export const CREATE_METRICS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_metrics_ticker_date ON daily_metrics(ticker, date)
`;

export const INSERT_DAILY_METRIC = `
INSERT OR REPLACE INTO daily_metrics (ticker, date, ma20, ma60, ma_slope, disparity, rsi14, roc12, volatility20, golden_cross, is_golden_cross)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SELECT_METRICS_BY_DATE_RANGE = `
SELECT id, ticker, date,
       ma20, ma60, ma_slope as maSlope, disparity,
       rsi14, roc12, volatility20,
       golden_cross as goldenCross, is_golden_cross as isGoldenCross,
       created_at as createdAt
FROM daily_metrics
WHERE ticker = ? AND date >= ? AND date <= ?
ORDER BY date ASC
`;

export const SELECT_LATEST_METRIC_DATE = `
SELECT date FROM daily_metrics WHERE ticker = ? ORDER BY date DESC LIMIT 1
`;

export const SELECT_METRICS_COUNT = `
SELECT COUNT(*) as count FROM daily_metrics WHERE ticker = ?
`;

// =====================================================
// recommendation_cache 테이블 (백테스트 추천 성능 개선)
// =====================================================

export const CREATE_RECOMMENDATION_CACHE_TABLE = `
CREATE TABLE IF NOT EXISTS recommendation_cache (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    strategy TEXT NOT NULL,
    reason TEXT,
    rsi14 REAL,
    is_golden_cross INTEGER,
    ma_slope REAL,
    disparity REAL,
    roc12 REAL,
    volatility20 REAL,
    golden_cross REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, date)
)
`;

export const CREATE_RECOMMENDATION_CACHE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_rec_cache_ticker_date ON recommendation_cache(ticker, date)
`;

export const INSERT_RECOMMENDATION_CACHE = `
INSERT OR REPLACE INTO recommendation_cache (ticker, date, strategy, reason, rsi14, is_golden_cross, ma_slope, disparity, roc12, volatility20, golden_cross)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SELECT_RECOMMENDATION_BY_DATE = `
SELECT ticker, date, strategy, reason, rsi14, is_golden_cross as isGoldenCross, ma_slope as maSlope, disparity, roc12, volatility20, golden_cross as goldenCross
FROM recommendation_cache
WHERE ticker = ? AND date = ?
`;

export const SELECT_RECOMMENDATION_COUNT = `
SELECT COUNT(*) as count FROM recommendation_cache WHERE ticker = ?
`;

// =====================================================
// Auth.js 테이블 (Google OAuth 인증)
// =====================================================

export const CREATE_USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    email_verified INTEGER,
    image TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

export const CREATE_ACCOUNTS_TABLE = `
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_account_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;

export const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
    session_token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;

export const CREATE_USERS_EMAIL_INDEX = `
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
`;

export const CREATE_ACCOUNTS_USER_INDEX = `
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)
`;

export const CREATE_SESSIONS_USER_INDEX = `
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
`;

// =====================================================
// Trading 테이블 (PRD-TRADING-001)
// =====================================================

export const CREATE_TRADING_ACCOUNTS_TABLE = `
CREATE TABLE IF NOT EXISTS trading_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    ticker TEXT NOT NULL CHECK(ticker IN ('SOXL', 'TQQQ')),
    seed_capital REAL NOT NULL,
    strategy TEXT NOT NULL CHECK(strategy IN ('Pro1', 'Pro2', 'Pro3')),
    cycle_start_date TEXT NOT NULL,
    cycle_number INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;

export const CREATE_TRADING_ACCOUNTS_USER_INDEX = `
CREATE INDEX IF NOT EXISTS idx_trading_accounts_user_id ON trading_accounts(user_id)
`;

export const CREATE_TIER_HOLDINGS_TABLE = `
CREATE TABLE IF NOT EXISTS tier_holdings (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    tier INTEGER NOT NULL CHECK(tier >= 1 AND tier <= 7),
    buy_price REAL,
    shares INTEGER NOT NULL DEFAULT 0,
    buy_date TEXT,
    sell_target_price REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, tier),
    FOREIGN KEY (account_id) REFERENCES trading_accounts(id) ON DELETE CASCADE
)
`;

export const CREATE_TIER_HOLDINGS_ACCOUNT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_tier_holdings_account_id ON tier_holdings(account_id)
`;

export const CREATE_DAILY_ORDERS_TABLE = `
CREATE TABLE IF NOT EXISTS daily_orders (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    tier INTEGER NOT NULL CHECK(tier >= 1 AND tier <= 7),
    type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
    order_method TEXT NOT NULL CHECK(order_method IN ('LOC', 'MOC')),
    limit_price REAL NOT NULL,
    shares INTEGER NOT NULL,
    executed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES trading_accounts(id) ON DELETE CASCADE
)
`;

export const CREATE_DAILY_ORDERS_ACCOUNT_DATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_daily_orders_account_date ON daily_orders(account_id, date)
`;

// =====================================================
// profit_records 테이블 (SPEC-TRADING-002)
// 매도 체결 시 수익 기록 저장
// =====================================================

export const CREATE_PROFIT_RECORDS_TABLE = `
CREATE TABLE IF NOT EXISTS profit_records (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    tier INTEGER NOT NULL CHECK(tier >= 1 AND tier <= 7),
    ticker TEXT NOT NULL CHECK(ticker IN ('SOXL', 'TQQQ')),
    strategy TEXT NOT NULL CHECK(strategy IN ('Pro1', 'Pro2', 'Pro3')),
    buy_date TEXT NOT NULL,
    buy_price REAL NOT NULL,
    buy_quantity INTEGER NOT NULL,
    sell_date TEXT NOT NULL,
    sell_price REAL NOT NULL,
    buy_amount REAL NOT NULL,
    sell_amount REAL NOT NULL,
    profit REAL NOT NULL,
    profit_rate REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES trading_accounts(id) ON DELETE CASCADE
)
`;

export const CREATE_PROFIT_RECORDS_ACCOUNT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_profit_records_account_id ON profit_records(account_id)
`;

export const CREATE_PROFIT_RECORDS_SELL_DATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_profit_records_sell_date ON profit_records(account_id, sell_date DESC)
`;

export const INSERT_PROFIT_RECORD = `
INSERT INTO profit_records (id, account_id, tier, ticker, strategy, buy_date, buy_price, buy_quantity, sell_date, sell_price, buy_amount, sell_amount, profit, profit_rate)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SELECT_PROFIT_RECORDS_BY_ACCOUNT = `
SELECT id, account_id, tier, ticker, strategy, buy_date, buy_price, buy_quantity, sell_date, sell_price, buy_amount, sell_amount, profit, profit_rate, created_at
FROM profit_records
WHERE account_id = ?
ORDER BY sell_date DESC, tier ASC
`;
