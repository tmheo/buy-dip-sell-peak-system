/**
 * profit_records.cycle_number 마이그레이션의 번호 매기기와 검사 (#97, ADR-0003)
 * (20261109000000_add_profit_records_cycle_number.sql)
 *
 * CI는 이 마이그레이션을 빈 테이블에 적용하므로, 기존 기록에 사이클 번호를 되살리는
 * 로직과 실패 검사는 거기서 검증되지 않는다. 이 테스트는 세 테이블(trading_accounts,
 * tier_holdings, profit_records)을 임시 테이블로 복제하고 profit_records 복제본에서
 * cycle_number를 지워 마이그레이션 전 상태를 만든 뒤 마이그레이션을 돌려 본다
 * (방식은 src/test-utils/migration-clone.ts 참고).
 */
import { describe, it, expect } from "vitest";
import { hasDb } from "@/test-utils/db";
import { cloneTable, setUpMigrationClone } from "@/test-utils/migration-clone";

/** 픽스처의 계좌·수익 기록·보유 티어 */
interface Fixture {
  accounts: Array<{ id: string; cycleNumber: number }>;
  records?: Array<{ account: string; id: string; tier: number; buy: string; sell: string }>;
  holdings?: Array<{ account: string; tier: number; buy: string | null; shares?: number }>;
}

interface MigratedRecord {
  id: string;
  cycle_number: number;
}

