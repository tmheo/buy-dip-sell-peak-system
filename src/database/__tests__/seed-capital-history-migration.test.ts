/**
 * seed_capital_history 마이그레이션의 첫 줄 채우기와 검사 (ADR-0005, #116)
 * (20261110000000_add_seed_capital_history.sql)
 *
 * CI는 이 마이그레이션을 빈 테이블에 적용하므로, 기존 계좌에 첫 줄을 채우는 일과 실패
 * 검사는 거기서 검증되지 않는다. 이 테스트는 trading_accounts를 임시 테이블로 복제하고
 * seed_capital을 마이그레이션 전처럼 되살린 뒤 마이그레이션을 돌려 본다
 * (방식은 src/test-utils/migration-clone.ts 참고).
 * CI는 seed_capital 칸을 지운 뒤(#120)의 drizzle 스키마 위에 이 마이그레이션을 다시 적용하므로,
 * 그 경우도 따로 돌려 본다.
 */
import type postgres from "postgres";
import { describe, it, expect } from "vitest";
import { hasDb } from "@/test-utils/db";
import {
  cloneTable,
  cloneTradingAccountsWithSeedCapital,
  setUpMigrationClone,
} from "@/test-utils/migration-clone";

interface HistoryRow {
  account: string;
  effectiveDate: string;
  seedCapital: number;
}

interface Migrated {
  history: HistoryRow[];
  /** seed_capital 칸이 없으면 null */
  seedCapitalNullable: string | null;
  rowSecurity: boolean;
}

