/**
 * 회원 탈퇴 API
 * DELETE /api/user/delete
 * Drizzle ORM for PostgreSQL
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/index";

export async function DELETE(): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.delete(users).where(eq(users.id, session.user.id));
  return NextResponse.json({ success: true });
}
