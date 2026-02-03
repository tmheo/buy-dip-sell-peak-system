/**
 * 사용자 CRUD 함수 (Drizzle ORM)
 */

import { eq } from "drizzle-orm";
import { db } from "./db-drizzle";
import { users, type User } from "./schema/auth";

/**
 * ID로 사용자 조회
 */
export async function getUserById(id: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}