describe.skipIf(!hasDb)("seed_capital_history 마이그레이션", () => {
  const clone = setUpMigrationClone("20261110000000_add_seed_capital_history.sql");

  async function insertHistory(tx: postgres.Sql, history: HistoryRow[]) {
    for (const h of history) {
      await tx`
        INSERT INTO pg_temp.seed_capital_history (account_id, effective_date, seed_capital)
        VALUES (${h.account}, ${h.effectiveDate}, ${h.seedCapital})`;
    }
  }

  async function inspect(tx: postgres.Sql): Promise<Migrated> {
    const history = await tx<Array<{ account: string; effectiveDate: string; seed: string }>>`
      SELECT account_id AS account, effective_date::text AS "effectiveDate", seed_capital AS seed
      FROM pg_temp.seed_capital_history
      ORDER BY account_id, effective_date`;
    const [column] = await tx<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = pg_my_temp_schema()::regnamespace::text
        AND table_name = 'trading_accounts' AND column_name = 'seed_capital'`;
    const [security] = await tx<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE oid = 'pg_temp.seed_capital_history'::regclass`;
    return {
      history: history.map((h) => ({
        account: h.account,
        effectiveDate: h.effectiveDate,
        seedCapital: Number(h.seed),
      })),
      seedCapitalNullable: column?.is_nullable ?? null,
      rowSecurity: security.relrowsecurity,
    };
  }

  /**
   * 시드 이력을 들이기 전, 계좌에 seed_capital 칸이 있던 때의 복제본에 테스트용 계좌를 넣고
   * 마이그레이션을 times번 적용한다. 첫 적용 뒤 laterHistory를 넣는다 - 새 코드가 시드를 바꿔
   * 생긴 줄이다.
   */
  function migrate(
    accounts: Array<{ id: string; seedCapital: number | null; createdAt: string }>,
    { laterHistory = [], times = 1 }: { laterHistory?: HistoryRow[]; times?: number } = {}
  ) {
    return clone.run({
      setup: async (tx) => {
        await cloneTradingAccountsWithSeedCapital(tx);
        for (const a of accounts) {
          await tx`
            INSERT INTO pg_temp.trading_accounts
              (id, user_id, name, ticker, seed_capital, strategy, cycle_start_date, cycle_number, created_at)
            VALUES (${a.id}, 'migration-test', ${a.id}, 'SOXL', ${a.seedCapital}, 'Pro1',
                    '2025-01-02', 1, ${a.createdAt})`;
        }
        // 마이그레이션 전에는 NOT NULL이었다. seed_capital이 없는 계좌를 넣는 테스트만 열어 둔다
        if (accounts.every((a) => a.seedCapital !== null)) {
          await tx.unsafe(
            "ALTER TABLE pg_temp.trading_accounts ALTER COLUMN seed_capital SET NOT NULL"
          );
        }
      },
      apply: async (tx, migrate) => {
        await migrate();
        await insertHistory(tx, laterHistory);
        for (let i = 1; i < times; i++) await migrate();
      },
      inspect,
    });
  }

  /**
   * seed_capital 칸을 지운 뒤(#120)의 복제본에 계좌와 이력을 넣고 마이그레이션을 다시 적용한다.
   * CI는 칸이 없는 drizzle 스키마로 테이블을 먼저 만든 뒤 마이그레이션을 모두 적용한다.
   */
  function migrateAfterSeedCapitalDropped(
    accounts: Array<{ id: string; createdAt: string }>,
    history: HistoryRow[]
  ) {
    return clone.run({
      setup: async (tx) => {
        await cloneTable(tx, "trading_accounts", ["DEFAULTS", "INDEXES"]);
        // 실제 테이블에 칸이 남아 있는 로컬 DB에서도 칸을 지운 뒤의 모습을 만든다
        await tx.unsafe("ALTER TABLE pg_temp.trading_accounts DROP COLUMN IF EXISTS seed_capital");
        await cloneTable(tx, "seed_capital_history", ["DEFAULTS", "INDEXES"]);
        for (const a of accounts) {
          await tx`
            INSERT INTO pg_temp.trading_accounts
              (id, user_id, name, ticker, strategy, cycle_start_date, cycle_number, created_at)
            VALUES (${a.id}, 'migration-test', ${a.id}, 'SOXL', 'Pro1',
                    '2025-01-02', 1, ${a.createdAt})`;
        }
        await insertHistory(tx, history);
      },
      inspect,
    });
  }

  it("계좌마다 만든 날을 적용일로, 지금 시드를 시드로 첫 줄을 쓰고 seed_capital의 NOT NULL을 푼다", async () => {
    const result = await migrate([
      { id: "A", seedCapital: 10_000, createdAt: "2026-07-01 09:00:00" },
      // created_at은 UTC 시각이다 - 한국 시각으로는 다음 날이어도 UTC 날짜를 쓴다
      { id: "B", seedCapital: 65_303.83, createdAt: "2026-10-20 23:30:00" },
    ]);

    expect(result).toEqual({
      ok: true,
      history: [
        { account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 },
        { account: "B", effectiveDate: "2026-10-20", seedCapital: 65_303.83 },
      ],
      seedCapitalNullable: "YES",
      rowSecurity: true,
    });
  });

  it("다시 적용해도 이력이 있는 계좌에는 줄을 더하지 않는다", async () => {
    const result = await migrate(
      [{ id: "A", seedCapital: 10_000, createdAt: "2026-07-01 09:00:00" }],
      {
        // 첫 적용 뒤 새 코드가 시드를 바꿔 seed_capital과 다른 줄이 생겼다
        laterHistory: [{ account: "A", effectiveDate: "2026-11-11", seedCapital: 3_000 }],
        times: 2,
      }
    );

    expect(result).toMatchObject({
      ok: true,
      history: [
        { account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 },
        { account: "A", effectiveDate: "2026-11-11", seedCapital: 3_000 },
      ],
    });
  });

  it("seed_capital 칸을 지운 뒤에 다시 적용해도 이력을 그대로 두고 실패하지 않는다", async () => {
    const result = await migrateAfterSeedCapitalDropped(
      [{ id: "A", createdAt: "2026-07-01 09:00:00" }],
      [{ account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 }]
    );

    expect(result).toEqual({
      ok: true,
      history: [{ account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 }],
      seedCapitalNullable: null,
      rowSecurity: true,
    });
  });

  it("줄을 채우지 못한 계좌가 남으면 실패한다", async () => {
    const result = await migrate([
      { id: "A", seedCapital: 10_000, createdAt: "2026-07-01 09:00:00" },
      { id: "C", seedCapital: null, createdAt: "2026-07-02 09:00:00" },
    ]);

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("account C has no seed_capital_history row"),
    });
  });
});
