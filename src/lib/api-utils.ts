/**
 * API 라우트 공통 유틸리티
 * - 인증 헬퍼 (세션 인증, 크론 인증)
 * - 공통 타입
 * - 에러 응답 헬퍼
 */

import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * API 라우트 공통 타입: 동적 라우트 파라미터
 */
export interface RouteParams<T = { id: string }> {
  params: Promise<T>;
}

/**
 * 인증된 사용자 ID를 반환하거나 null 반환
 * API 라우트에서 인증 체크에 사용
 *
 * @example
 * const userId = await getAuthUserId();
 * if (!userId) {
 *   return unauthorizedResponse();
 * }
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * 크론 요청의 Bearer 토큰을 검증한다.
 * 타이밍 공격을 막기 위해 timingSafeEqual로 비교하며,
 * 길이가 다르면 timingSafeEqual이 던지므로 먼저 길이를 확인한다.
 *
 * @returns 통과하면 null, 실패하면 그대로 반환할 에러 응답
 *
 * @example
 * const authError = requireCronAuth(request);
 * if (authError) return authError;
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET 환경 변수 미설정");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${cronSecret}`;

  if (
    !authHeader ||
    authHeader.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedToken))
  ) {
    console.warn("Cron 인증 실패: 잘못된 토큰");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * 인증 실패 시 401 응답 반환
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * 리소스 없음 404 응답 반환
 */
export function notFoundResponse(resource = "Resource"): NextResponse {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

/**
 * 유효성 검증 실패 400 응답 반환
 */
export function validationErrorResponse(details: unknown): NextResponse {
  return NextResponse.json({ error: "Validation failed", details }, { status: 400 });
}

/**
 * 서버 에러 500 응답 반환
 */
export function serverErrorResponse(): NextResponse {
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
