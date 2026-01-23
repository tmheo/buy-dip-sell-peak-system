/**
 * 트레이딩 계좌 상세 페이지 (서버 컴포넌트)
 * 인증 체크 후 클라이언트 컴포넌트에 위임
 */
import type React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import TradingDetailClient from "./_client";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

export default async function TradingDetailPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { accountId } = await params;

  return <TradingDetailClient accountId={accountId} />;
}