describe.skipIf(!hasDb)("profit_records.cycle_number 마이그레이션", () => {
  const clone = setUpMigrationClone("20261109000000_add_profit_records_cycle_number.sql");

  /**
   * 마이그레이션 전 상태의 임시 복제본에 픽스처를 넣고 마이그레이션을 적용한다.
   * 성공하면 사이클 번호를, 실패하면 마이그레이션이 던진 에러를 돌려준다.
   */
  function migrate(fixture: Fixture) {
    return clone.run({
      setup: async (tx) => {
        for (const table of ["trading_accounts", "tier_holdings", "profit_records"]) {
          await cloneTable(tx, table, ["DEFAULTS", "CONSTRAINTS"]);
        }
        await tx.unsafe("ALTER TABLE pg_temp.profit_records DROP COLUMN cycle_number");

        for (const a of fixture.accounts) {
          await tx`
            INSERT INTO pg_temp.trading_accounts
              (id, user_id, name, ticker, strategy, cycle_start_date, cycle_number)
            VALUES (${a.id}, 'migration-test', ${a.id}, 'SOXL', 'Pro1', '2025-01-02', ${a.cycleNumber})`;
        }
        for (const r of fixture.records ?? []) {
          await tx`
            INSERT INTO pg_temp.profit_records
              (id, account_id, tier, ticker, strategy, buy_date, buy_price, buy_quantity,
               sell_date, sell_price, buy_amount, sell_amount, profit, profit_rate)
            VALUES (${r.id}, ${r.account}, ${r.tier}, 'SOXL', 'Pro1', ${r.buy}, 10, 10,
                    ${r.sell}, 10, 100, 100, 0, 0)`;
        }
        for (const h of fixture.holdings ?? []) {
          const shares = h.shares ?? 10;
          await tx`
            INSERT INTO pg_temp.tier_holdings (id, account_id, tier, buy_price, shares, buy_date)
            VALUES (${`${h.account}-h${h.tier}`}, ${h.account}, ${h.tier},
                    ${shares > 0 ? 10 : null}, ${shares}, ${h.buy})`;
        }
      },
      inspect: async (tx) => {
        const rows = await tx<MigratedRecord[]>`
          SELECT id, cycle_number FROM pg_temp.profit_records ORDER BY id`;
        const [column] = await tx<{ is_nullable: string }[]>`
          SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = pg_my_temp_schema()::regnamespace::text
            AND table_name = 'profit_records' AND column_name = 'cycle_number'`;
        const indexes = await tx<{ indexname: string }[]>`
          SELECT indexname FROM pg_indexes
          WHERE schemaname = pg_my_temp_schema()::regnamespace::text
            AND tablename = 'profit_records'`;
        return {
          cycles: Object.fromEntries(rows.map((r) => [r.id, r.cycle_number])),
          nullable: column.is_nullable,
          indexes: indexes.map((i) => i.indexname),
        };
      },
    });
  }

  it("계좌별로 매수일 순으로 묶어 사이클 번호를 1부터 매기고 NOT NULL로 바꾼다", async () => {
    const result = await migrate({
      accounts: [
        { id: "A", cycleNumber: 3 },
        { id: "B", cycleNumber: 2 },
        { id: "C", cycleNumber: 1 },
        { id: "D", cycleNumber: 1 },
        { id: "E", cycleNumber: 2 },
      ],
      records: [
        // A 사이클 1
        { account: "A", id: "A1", tier: 1, buy: "2025-01-02", sell: "2025-01-05" },
        { account: "A", id: "A2", tier: 2, buy: "2025-01-03", sell: "2025-01-05" },
        // A 사이클 2: A4의 매수일이 A3의 매도일과 같은 날이라 사이클이 이어진다
        { account: "A", id: "A3", tier: 1, buy: "2025-01-08", sell: "2025-01-12" },
        { account: "A", id: "A4", tier: 2, buy: "2025-01-12", sell: "2025-01-15" },
        // A 사이클 3 (진행 중): A5와 A6 사이를 잇는 것은 보유 중인 티어 1뿐이다
        { account: "A", id: "A5", tier: 2, buy: "2025-01-17", sell: "2025-01-19" },
        { account: "A", id: "A6", tier: 3, buy: "2025-01-22", sell: "2025-01-23" },
        // B: 사이클 1 완료 뒤 보유 없음 (계좌 사이클 2)
        { account: "B", id: "B1", tier: 1, buy: "2025-01-02", sell: "2025-01-06" },
        { account: "B", id: "B2", tier: 2, buy: "2025-01-03", sell: "2025-01-06" },
        // E: 사이클 1 완료 뒤 사이클 2 보유 중, 사이클 2 매도 기록 없음
        { account: "E", id: "E1", tier: 1, buy: "2025-01-02", sell: "2025-01-06" },
      ],
      holdings: [
        { account: "A", tier: 1, buy: "2025-01-16" },
        // C: 사이클 1 보유 중, 매도 기록 없음 / D: 기록도 보유도 없는 새 계좌
        { account: "C", tier: 1, buy: "2025-01-02" },
        { account: "E", tier: 1, buy: "2025-01-07" },
        // 수량 0인 빈 티어 행은 보유로 치지 않는다
        { account: "D", tier: 1, buy: null, shares: 0 },
      ],
    });

    expect(result).toEqual({
      ok: true,
      cycles: { A1: 1, A2: 1, A3: 2, A4: 2, A5: 3, A6: 3, B1: 1, B2: 1, E1: 1 },
      nullable: "NO",
      indexes: expect.arrayContaining(["idx_profit_records_account_cycle"]),
    });
  });

  it("보유 중인데 묶음 수가 계좌 사이클 번호보다 작으면 실패한다", async () => {
    const result = await migrate({
      accounts: [{ id: "F", cycleNumber: 2 }],
      records: [{ account: "F", id: "F1", tier: 1, buy: "2025-01-02", sell: "2025-01-06" }],
      // 보유 티어의 매수일이 F1의 매도일 전이라 F1과 같은 사이클로 묶인다
      holdings: [{ account: "F", tier: 2, buy: "2025-01-03" }],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("account F has 1 cycle groups but cycle_number 2 (holding)"),
    });
  });

  it("보유가 없는데 묶음 수가 계좌 사이클 번호와 같으면 실패한다", async () => {
    const result = await migrate({
      accounts: [{ id: "G", cycleNumber: 1 }],
      records: [{ account: "G", id: "G1", tier: 1, buy: "2025-01-02", sell: "2025-01-06" }],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining(
        "account G has 1 cycle groups but cycle_number 1 (no holding)"
      ),
    });
  });

  it("기록도 보유도 없는데 계좌 사이클 번호가 2이면 실패한다", async () => {
    const result = await migrate({ accounts: [{ id: "K", cycleNumber: 2 }] });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining(
        "account K has 0 cycle groups but cycle_number 2 (no holding)"
      ),
    });
  });

  it("같은 계좌·티어·매수일·매도일의 기록이 둘이면 실패한다", async () => {
    const result = await migrate({
      accounts: [{ id: "H", cycleNumber: 2 }],
      records: [
        { account: "H", id: "H1", tier: 1, buy: "2025-01-02", sell: "2025-01-06" },
        { account: "H", id: "H2", tier: 1, buy: "2025-01-02", sell: "2025-01-06" },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining(
        "account H has duplicate profit records (tier 1, buy 2025-01-02, sell 2025-01-06)"
      ),
    });
  });

  it("보유 중인 티어에 매수일이 없으면 실패한다", async () => {
    const result = await migrate({
      accounts: [{ id: "J", cycleNumber: 1 }],
      holdings: [{ account: "J", tier: 1, buy: null }],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("account J tier 1 has shares but no buy_date"),
    });
  });
});
