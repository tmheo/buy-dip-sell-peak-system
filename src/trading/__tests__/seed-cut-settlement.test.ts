/**
 * 시드 감액으로 끝난 사이클의 출금액을 검증한다 (ADR-0006, #118)
 *
 * 예수금보다 큰 시드 감액은 적용일에 보유 티어를 모두 팔아 사이클을 끝낸다. 팔기 전에는 출금할
 * 돈이 없으므로, 사용자는 다음 사이클에 들어서서 `옛 시드 + 끝난 사이클 실현손익 - 새 시드`만큼
 * 출금한다(음수이면 입금). 사이클이 시드 감액으로 끝났는지는 따로 저장하지 않는다 - 끝난 사이클의
 * 마지막 매도일 아침 상태를 수익 기록과 시드 이력으로 다시 조립해 주문표와 같은 판정 함수로 본다.
 *
 * 합성 시세 (TQQQ, 상장 2010-02-11 이전이라 실제 시세와 겹치지 않는다):
 * 2009-08-17(월) - 2009-08-24(월). 판정은 매도일과 그 직전 거래일(가격 행 기준)의 시드를 견준다.
 * 계좌는 모두 시드 $10,000, 2009-08-17에 만들고, 마지막 매도일은 2009-08-20(목)이다.
 * 시드 변경은 바꾼 날의 다음 거래일부터 쓰이므로 08-19에 바꾸면 08-20부터 쓰인다.
 *
 * 손으로 계산한 매도 (매도금액 = 매도가 × 수량, 손익 = 매도금액 - 매수가 × 수량):
 * - 티어 1: $100 × 20주($2,000)를 $97.50에 매도 → $1,950, 손익 -$50
 * - 티어 2: $98 × 20주($1,960)를 $93.49에 매도 → $1,869.80, 손익 -$90.20
 * - 두 티어 합: 손익 -$140.20, 매도일 아침 투자 중 $3,960
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";

import { hasDb } from "@/test-utils/db";
import { settledSale } from "@/test-utils/settled-sale";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/auth";
import { dailyPrices } from "@/database/schema/index";
import { cashBreakdown } from "@/strategy";
import type { TradingAccount } from "@/types/trading";

const TEST_USER_ID = randomUUID();
const CREATED_ON = "2009-08-17";
const SELL_DAY = "2009-08-20";
const PRICE_DATES = [
  "2009-08-17",
  "2009-08-18",
  "2009-08-19",
  "2009-08-20",
  "2009-08-21",
  "2009-08-24",
];

interface Sale {
  tier: number;
  buyDate: string;
  buyPrice: number;
  shares: number;
  sellDate: string;
  sellPrice: number;
}

const TIER_1_ON_SELL_DAY: Sale = {
  tier: 1,
  buyDate: "2009-08-17",
  buyPrice: 100,
  shares: 20,
  sellDate: SELL_DAY,
  sellPrice: 97.5,
};
const TIER_2_ON_SELL_DAY: Sale = {
  tier: 2,
  buyDate: "2009-08-18",
  buyPrice: 98,
  shares: 20,
  sellDate: SELL_DAY,
  sellPrice: 93.49,
};

describe.skipIf(!hasDb)("시드 감액으로 끝난 사이클의 출금액", () => {
  let storage: typeof import("@/database/trading");
  let trading: typeof import("..");
  const syntheticPriceIds: number[] = [];

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: TEST_USER_ID, email: `test-${TEST_USER_ID}@test.com` })
      .onConflictDoNothing();

    const inserted = await db
      .insert(dailyPrices)
      .values(
        PRICE_DATES.map((date) => ({
          ticker: "TQQQ" as const,
          date,
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          adjClose: 100,
          volume: 1000,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: dailyPrices.id });
    syntheticPriceIds.push(...inserted.map((row) => row.id));

    storage = await import("@/database/trading");
    trading = await import("..");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID)); // 계좌·기록·시드 이력 CASCADE 삭제
    if (syntheticPriceIds.length > 0) {
      await db.delete(dailyPrices).where(inArray(dailyPrices.id, syntheticPriceIds));
    }
  });

  /**
   * 사이클 1을 기록으로 만든다: 시드를 바꾸고(바꾼 날, 새 시드), 판 티어를 사이클 1의 수익 기록으로
   * 남긴 뒤 사이클을 완료한다. 보유는 모두 팔렸으므로 티어 홀딩은 비어 있다.
   */
  async function endedCycle(
    seedChanges: Array<{ changedOn: string; seedCapital: number }>,
    sales: Sale[]
  ): Promise<TradingAccount> {
    const account = await storage.createTradingAccount(
      TEST_USER_ID,
      {
        name: "출금액 테스트 계좌",
        ticker: "TQQQ",
        seedCapital: 10_000,
        strategy: "Pro2",
        cycleStartDate: CREATED_ON,
      },
      CREATED_ON
    );
    for (const { changedOn, seedCapital } of seedChanges) {
      await storage.changeSeedCapital(account.id, TEST_USER_ID, seedCapital, changedOn);
    }
    for (const sale of sales) {
      await storage.createProfitRecord({
        accountId: account.id,
        ticker: "TQQQ",
        strategy: "Pro2",
        cycleNumber: 1,
        sellDate: sale.sellDate,
        ...settledSale(sale),
      });
    }
    await storage.completeCycleAndIncrement(account.id);
    return (await storage.getTradingAccountById(account.id, TEST_USER_ID))!;
  }

  it("시드를 $10,000에서 $3,000로 줄여 손실 -$140.20으로 끝났으면 $6,859.80을 출금해야 한다", async () => {
    // 매도일 아침: 새 시드 $3,000 - 투자 중 $3,960 < 0 → 시드 감액으로 끝나는 날
    const account = await endedCycle(
      [{ changedOn: "2009-08-19", seedCapital: 3_000 }],
      [TIER_1_ON_SELL_DAY, TIER_2_ON_SELL_DAY]
    );

    expect(await trading.loadSeedCutSettlement(account)).toEqual({
      endedCycleNumber: 1,
      previousSeed: 10_000,
      realizedPnl: -140.2,
      cashAtCycleEnd: 9_859.8,
      newSeed: 3_000,
      withdrawal: 6_859.8,
    });
  });

  it("앞서 판 티어의 이익으로 끝난 사이클 실현손익이 이익이면 그 이익까지 출금해야 한다", async () => {
    // 08-18에 티어 3 $100 × 10주를 $130에 팔아 +$300. 매도일 아침 실현손익이 이익이어도 예수금은
    // 투자되지 않은 사이클 자본을 넘지 않는다: min(3,000 - 3,960, 3,000 - 3,960 + 300) < 0
    // → 시드 감액으로 끝나는 날. 끝난 사이클 실현손익 = 300 - 140.20 = +$159.80
    const account = await endedCycle(
      [{ changedOn: "2009-08-19", seedCapital: 3_000 }],
      [
        {
          tier: 3,
          buyDate: "2009-08-17",
          buyPrice: 100,
          shares: 10,
          sellDate: "2009-08-18",
          sellPrice: 130,
        },
        TIER_1_ON_SELL_DAY,
        TIER_2_ON_SELL_DAY,
      ]
    );

    expect(await trading.loadSeedCutSettlement(account)).toEqual({
      endedCycleNumber: 1,
      previousSeed: 10_000,
      realizedPnl: 159.8,
      cashAtCycleEnd: 10_159.8,
      newSeed: 3_000,
      withdrawal: 7_159.8,
    });
  });

  it("손실이 옛 시드와 새 시드의 차이보다 크면 입금할 금액을 음수로 내야 한다", async () => {
    // 시드 $10,000 → $9,000, 매도일 아침: 08-18에 티어 3을 -$9,000에 손절해 실현손익 -$9,000
    // → 예수금 min(9,000 - 3,960, 9,000 - 3,960 - 9,000) < 0 → 시드 감액으로 끝나는 날
    // 끝난 사이클 실현손익 = -9,000 - 140.20 = -$9,140.20 → 10,000 - 9,140.20 - 9,000 = -$8,140.20
    const account = await endedCycle(
      [{ changedOn: "2009-08-19", seedCapital: 9_000 }],
      [
        {
          tier: 3,
          buyDate: "2009-08-17",
          buyPrice: 100,
          shares: 100,
          sellDate: "2009-08-18",
          sellPrice: 10,
        },
        TIER_1_ON_SELL_DAY,
        TIER_2_ON_SELL_DAY,
      ]
    );

    expect(await trading.loadSeedCutSettlement(account)).toEqual({
      endedCycleNumber: 1,
      previousSeed: 10_000,
      realizedPnl: -9_140.2,
      cashAtCycleEnd: 859.8,
      newSeed: 9_000,
      withdrawal: -8_140.2,
    });
  });

  it("예수금 이내 감액의 적용일에 보유 티어가 모두 팔려 끝난 사이클은 시드 감액으로 끝난 사이클이 아니다", async () => {
    // 시드 $10,000 → $9,000가 적용된 날 두 티어가 모두 MOC로 팔렸다(손절일에 걸린 날과 같다).
    // 그날 아침 예수금 = 9,000 - 3,960 = $5,040 ≥ 0 → 사이클이 이어지는 감액이었다.
    // 감액분 $1,000은 적용일 전에 이미 출금할 수 있었으므로 시드 감액 정산이 없다.
    const account = await endedCycle(
      [{ changedOn: "2009-08-19", seedCapital: 9_000 }],
      [TIER_1_ON_SELL_DAY, TIER_2_ON_SELL_DAY]
    );

    expect(await trading.loadSeedCutSettlement(account)).toBeNull();
  });

  it("사이클 중 증액 뒤 감액으로 끝났으면 증액된 시드를 옛 시드로 써야 한다", async () => {
    // 08-17에 $15,000로 늘려 08-18부터, 08-19에 $4,000로 줄여 08-20부터 쓰인다.
    // 매도일 아침: 티어 1 $100 × 20주 + 티어 2 $98 × 30주 = 투자 중 $4,940 > 새 시드 $4,000
    // 매도: 티어 1 -$50, 티어 2 $98 × 30주를 $96에 → $2,880, -$60. 실현손익 -$110
    // → 15,000 - 110 - 4,000 = $10,890
    const account = await endedCycle(
      [
        { changedOn: "2009-08-17", seedCapital: 15_000 },
        { changedOn: "2009-08-19", seedCapital: 4_000 },
      ],
      [TIER_1_ON_SELL_DAY, { ...TIER_2_ON_SELL_DAY, shares: 30, sellPrice: 96 }]
    );

    expect(await trading.loadSeedCutSettlement(account)).toEqual({
      endedCycleNumber: 1,
      previousSeed: 15_000,
      realizedPnl: -110,
      cashAtCycleEnd: 14_890,
      newSeed: 4_000,
      withdrawal: 10_890,
    });
  });

  it("사이클 2를 시드 감액으로 끝내는 날에도 아직 사이클 1의 시드 감액 정산을 내야 한다", async () => {
    // 사이클 1은 $10,000 → $3,000로 끝났다(출금 $6,859.80). 사이클 2는 08-21에 티어 1을
    // $100 × 3주($300)로 샀고, 같은 날 시드를 $200로 줄여 08-24부터 쓰인다.
    // 08-24 아침: 새 시드 $200 - 투자 중 $300 < 0 → 사이클 2를 시드 감액으로 끝내는 날이다.
    // 사이클 2의 시드 감액 정산은 그 매도가 체결되어 사이클 3으로 넘어간 뒤에 나온다
    const account = await endedCycle(
      [{ changedOn: "2009-08-19", seedCapital: 3_000 }],
      [TIER_1_ON_SELL_DAY, TIER_2_ON_SELL_DAY]
    );
    await storage.updateTierHolding(account.id, 1, {
      buyPrice: 100,
      shares: 3,
      buyDate: "2009-08-21",
    });
    await storage.changeSeedCapital(account.id, TEST_USER_ID, 200, "2009-08-21");

    const cycleTwoEndsToday = cashBreakdown(await trading.loadCycleState(account, "2009-08-24"));
    expect(cycleTwoEndsToday.endsCycleBySeedCut).toBe(true);
    expect(await trading.loadSeedCutSettlement(account)).toEqual({
      endedCycleNumber: 1,
      previousSeed: 10_000,
      realizedPnl: -140.2,
      cashAtCycleEnd: 9_859.8,
      newSeed: 3_000,
      withdrawal: 6_859.8,
    });
  });

  it("다음 사이클이 끝나면 더는 정산을 내지 않아야 한다", async () => {
    const account = await endedCycle(
      [{ changedOn: "2009-08-19", seedCapital: 3_000 }],
      [TIER_1_ON_SELL_DAY, TIER_2_ON_SELL_DAY]
    );
    // 사이클 2가 정상 완료돼 사이클 3이 됐다
    await storage.completeCycleAndIncrement(account.id);

    const afterNextCycle = (await storage.getTradingAccountById(account.id, TEST_USER_ID))!;
    expect(afterNextCycle.cycleNumber).toBe(3);
    expect(await trading.loadSeedCutSettlement(afterNextCycle)).toBeNull();
  });

  it("끝난 사이클이 없는 첫 사이클에는 정산이 없다", async () => {
    const account = await storage.createTradingAccount(
      TEST_USER_ID,
      {
        name: "첫 사이클 계좌",
        ticker: "TQQQ",
        seedCapital: 10_000,
        strategy: "Pro2",
        cycleStartDate: CREATED_ON,
      },
      CREATED_ON
    );

    expect(await trading.loadSeedCutSettlement(account)).toBeNull();
  });
});
