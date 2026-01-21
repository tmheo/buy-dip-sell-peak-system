/**
 * Auth.js v5 설정
 * Google OAuth 인증 구현
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SQLiteAdapter } from "@/lib/auth/adapter";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SQLiteAdapter(),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30일
  },
  callbacks: {
    session({ session, user }) {
      // 세션에 user.id 추가
      session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: "/", // 로그인 페이지 (기본 홈으로 리다이렉트)
    error: "/", // 오류 시 홈으로 리다이렉트
  },
});
