/**
 * 회원 탈퇴 API
 * DELETE /api/user/delete
 * Drizzle ORM for PostgreSQL
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthUserId, unauthorizedResponse } from "@/lib/api-utils";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/index";

export async function DELETE(): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  await db.delete(users).where(eq(users.id, userId));
  return NextResponse.json({ success: true });
}
