/**
 * Auth.js v5 설정
 * Google OAuth 인증 구현 (Drizzle ORM + PostgreSQL)
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/database/db-drizzle";
import * as schema from "@/database/schema/index";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
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
