/**
 * 실계좌 사이클 상태가 이번 사이클의 실현손익을 담는지 검증한다 (#97, ADR-0003)
 *
 * 예수금은 사이클 안 순실현손실만큼 줄어든다. 주문 생성, 신선도 판정, 체결 처리가
 * 모두 loadCycleState로 입력을 만들므로, 그 상태가 계좌의 지금 사이클 번호로 묶인
 * 수익 기록만 더해야 한다. 앞선 사이클의 손익이 섞이면 새 사이클의 예수금이 줄어든다.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { hasDb } from "@/test-utils/db";
import { settledSale } from "@/test-utils/settled-sale";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { cashBreakdown } from "@/strategy";
import type { TradingAccount } from "@/types/trading";

const TEST_USER_ID = randomUUID();
const SEED_CAPITAL = 10_000;

describe.skipIf(!hasDb)("loadCycleState의 이번 사이클 실현손익", () => {
  let tradingModule: typeof import("@/database/trading");
  let orders: typeof import("../orders");
  let account: TradingAccount;

  /** 매수 $100 × 10주를 sellPrice에 판 기록. 손익은 settle이 낸다: (sellPrice - 100) × 10 */
  async function recordSale(cycleNumber: number, tier: number, sellPrice: number): Promise<void> {
    await tradingModule.createProfitRecord({
      accountId: account.id,
      ticker: "SOXL",
      strategy: "Pro2",
      cycleNumber,
      sellDate: "2009-03-04",
      ...settledSale({
        tier,
        buyDate: "2009-03-02",
        buyPrice: 100,
        shares: 10,
        sellDate: "2009-03-04",
        sellPrice,
      }),
    });
  }

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` })
      .onConflictDoNothing();

    tradingModule = await import("@/database/trading");
    orders = await import("../orders");

    account = await tradingModule.createTradingAccount(TEST_USER_ID, {
      name: "실현손익 테스트 계좌",
      ticker: "SOXL",
      seedCapital: SEED_CAPITAL,
      strategy: "Pro2",
      cycleStartDate: "2009-03-02",
    });

    // 사이클 1: 순손실 -$300 (지난 사이클이라 지금 예수금에 영향이 없어야 한다)
    await recordSale(1, 1, 70);
    // 사이클 2: 손절 -$500, 익절 +$200 → 순손실 -$300
    await recordSale(2, 1, 50);
    await recordSale(2, 2, 120);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·수익 기록 CASCADE 삭제
  });

  it("계좌의 지금 사이클 번호로 묶인 수익 기록의 손익만 더해야 한다", async () => {
    const state = await orders.loadCycleState({ ...account, cycleNumber: 2 }, "2009-03-05");

    expect(state.realizedPnl).toBe(-300);
  });

  it("이번 사이클 순실현손실만큼 예수금이 줄어야 한다", async () => {
    const state = await orders.loadCycleState({ ...account, cycleNumber: 2 }, "2009-03-05");

    expect(cashBreakdown(state)).toMatchObject({
      availableCash: 9_700,
      accountCash: 9_700,
      netRealizedLoss: 300,
    });
  });

  it("수익 기록이 없는 사이클은 실현손익이 0이어야 한다", async () => {
    const state = await orders.loadCycleState({ ...account, cycleNumber: 3 }, "2009-03-05");

    expect(state.realizedPnl).toBe(0);
  });
});
