/**
 * Drizzle ORM 데이터베이스 클라이언트 (PostgreSQL)
 * Supabase Local (개발) 및 Supabase Cloud (프로덕션) 연결
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

/**
 * PostgreSQL 연결 클라이언트
 * - max: 동시 연결 최대 수 (서버리스 인스턴스당 1개면 충분)
 * - idle_timeout: 유휴 연결 타임아웃 (초)
 * - connect_timeout: 연결 타임아웃 (초)
 * - prepare: Supabase Transaction Pooler(PgBouncer transaction mode)는
 *   prepared statement를 지원하지 않으므로 비활성화 필수
 */
const client = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

/**
 * Drizzle ORM 인스턴스
 * 스키마 정보를 포함하여 관계형 쿼리 지원
 */
export const db = drizzle(client, { schema });

/**
 * 데이터베이스 타입 (타입 추론용)
 */
export type Database = typeof db;

/**
 * 데이터베이스 연결 종료
 * 애플리케이션 종료 시 호출
 */
export async function closeConnection(): Promise<void> {
  await client.end();
}
