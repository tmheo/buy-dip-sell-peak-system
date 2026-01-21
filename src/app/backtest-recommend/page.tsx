/**
 * 백테스트 (추천 전략) 페이지 (서버 컴포넌트)
 * 인증 체크 후 클라이언트 컴포넌트 렌더링
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import BacktestRecommendPageClient from "./_client";

export default async function BacktestRecommendPage() {
  const session = await auth();

  // 인증되지 않은 사용자는 info 페이지로 리다이렉트
  if (!session?.user) {
    redirect("/info");
  }

  return <BacktestRecommendPageClient />;
}
