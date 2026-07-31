/**
 * Drizzle ORM 데이터베이스 클라이언트 (PostgreSQL)
 * Supabase Local (개발) 및 Supabase Cloud (프로덕션) 연결
 *
 * 연결은 첫 사용 시점에 지연 초기화한다 (#66).
 * DATABASE_URL이 없을 때 import만으로 죽지 않아야 DB 없는 환경(CI, 로컬 단위
 * 테스트)에서도 이 모듈을 거쳐 가는 코드를 로드할 수 있다.
 * 대신 첫 프로퍼티 접근(사실상 첫 쿼리) 시점에 기존과 같은 에러를 던지므로,
 * 애플리케이션 런타임(웹, CLI, 크론)에서는 여전히 명확한 에러로 드러난다.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * PostgreSQL 연결 클라이언트 생성
 * - max: 동시 연결 최대 수 (서버리스 인스턴스당 1개면 충분)
 * - idle_timeout: 유휴 연결 타임아웃 (초)
 * - connect_timeout: 연결 타임아웃 (초)
 * - prepare: Supabase Transaction Pooler(PgBouncer transaction mode)는
 *   prepared statement를 지원하지 않으므로 비활성화 필수
 */
function createClient(): postgres.Sql {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  return postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
}

function createDb(client: postgres.Sql) {
  return drizzle(client, { schema });
}

/**
 * 데이터베이스 타입 (타입 추론용)
 */
export type Database = ReturnType<typeof createDb>;

let realClient: postgres.Sql | null = null;
let realDb: Database | null = null;

function getDb(): Database {
  if (!realDb) {
    realClient = createClient();
    realDb = createDb(realClient);
  }
  return realDb;
}

/**
 * Drizzle ORM 인스턴스 (지연 초기화 프록시)
 * 스키마 정보를 포함하여 관계형 쿼리 지원
 *
 * Auth.js DrizzleAdapter처럼 인스턴스 자체를 검사하는 소비자가 있으므로
 * 실제 인스턴스처럼 보이게 만든다:
 * - constructor는 bind하지 않고 원본을 돌려준다 (drizzle의 is()가
 *   constructor 체인의 정적 속성 entityKind로 방언을 판별한다)
 * - getPrototypeOf 트랩으로 instanceof 검사도 실제 인스턴스와 같게 한다
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance) as unknown;
    if (typeof value === "function" && prop !== "constructor") {
      return value.bind(instance);
    }
    return value;
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(getDb()) as object | null;
  },
});

/**
 * 쿼리 실행자 타입 (db 또는 트랜잭션 컨텍스트)
 * CRUD 함수가 트랜잭션 안팎 어디서든 재사용될 수 있게 한다.
 */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * 데이터베이스 연결 종료
 * 애플리케이션 종료 시 호출
 */
export async function closeConnection(): Promise<void> {
  if (realClient) {
    await realClient.end();
    realClient = null;
    realDb = null;
  }
}
