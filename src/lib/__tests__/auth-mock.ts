/**
 * 세션 인증 대역 헬퍼
 *
 * NextAuth의 `auth()`는 미들웨어 오버로드를 함께 갖고 있어 `vi.mocked()`가
 * 세션 반환형을 고르지 못한다. 세션 조회 형태로 좁혀 테스트가
 * `mockResolvedValue`로 로그인 여부를 지정할 수 있게 한다.
 *
 * 쓰는 테스트 파일이 먼저 `vi.mock("@/auth", () => ({ auth: vi.fn() }))`를 선언해야 한다.
 */
import { vi } from "vitest";
import type { Session } from "next-auth";

import { auth } from "@/auth";

/** 세션 조회 형태로 좁힌 `auth()` 대역 */
export const mockedAuth = vi.mocked(auth as unknown as () => Promise<Session | null>);

/** 지정한 사용자로 로그인한 상태를 만든다 */
export function mockLoggedIn(userId: string): void {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as Session);
}

/** 로그인하지 않은 상태를 만든다 */
export function mockLoggedOut(): void {
  mockedAuth.mockResolvedValue(null);
}
