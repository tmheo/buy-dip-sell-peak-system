/**
 * trading_accounts.seed_capital 칸 삭제 마이그레이션의 확인과 삭제 (#120)
 * (20261111000000_drop_trading_accounts_seed_capital.sql)
 *
 * CI는 이 마이그레이션을 칸이 없는 빈 테이블에 적용하므로, 칸을 지우기 전의 확인(시드 이력 줄이
 * 없는 계좌가 있으면 실패)은 거기서 검증되지 않는다. 이 테스트는 trading_accounts와
 * seed_capital_history를 임시 테이블로 복제하고 seed_capital 칸을 되살린 뒤 마이그레이션을 돌려
 * 본다 (방식은 src/test-utils/migration-clone.ts 참고).
 */
import { describe, it, expect } from "vitest";
import { hasDb } from "@/test-utils/db";
import {
  cloneTable,
  cloneTradingAccountsWithSeedCapital,
  setUpMigrationClone,
} from "@/test-utils/migration-clone";

interface Fixture {
  accounts: Array<{ id: string; seedCapital: number | null }>;
  history: Array<{ account: string; effectiveDate: string; seedCapital: number }>;
}

describe.skipIf(!hasDb)("seed_capital 칸 삭제 마이그레이션", () => {
  const clone = setUpMigrationClone("20261111000000_drop_trading_accounts_seed_capital.sql");

  /**
   * 시드 이력 도입(#116) 뒤의 모습(칸은 남아 있고 NOT NULL은 풀려 있다)을 만든 복제본에
   * 테스트용 계좌와 이력을 넣고 마이그레이션을 times번 적용한다.
   * 성공하면 계좌 칸 목록과 남은 이력 줄 수를 돌려준다.
   */
  function migrate(fixture: Fixture, times = 1) {
    return clone.run({
      setup: async (tx) => {
        await cloneTradingAccountsWithSeedCapital(tx);
        await cloneTable(tx, "seed_capital_history", ["DEFAULTS", "INDEXES"]);
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
      },
      apply: async (_tx, migrate) => {
        for (let i = 0; i < times; i++) await migrate();
      },
      inspect: async (tx) => {
        const columns = await tx<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = pg_my_temp_schema()::regnamespace::text
            AND table_name = 'trading_accounts'
          ORDER BY column_name`;
        const [history] = await tx<{ rows: number }[]>`
          SELECT count(*)::int AS rows FROM pg_temp.seed_capital_history`;
        return { columns: columns.map((c) => c.column_name), historyRows: history.rows };
      },
    });
  }

  it("모든 계좌에 시드 이력이 있으면 seed_capital 칸만 지우고 이력은 그대로 둔다", async () => {
    const result = await migrate({
      accounts: [
        // 시드 이력 도입(#116) 전에 만든 계좌는 칸에 옛 시드가, 그 뒤에 만든 계좌는 빈 칸이 남아 있다
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
