/**
 * Auth.js 인증 타입 정의
 */

import type { DefaultSession } from "next-auth";

// =====================================================
// 데이터베이스 엔티티 타입
// =====================================================

/**
 * 사용자 타입
 */
export interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  image: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * OAuth 계정 타입
 */
export interface AuthAccount {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

/**
 * 세션 타입
 */
export interface AuthSession {
  sessionToken: string;
  userId: string;
  expires: Date;
}

// =====================================================
// NextAuth 모듈 확장
// =====================================================

declare module "next-auth" {
  /**
   * 세션 타입 확장 - user.id 포함
   */
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
