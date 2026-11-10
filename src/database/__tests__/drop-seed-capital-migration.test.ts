/**
 * trading_accounts.seed_capital 칸 삭제 마이그레이션(마이그레이션 B)의 확인과 삭제 (#120)
 *
 * CI는 이 마이그레이션을 칸이 없는 빈 테이블에 적용하므로, 칸을 지우기 전의 확인(시드 이력 줄이
 * 없는 계좌가 있으면 실패)은 거기서 검증되지 않는다. 이 테스트는 마이그레이션 SQL 본문을 테스트용
 * 계좌 데이터에 그대로 돌려 본다 (seed-capital-history-migration.test.ts와 같은 방식).
 *
 * 실제 테이블은 건드리지 않는다. 한 트랜잭션 안에서 trading_accounts와 seed_capital_history의
 * 구조를 임시 테이블로 복제하고 seed_capital 칸을 마이그레이션 전처럼 되살린 뒤, 마이그레이션의
 * `public.`을 `pg_temp.`로 바꿔 그 복제본에 적용한다. 트랜잭션은 매번 되돌린다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasDb } from "@/test-utils/db";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../supabase/migrations/20261111000000_drop_trading_accounts_seed_capital.sql"
);

/** 트랜잭션을 되돌리려고 일부러 던지는 오류 */
class Rollback extends Error {}

interface Fixture {
  accounts: Array<{ id: string; seedCapital: number | null }>;
  history: Array<{ account: string; effectiveDate: string; seedCapital: number }>;
}

describe.skipIf(!hasDb)("seed_capital 칸 삭제 마이그레이션", () => {
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
   * 마이그레이션 전 상태의 임시 복제본에 테스트용 계좌와 이력을 넣고 마이그레이션을 times번 적용한다.
   * 성공하면 계좌 칸 목록과 남은 이력을, 실패하면 마이그레이션이 던진 에러를 돌려준다.
   */
  async function migrate(
    fixture: Fixture,
    times = 1
  ): Promise<{ ok: true; columns: string[]; historyRows: number } | { ok: false; error: string }> {
    let outcome:
      | { ok: true; columns: string[]; historyRows: number }
      | { ok: false; error: string }
      | undefined;
    try {
      await sql.begin(async (transaction) => {
        // postgres-js의 TransactionSql 타입은 Omit 때문에 함수로 부를 수 없게 적혀 있다 -
        // 실제 객체는 Sql처럼 부를 수 있다
        const tx = transaction as unknown as postgres.Sql;
        await tx.unsafe(
          "CREATE TEMP TABLE trading_accounts (LIKE public.trading_accounts INCLUDING DEFAULTS INCLUDING INDEXES)"
        );
        // 마이그레이션 A 뒤의 모습 - 칸은 남아 있고 NOT NULL은 풀려 있다
        await tx.unsafe(
          "ALTER TABLE pg_temp.trading_accounts ADD COLUMN IF NOT EXISTS seed_capital numeric(14, 2)"
        );
        await tx.unsafe(
          "CREATE TEMP TABLE seed_capital_history (LIKE public.seed_capital_history INCLUDING DEFAULTS INCLUDING INDEXES)"
        );

        for (const a of fixture.accounts) {
          await tx`
            INSERT INTO pg_temp.trading_accounts
              (id, user_id, name, ticker, seed_capital, strategy, cycle_start_date, cycle_number)
            VALUES (${a.id}, 'migration-test', ${a.id}, 'SOXL', ${a.seedCapital}, 'Pro1',
                    '2025-01-02', 1)`;
        }
        for (const h of fixture.history) {
          await tx`
            INSERT INTO pg_temp.seed_capital_history (account_id, effective_date, seed_capital)
            VALUES (${h.account}, ${h.effectiveDate}, ${h.seedCapital})`;
        }

        try {
          for (let i = 0; i < times; i++) {
            await tx.unsafe(migrationSql);
          }
        } catch (error) {
          outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
          throw new Rollback();
        }

        const columns = await tx<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = pg_my_temp_schema()::regnamespace::text
            AND table_name = 'trading_accounts'
          ORDER BY column_name`;
        const [history] = await tx<{ rows: number }[]>`
          SELECT count(*)::int AS rows FROM pg_temp.seed_capital_history`;
        outcome = {
          ok: true,
          columns: columns.map((c) => c.column_name),
          historyRows: history.rows,
        };
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    if (!outcome) throw new Error("migration outcome missing");
    return outcome;
  }

  it("모든 계좌에 시드 이력이 있으면 seed_capital 칸만 지우고 이력은 그대로 둔다", async () => {
    const result = await migrate({
      accounts: [
        // 마이그레이션 A 전에 만든 계좌는 칸에 옛 시드가, 새 코드가 만든 계좌는 빈 칸이 남아 있다
        { id: "A", seedCapital: 10_000 },
        { id: "B", seedCapital: null },
      ],
      history: [
        { account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 },
        { account: "A", effectiveDate: "2026-11-11", seedCapital: 3_000 },
        { account: "B", effectiveDate: "2026-11-10", seedCapital: 5_000 },
      ],
    });

    expect(result).toMatchObject({ ok: true, historyRows: 3 });
    expect(result.ok && result.columns).not.toContain("seed_capital");
    expect(result.ok && result.columns).toContain("strategy");
  });

  it("다시 적용해도 실패하지 않는다", async () => {
    const result = await migrate(
      {
        accounts: [{ id: "A", seedCapital: 10_000 }],
        history: [{ account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 }],
      },
      2
    );

    expect(result).toMatchObject({ ok: true, historyRows: 1 });
    expect(result.ok && result.columns).not.toContain("seed_capital");
  });

  it("시드 이력 줄이 없는 계좌가 있으면 칸을 지우지 않고 실패한다", async () => {
    const result = await migrate({
      accounts: [
        { id: "A", seedCapital: 10_000 },
        { id: "C", seedCapital: 7_000 },
      ],
      history: [{ account: "A", effectiveDate: "2026-07-01", seedCapital: 10_000 }],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("account C has no seed_capital_history row"),
    });
  });
});
