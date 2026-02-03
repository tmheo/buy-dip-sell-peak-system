/**
 * API 라우트 공통 유틸리티
 * - 인증 헬퍼
 * - 공통 타입
 * - 에러 응답 헬퍼
 */

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
