/**
 * Auth.js 호환 스키마 (Drizzle ORM for PostgreSQL)
 * - users: 사용자 정보
 * - accounts: OAuth 계정 연동
 * - sessions: 세션 관리
 * - verification_tokens: 이메일 인증 토큰
 */

import {
  pgTable,
  text,
  integer,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * users 테이블
 * Auth.js 사용자 정보
 */
export const users = pgTable(
  "users",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text(),
    email: text().unique(),
    emailVerified: timestamp("email_verified", { mode: "date" }),
    image: text(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_users_email").on(table.email)]
);

/**
 * accounts 테이블
 * OAuth 계정 연동 정보 (Google, GitHub 등)
 * @auth/drizzle-adapter 호환 snake_case 프로퍼티 사용
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    provider: text().notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text(),
    id_token: text("id_token"),
    session_state: text("session_state"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_accounts_provider_account").on(table.provider, table.providerAccountId),
    index("idx_accounts_user_id").on(table.userId),
  ]
);

/**
 * sessions 테이블
 * 사용자 세션 관리
 */
export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp({ mode: "date" }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_sessions_user_id").on(table.userId)]
);

/**
 * verification_tokens 테이블
 * 이메일 인증 토큰 (복합 PK)
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
);

// 타입 추론
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
