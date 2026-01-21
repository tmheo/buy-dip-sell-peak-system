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
