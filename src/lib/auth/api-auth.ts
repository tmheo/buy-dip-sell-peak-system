/**
 * API 라우트 인증 유틸리티
 */

import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * 인증이 필요한 API에서 세션 검증
 * @returns 세션 객체 또는 401 Response
 */
export async function requireAuth(): Promise<Session | Response> {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session;
}

/**
 * 세션이 Response인지 확인하는 타입 가드
 */
export function isUnauthorized(result: Session | Response): result is Response {
  return result instanceof Response;
}

/**
 * API 라우트에서 인증 검증 후 핸들러 실행
 * @example
 * export async function GET() {
 *   return withAuth(async (session) => {
 *     // 인증된 사용자만 실행되는 로직
 *     return Response.json({ userId: session.user.id });
 *   });
 * }
 */
export async function withAuth<T>(
  handler: (session: Session) => Promise<T>
): Promise<T | Response> {
  const result = await requireAuth();

  if (isUnauthorized(result)) {
    return result;
  }

  return handler(result);
}
