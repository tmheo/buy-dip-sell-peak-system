/**
 * 마이페이지 (서버 컴포넌트)
 * 인증 체크 후 사용자 정보를 클라이언트 컴포넌트에 전달
 */
import type React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/auth/queries";
import MyPageClient from "./_client";

export default async function MyPage(): Promise<React.ReactElement> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = getUserById(session.user.id);

  if (!user) {
    redirect("/");
  }

  return (
    <MyPageClient
      name={user.name}
      email={user.email}
      image={user.image}
      createdAt={(user.createdAt ?? new Date()).toISOString()}
    />
  );
}
