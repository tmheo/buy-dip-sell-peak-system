/**
 * 마이그레이션 SQL을 임시 복제본 테이블에 돌려 보는 테스트 도구
 *
 * CI는 마이그레이션을 빈 테이블에 적용하므로, 기존 행을 고치는 로직과 실패 검사는 거기서
 * 검증되지 않는다. 마이그레이션 테스트는 이 도구로 마이그레이션 SQL 본문을 테스트용 데이터에
 * 그대로 돌려 본다.
 *
 * 실제 테이블은 건드리지 않는다. 한 트랜잭션 안에서 테이블 구조를 임시 테이블로 복제하고
 * 마이그레이션 전 상태로 되돌린 뒤, 마이그레이션의 `public.`을 `pg_temp.`로 바꿔 그 복제본에
 * 적용한다. 트랜잭션은 매번 되돌린다. 그래서 로컬 DB에 마이그레이션이 이미 적용돼 있어도,
 * 다른 테스트가 같은 테이블을 동시에 쓰고 있어도 결과가 같다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll } from "vitest";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

/** 마이그레이션이 성공하면 들여다본 결과를, 실패하면 마이그레이션이 던진 에러를 담는다 */
export type MigrationOutcome<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface MigrationRun<T> {
  /** 마이그레이션 전 상태의 복제본을 만들고 테스트용 데이터를 넣는다 */
  setup: (tx: postgres.Sql) => Promise<void>;
  /**
   * 마이그레이션을 적용한다. 없으면 한 번 적용한다.
   * migrate가 던지면 마이그레이션 실패로 기록된다.
   */
  apply?: (tx: postgres.Sql, migrate: () => Promise<void>) => Promise<void>;
  /** 마이그레이션이 성공한 뒤의 복제본을 들여다본다 */
  inspect: (tx: postgres.Sql) => Promise<T>;
}

export type LikeOption = "DEFAULTS" | "CONSTRAINTS" | "INDEXES";

/** 트랜잭션을 되돌리려고 일부러 던지는 오류 */
class Rollback extends Error {}

/** 마이그레이션 SQL이 던진 오류 - 테스트 도구 자체의 오류와 가른다 */
class MigrationFailed extends Error {}

/**
 * describe 안에서 부른다. DB에 연결하고 끊는 일을 그 describe의 beforeAll/afterAll에 건다.
 * fileName은 supabase/migrations 안의 마이그레이션 파일 이름이다.
 */
export function setUpMigrationClone(fileName: string) {
  let sql: postgres.Sql;
  let migrationSql: string;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
    migrationSql = readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8").replaceAll(
      "public.",
      "pg_temp."
    );
  });

  afterAll(async () => {
    await sql.end();
  });

  /** 한 트랜잭션 안에서 setup, apply, inspect를 차례로 돌리고 트랜잭션을 되돌린다 */
  async function run<T>({
    setup,
    apply = (_tx, migrate) => migrate(),
    inspect,
  }: MigrationRun<T>): Promise<MigrationOutcome<T>> {
    let outcome: MigrationOutcome<T> | undefined;
    try {
      await sql.begin(async (transaction) => {
        // postgres-js의 TransactionSql 타입은 Omit 때문에 함수로 부를 수 없게 적혀 있다 -
        // 실제 객체는 Sql처럼 부를 수 있다
        const tx = transaction as unknown as postgres.Sql;
        await setup(tx);

        const migrate = async () => {
          try {
            await tx.unsafe(migrationSql);
          } catch (error) {
            throw new MigrationFailed(error instanceof Error ? error.message : String(error));
          }
        };
        try {
          await apply(tx, migrate);
        } catch (error) {
          if (!(error instanceof MigrationFailed)) throw error;
          outcome = { ok: false, error: error.message };
          throw new Rollback();
        }

        outcome = { ok: true, ...(await inspect(tx)) };
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    if (!outcome) throw new Error("migration outcome missing");
    return outcome;
  }

  return { run };
}

/** public의 테이블 구조를 같은 이름의 임시 테이블로 복제한다 (행은 복제하지 않는다) */
export async function cloneTable(
  tx: postgres.Sql,
  table: string,
  including: LikeOption[]
): Promise<void> {
  const like = including.map((option) => ` INCLUDING ${option}`).join("");
  await tx.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table}${like})`);
}

/**
 * seed_capital 칸이 있던 때의 trading_accounts 복제본을 만든다.
 * 실제 테이블의 칸은 20261111000000_drop_trading_accounts_seed_capital.sql(#120)이 지웠으므로
 * 복제본에 빈 칸을 허용하는 칸으로 되살린다.
 */
export async function cloneTradingAccountsWithSeedCapital(tx: postgres.Sql): Promise<void> {
  await cloneTable(tx, "trading_accounts", ["DEFAULTS", "INDEXES"]);
  await tx.unsafe(
    "ALTER TABLE pg_temp.trading_accounts ADD COLUMN IF NOT EXISTS seed_capital numeric(14, 2)"
  );
  await tx.unsafe("ALTER TABLE pg_temp.trading_accounts ALTER COLUMN seed_capital DROP NOT NULL");
}
