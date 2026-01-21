/**
 * Auth.js v5 커스텀 SQLite 어댑터
 */

import { randomUUID } from "node:crypto";
import type { Adapter, AdapterUser, AdapterAccount, AdapterSession } from "next-auth/adapters";
import {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByAccount,
  updateUser,
  deleteUser,
  linkAccount,
  unlinkAccount,
  createSession,
  getSessionAndUser,
  updateSession,
  deleteSession,
} from "./queries";

/**
 * UUID 생성 함수 (crypto 모듈 사용)
 */
function generateId(): string {
  return randomUUID();
}

/**
 * SQLite 어댑터 생성
 */
export function SQLiteAdapter(): Adapter {
  return {
    async createUser(data) {
      const user = createUser({
        id: generateId(),
        name: data.name ?? null,
        email: data.email,
        emailVerified: data.emailVerified ?? null,
        image: data.image ?? null,
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      } as AdapterUser;
    },

    async getUser(id) {
      const user = getUserById(id);
      if (!user) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      } as AdapterUser;
    },

    async getUserByEmail(email) {
      const user = getUserByEmail(email);
      if (!user) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      } as AdapterUser;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const user = getUserByAccount(provider, providerAccountId);
      if (!user) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      } as AdapterUser;
    },

    async updateUser(data) {
      const user = updateUser(data.id!, {
        name: data.name,
        email: data.email,
        emailVerified: data.emailVerified,
        image: data.image,
      });

      if (!user) {
        throw new Error(`User not found: ${data.id}`);
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      } as AdapterUser;
    },

    async deleteUser(id) {
      deleteUser(id);
    },

    async linkAccount(account) {
      linkAccount({
        id: generateId(),
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token,
        access_token: account.access_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state as string | undefined,
      });

      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      unlinkAccount(provider, providerAccountId);
    },

    async createSession(data) {
      const session = createSession({
        sessionToken: data.sessionToken,
        userId: data.userId,
        expires: data.expires,
      });

      return {
        sessionToken: session.sessionToken,
        userId: session.userId,
        expires: session.expires,
      } as AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      const result = getSessionAndUser(sessionToken);
      if (!result) return null;

      return {
        session: {
          sessionToken: result.session.sessionToken,
          userId: result.session.userId,
          expires: result.session.expires,
        } as AdapterSession,
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          emailVerified: result.user.emailVerified,
          image: result.user.image,
        } as AdapterUser,
      };
    },

    async updateSession(data) {
      const session = updateSession(data.sessionToken, {
        expires: data.expires,
      });

      if (!session) return null;

      return {
        sessionToken: session.sessionToken,
        userId: session.userId,
        expires: session.expires,
      } as AdapterSession;
    },

    async deleteSession(sessionToken) {
      deleteSession(sessionToken);
    },
  };
}
