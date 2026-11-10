/**
 * GET /api/trading/accounts 테스트 (ADR-0005, #116)
 *
 * 목록의 시드 열은 오늘의 시드(seed.current)다. 계좌에는 시드 금액이 없다 - 날짜마다 다를 수
 * 있어 시드 이력에서 읽는다.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { hasDb } from "@/test-utils/db";
import { mockLoggedIn } from "@/lib/__tests__/auth-mock";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";

const OWNER_ID = randomUUID();

describe.skipIf(!hasDb)("GET /api/trading/accounts", () => {
  let route: typeof import("../route");
  let trading: typeof import("@/database/trading");

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: OWNER_ID, email: `test-${OWNER_ID}@test.com` })
      .onConflictDoNothing();
    trading = await import("@/database/trading");
    route = await import("../route");
  });

  afterAll(async () => {
    // 계좌·티어 보유·시드 이력 CASCADE 삭제
    await db.delete(users).where(eq(users.id, OWNER_ID));
  });

  it("계좌마다 오늘의 시드와 적용 전 변경을 붙여 돌려줘야 한다", async () => {
    // 오늘은 서버의 UTC 날짜다 - 화요일로 정해 적용일이 수요일이 되게 한다
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    try {
      const account = await trading.createTradingAccount(OWNER_ID, {
        name: "목록 시드 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10_000,
        strategy: "Pro1",
        cycleStartDate: "2026-11-02",
      });
      await trading.changeSeedCapital(account.id, OWNER_ID, 3_000, "2026-11-10");
      mockLoggedIn(OWNER_ID);

      const response = await route.GET();

      expect(response.status).toBe(200);
      const { accounts } = await response.json();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).not.toHaveProperty("seedCapital");
      expect(accounts[0].seed).toEqual({
        current: 10_000,
        pending: { seedCapital: 3_000, effectiveDate: "2026-11-11" },
        appliedToday: null,
        changeEffectiveDate: "2026-11-11",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
