/**
 * 회원 탈퇴 API
 * DELETE /api/user/delete
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUser } from "@/lib/auth/queries";

export async function DELETE() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    deleteUser(session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete user:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
