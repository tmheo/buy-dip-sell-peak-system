/**
 * seed_capital_history 마이그레이션(마이그레이션 A)의 첫 줄 채우기와 검사 (ADR-0005, #116)
 *
 * CI는 이 마이그레이션을 빈 테이블에 적용하므로, 기존 계좌에 첫 줄을 채우는 로직과 실패
 * 검사는 거기서 검증되지 않는다. 이 테스트는 마이그레이션 SQL 본문을 픽스처 데이터에 그대로
 * 돌려 본다 (profit-records-cycle-number-migration.test.ts와 같은 방식).
 *
 * 실제 테이블은 건드리지 않는다. 한 트랜잭션 안에서 trading_accounts의 구조를 임시 테이블로
 * 복제하고 seed_capital을 마이그레이션 전처럼 NOT NULL로 되돌린 뒤, 마이그레이션의 `public.`을
 * `pg_temp.`로 바꿔 그 복제본에 적용한다. 트랜잭션은 매번 되돌린다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasDb } from "@/test-utils/db";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../supabase/migrations/20261110000000_add_seed_capital_history.sql"
);

/** 트랜잭션을 되돌리기 위해 던지는 표식 */
class Rollback extends Error {}

interface Fixture {
  accounts: Array<{ id: string; seedCapital: number | null; createdAt: string }>;
  /** 마이그레이션 전에 이미 있던 이력 (다시 적용하는 경우) */
  history?: Array<{ account: string; effectiveDate: string; seedCapital: number }>;
}

interface Migrated {
  history: Array<{ account: string; effectiveDate: string; seedCapital: number }>;
  seedCapitalNullable: string;
  rowSecurity: boolean;
}

describe.skipIf(!hasDb)("seed_capital_history 마이그레이션", () => {
  let sql: postgres.Sql;
  let migrationSql: string;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
    migrationSql = readFileSync(MIGRATION_PATH, "utf8").replaceAll("public.", "pg_temp.");
  });

  afterAll(async () => {
    await sql.end();
  });

  /**
   * 마이그레이션 전 상태의 임시 복제본에 픽스처를 넣고 마이그레이션을 times번 적용한다.
   * 성공하면 이력과 칸 상태를, 실패하면 마이그레이션이 던진 에러를 돌려준다.
   */
  async function migrate(
    fixture: Fixture,
    times = 1
  ): Promise<({ ok: true } & Migrated) | { ok: false; error: string }> {
    let outcome: ({ ok: true } & Migrated) | { ok: false; error: string } | undefined;
    try {
      await sql.begin(async (transaction) => {
        // postgres-js의 TransactionSql 타입은 Omit 때문에 호출 시그니처를 잃는다 - 런타임은 Sql과 같다
        const tx = transaction as unknown as postgres.Sql;
        await tx.unsafe(
          "CREATE TEMP TABLE trading_accounts (LIKE public.trading_accounts INCLUDING DEFAULTS INCLUDING INDEXES)"
        );
        // 픽스처에 seed_capital이 없는 계좌를 넣을 수 있게 열어 두고, 그런 계좌가 없으면
        // 마이그레이션 전처럼 NOT NULL로 되돌린다
        await tx.unsafe(
          "ALTER TABLE pg_temp.trading_accounts ALTER COLUMN seed_capital DROP NOT NULL"
        );

        for (const a of fixture.accounts) {
          await tx`
            INSERT INTO pg_temp.trading_accounts
              (id, user_id, name, ticker, seed_capital, strategy, cycle_start_date, cycle_number, created_at)
            VALUES (${a.id}, 'migration-test', ${a.id}, 'SOXL', ${a.seedCapital}, 'Pro1',
                    '2025-01-02', 1, ${a.createdAt})`;
        }
        if (fixture.accounts.every((a) => a.seedCapital !== null)) {
          await tx.unsafe(
            "ALTER TABLE pg_temp.trading_accounts ALTER COLUMN seed_capital SET NOT NULL"
          );
        }

        try {
          for (let i = 0; i < times; i++) {
            await tx.unsafe(migrationSql);
            if (i === 0) {
              for (const h of fixture.history ?? []) {
                await tx`
                  INSERT INTO pg_temp.seed_capital_history (account_id, effective_date, seed_capital)
                  VALUES (${h.account}, ${h.effectiveDate}, ${h.seedCapital})`;
              }
            }
          }
        } catch (error) {
          outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
          throw new Rollback();
        }

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
        outcome = {
          ok: true,
          history: history.map((h) => ({
            account: h.account,
            effectiveDate: h.effectiveDate,
            seedCapital: Number(h.seed),
          })),
          seedCapitalNullable: column.is_nullable,
          rowSecurity: security.relrowsecurity,
        };
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    if (!outcome) throw new Error("migration outcome missing");
    return outcome;
  }

  it("계좌마다 만든 날을 적용일로, 지금 시드를 시드로 첫 줄을 쓰고 seed_capital의 NOT NULL을 푼다", async () => {
    const result = await migrate({
      accounts: [
        { id: "A", seedCapital: 10_000, createdAt: "2026-07-01 09:00:00" },
        // created_at은 UTC 시각이다 - 한국 시각으로는 다음 날이어도 UTC 날짜를 쓴다
        { id: "B", seedCapital: 65_303.83, createdAt: "2026-10-20 23:30:00" },
      ],
    });

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
      {
        accounts: [{ id: "A", seedCapital: 10_000, createdAt: "2026-07-01 09:00:00" }],
        // 첫 적용 뒤 새 코드가 시드를 바꿔 seed_capital과 다른 줄이 생겼다
        history: [{ account: "A", effectiveDate: "2026-11-11", seedCapital: 3_000 }],
      },
      2
    );

    expect(result).toMatchObject({
      ok: true,
      history: [
        { account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 },
        { account: "A", effectiveDate: "2026-11-11", seedCapital: 3_000 },
      ],
    });
  });

  it("줄을 채우지 못한 계좌가 남으면 실패한다", async () => {
    const result = await migrate({
      accounts: [
        { id: "A", seedCapital: 10_000, createdAt: "2026-07-01 09:00:00" },
        { id: "C", seedCapital: null, createdAt: "2026-07-02 09:00:00" },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("account C has no seed_capital_history row"),
    });
  });
});
