/**
 * Auth.js 어댑터용 SQL 쿼리 함수
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import type { AuthUser, AuthAccount, AuthSession } from "@/types/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../../data/prices.db");

let db: Database.Database | null = null;
let tablesInitialized = false;

// Auth 테이블 생성 SQL
const CREATE_USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    email_verified INTEGER,
    image TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

const CREATE_ACCOUNTS_TABLE = `
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_account_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;

const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
    session_token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;

/**
 * Auth 테이블 초기화
 */
function initAuthTables(database: Database.Database): void {
  if (tablesInitialized) return;

  database.exec(CREATE_USERS_TABLE);
  database.exec(CREATE_ACCOUNTS_TABLE);
  database.exec(CREATE_SESSIONS_TABLE);
  database.exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");

  tablesInitialized = true;
}

/**
 * 데이터베이스 연결 (싱글톤) + Auth 테이블 자동 초기화
 */
function getConnection(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initAuthTables(db);
  }
  return db;
}

// =====================================================
// User 쿼리
// =====================================================

export function createUser(user: Omit<AuthUser, "createdAt" | "updatedAt">): AuthUser {
  const database = getConnection();
  const stmt = database.prepare(`
    INSERT INTO users (id, name, email, email_verified, image)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(user.id, user.name, user.email, user.emailVerified?.getTime() ?? null, user.image);

  return getUserById(user.id)!;
}

export function getUserById(id: string): AuthUser | null {
  const database = getConnection();
  const stmt = database.prepare(`
    SELECT id, name, email, email_verified, image, created_at, updated_at
    FROM users WHERE id = ?
  `);
  const row = stmt.get(id) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

export function getUserByEmail(email: string): AuthUser | null {
  const database = getConnection();
  const stmt = database.prepare(`
    SELECT id, name, email, email_verified, image, created_at, updated_at
    FROM users WHERE email = ?
  `);
  const row = stmt.get(email) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

export function getUserByAccount(provider: string, providerAccountId: string): AuthUser | null {
  const database = getConnection();
  const stmt = database.prepare(`
    SELECT u.id, u.name, u.email, u.email_verified, u.image, u.created_at, u.updated_at
    FROM users u
    INNER JOIN accounts a ON u.id = a.user_id
    WHERE a.provider = ? AND a.provider_account_id = ?
  `);
  const row = stmt.get(provider, providerAccountId) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

export function updateUser(
  id: string,
  data: Partial<Omit<AuthUser, "id" | "createdAt">>
): AuthUser | null {
  const database = getConnection();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    values.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push("email = ?");
    values.push(data.email);
  }
  if (data.emailVerified !== undefined) {
    updates.push("email_verified = ?");
    values.push(data.emailVerified?.getTime() ?? null);
  }
  if (data.image !== undefined) {
    updates.push("image = ?");
    values.push(data.image);
  }

  if (updates.length === 0) {
    return getUserById(id);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const stmt = database.prepare(`
    UPDATE users SET ${updates.join(", ")} WHERE id = ?
  `);
  stmt.run(...values);

  return getUserById(id);
}

export function deleteUser(id: string): void {
  const database = getConnection();
  const stmt = database.prepare("DELETE FROM users WHERE id = ?");
  stmt.run(id);
}

// =====================================================
// Account 쿼리
// =====================================================

export function linkAccount(account: AuthAccount): void {
  const database = getConnection();
  const stmt = database.prepare(`
    INSERT INTO accounts (
      id, user_id, type, provider, provider_account_id,
      refresh_token, access_token, expires_at, token_type, scope, id_token, session_state
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    account.id,
    account.userId,
    account.type,
    account.provider,
    account.providerAccountId,
    account.refresh_token ?? null,
    account.access_token ?? null,
    account.expires_at ?? null,
    account.token_type ?? null,
    account.scope ?? null,
    account.id_token ?? null,
    account.session_state ?? null
  );
}

export function unlinkAccount(provider: string, providerAccountId: string): void {
  const database = getConnection();
  const stmt = database.prepare(
    "DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?"
  );
  stmt.run(provider, providerAccountId);
}

// =====================================================
// Session 쿼리
// =====================================================

export function createSession(session: AuthSession): AuthSession {
  const database = getConnection();
  const stmt = database.prepare(`
    INSERT INTO sessions (session_token, user_id, expires)
    VALUES (?, ?, ?)
  `);
  stmt.run(session.sessionToken, session.userId, session.expires.toISOString());

  return session;
}

export function getSessionAndUser(
  sessionToken: string
): { session: AuthSession; user: AuthUser } | null {
  const database = getConnection();
  const stmt = database.prepare(`
    SELECT
      s.session_token, s.user_id, s.expires,
      u.id, u.name, u.email, u.email_verified, u.image, u.created_at, u.updated_at
    FROM sessions s
    INNER JOIN users u ON s.user_id = u.id
    WHERE s.session_token = ?
  `);
  const row = stmt.get(sessionToken) as SessionUserRow | undefined;

  if (!row) return null;

  return {
    session: {
      sessionToken: row.session_token,
      userId: row.user_id,
      expires: new Date(row.expires),
    },
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerified: row.email_verified ? new Date(row.email_verified) : null,
      image: row.image,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    },
  };
}

export function updateSession(
  sessionToken: string,
  data: Partial<AuthSession>
): AuthSession | null {
  const database = getConnection();

  if (data.expires) {
    const stmt = database.prepare("UPDATE sessions SET expires = ? WHERE session_token = ?");
    stmt.run(data.expires.toISOString(), sessionToken);
  }

  const getStmt = database.prepare(
    "SELECT session_token, user_id, expires FROM sessions WHERE session_token = ?"
  );
  const row = getStmt.get(sessionToken) as SessionRow | undefined;

  if (!row) return null;

  return {
    sessionToken: row.session_token,
    userId: row.user_id,
    expires: new Date(row.expires),
  };
}

export function deleteSession(sessionToken: string): void {
  const database = getConnection();
  const stmt = database.prepare("DELETE FROM sessions WHERE session_token = ?");
  stmt.run(sessionToken);
}

// =====================================================
// Helper 타입 및 함수
// =====================================================

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  email_verified: number | null;
  image: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface SessionRow {
  session_token: string;
  user_id: string;
  expires: string;
}

interface SessionUserRow extends SessionRow {
  id: string;
  name: string | null;
  email: string;
  email_verified: number | null;
  image: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function mapUserRow(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified ? new Date(row.email_verified) : null,
    image: row.image,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  };
}
