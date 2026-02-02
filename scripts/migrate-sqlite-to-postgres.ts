/**
 * SQLite → PostgreSQL 데이터 마이그레이션 스크립트
 *
 * 사용법: DATABASE_URL="postgresql://..." npx tsx scripts/migrate-sqlite-to-postgres.ts
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  dailyPrices,
  dailyMetrics,
  users,
  accounts,
  sessions,
  tradingAccounts,
  tierHoldings,
  dailyOrders,
  profitRecords,
  recommendationCache,
} from "../src/database/schema/index";

// SQLite 연결
const sqlite = new Database("./data/prices.db", { readonly: true });

// 환경 변수 검증
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.");
  console.error("사용법: DATABASE_URL=\"postgresql://...\" npx tsx scripts/migrate-sqlite-to-postgres.ts");
  process.exit(1);
}

// PostgreSQL 연결
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const pg = drizzle(client);

// 배치 크기
const BATCH_SIZE = 500;

async function migrateTable<T>(
  tableName: string,
  sqliteQuery: string,
  pgTable: any,
  transform: (row: any) => T
): Promise<number> {
  console.log(`\n📦 Migrating ${tableName}...`);

  const rows = sqlite.prepare(sqliteQuery).all();
  console.log(`   Found ${rows.length} rows in SQLite`);

  if (rows.length === 0) {
    console.log(`   ⏭️  Skipping (no data)`);
    return 0;
  }

  let migrated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(transform);
    try {
      await pg.insert(pgTable).values(batch as any).onConflictDoNothing();
      migrated += batch.length;
      process.stdout.write(`\r   Migrated: ${migrated}/${rows.length}`);
    } catch (error: any) {
      console.error(`\n   ❌ Error at batch ${i}: ${error.message}`);
    }
  }

  console.log(`\n   ✅ Completed: ${migrated} rows`);
  return migrated;
}

async function main() {
  console.log("🚀 Starting SQLite → PostgreSQL migration");
  console.log(`   Source: ./data/prices.db`);
  console.log(`   Target: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);

  const stats: Record<string, number> = {};

  try {
    // 1. daily_prices
    stats.daily_prices = await migrateTable(
      "daily_prices",
      "SELECT ticker, date, open, high, low, close, adj_close, volume FROM daily_prices",
      dailyPrices,
      (row) => ({
        ticker: row.ticker,
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        adjClose: row.adj_close,
        volume: row.volume,
      })
    );

    // 2. daily_metrics
    stats.daily_metrics = await migrateTable(
      "daily_metrics",
      `SELECT ticker, date, ma20, ma60, ma_slope, disparity, rsi14, roc12,
              volatility20, golden_cross, is_golden_cross FROM daily_metrics`,
      dailyMetrics,
      (row) => ({
        ticker: row.ticker,
        date: row.date,
        ma20: row.ma20,
        ma60: row.ma60,
        maSlope: row.ma_slope,
        disparity: row.disparity,
        rsi14: row.rsi14,
        roc12: row.roc12,
        volatility20: row.volatility20,
        goldenCross: row.golden_cross,
        isGoldenCross: row.is_golden_cross === 1,
      })
    );

    // 3. users
    stats.users = await migrateTable(
      "users",
      "SELECT id, name, email, email_verified, image FROM users",
      users,
      (row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: row.email_verified ? new Date(row.email_verified * 1000) : null,
        image: row.image,
      })
    );

    // 4. accounts
    stats.accounts = await migrateTable(
      "accounts",
      `SELECT user_id, type, provider, provider_account_id, refresh_token,
              access_token, expires_at, token_type, scope, id_token, session_state
       FROM accounts`,
      accounts,
      (row) => ({
        userId: row.user_id,
        type: row.type,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        refresh_token: row.refresh_token,
        access_token: row.access_token,
        expires_at: row.expires_at,
        token_type: row.token_type,
        scope: row.scope,
        id_token: row.id_token,
        session_state: row.session_state,
      })
    );

    // 5. sessions
    stats.sessions = await migrateTable(
      "sessions",
      "SELECT session_token, user_id, expires FROM sessions",
      sessions,
      (row) => ({
        sessionToken: row.session_token,
        userId: row.user_id,
        expires: new Date(row.expires),
      })
    );

    // 6. trading_accounts
    stats.trading_accounts = await migrateTable(
      "trading_accounts",
      `SELECT id, user_id, name, ticker, seed_capital, strategy,
              cycle_start_date, cycle_number, created_at, updated_at FROM trading_accounts`,
      tradingAccounts,
      (row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        ticker: row.ticker,
        seedCapital: row.seed_capital,
        strategy: row.strategy,
        cycleStartDate: row.cycle_start_date,
        cycleNumber: row.cycle_number,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
      })
    );

    // 7. tier_holdings
    stats.tier_holdings = await migrateTable(
      "tier_holdings",
      `SELECT id, account_id, tier, buy_price, shares, buy_date,
              sell_target_price, created_at, updated_at FROM tier_holdings`,
      tierHoldings,
      (row) => ({
        id: row.id,
        accountId: row.account_id,
        tier: row.tier,
        buyPrice: row.buy_price,
        shares: row.shares,
        buyDate: row.buy_date,
        sellTargetPrice: row.sell_target_price,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
      })
    );

    // 8. daily_orders
    stats.daily_orders = await migrateTable(
      "daily_orders",
      `SELECT id, account_id, date, tier, type, order_method, limit_price,
              shares, executed, created_at, updated_at FROM daily_orders`,
      dailyOrders,
      (row) => ({
        id: row.id,
        accountId: row.account_id,
        date: row.date,
        tier: row.tier,
        type: row.type,
        orderMethod: row.order_method,
        limitPrice: row.limit_price,
        shares: row.shares,
        executed: row.executed === 1,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
      })
    );

    // 9. profit_records
    stats.profit_records = await migrateTable(
      "profit_records",
      `SELECT id, account_id, tier, ticker, strategy, buy_date, buy_price,
              buy_quantity, sell_date, sell_price, buy_amount, sell_amount,
              profit, profit_rate, created_at FROM profit_records`,
      profitRecords,
      (row) => ({
        id: row.id,
        accountId: row.account_id,
        tier: row.tier,
        ticker: row.ticker,
        strategy: row.strategy,
        buyDate: row.buy_date,
        buyPrice: row.buy_price,
        buyQuantity: row.buy_quantity,
        sellDate: row.sell_date,
        sellPrice: row.sell_price,
        buyAmount: row.buy_amount,
        sellAmount: row.sell_amount,
        profit: row.profit,
        profitRate: row.profit_rate,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      })
    );

    // 10. recommendation_cache
    stats.recommendation_cache = await migrateTable(
      "recommendation_cache",
      `SELECT ticker, date, strategy, reason, rsi14, is_golden_cross,
              ma_slope, disparity, roc12, volatility20, golden_cross, created_at
       FROM recommendation_cache`,
      recommendationCache,
      (row) => ({
        ticker: row.ticker,
        date: row.date,
        strategy: row.strategy,
        reason: row.reason,
        rsi14: row.rsi14,
        isGoldenCross: row.is_golden_cross === 1,
        maSlope: row.ma_slope,
        disparity: row.disparity,
        roc12: row.roc12,
        volatility20: row.volatility20,
        goldenCross: row.golden_cross,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      })
    );

    // 결과 출력
    console.log("\n" + "=".repeat(50));
    console.log("📊 Migration Summary");
    console.log("=".repeat(50));
    let total = 0;
    for (const [table, count] of Object.entries(stats)) {
      console.log(`   ${table}: ${count} rows`);
      total += count;
    }
    console.log("-".repeat(50));
    console.log(`   Total: ${total} rows migrated`);
    console.log("=".repeat(50));
    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    sqlite.close();
    await client.end();
  }
}

main();
