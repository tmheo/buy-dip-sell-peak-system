/**
 * 회원 탈퇴 API
 * DELETE /api/user/delete
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUser } from "@/lib/auth/queries";

export async function DELETE(): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  deleteUser(session.user.id);
  return NextResponse.json({ success: true });
}
