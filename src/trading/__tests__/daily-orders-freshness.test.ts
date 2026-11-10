/**
 * 주문표 신선도 판정 테스트 (#80, #96)
 *
 * 저장 모듈을 대역으로 바꿔, getFreshDailyOrders가 소유하는 판정만 검증한다.
 * 신선도는 "지금 다시 만들면 같은가"다 - 지금의 계좌 설정·보유 티어·가격 기록으로
 * 주문을 다시 계산해 저장된 주문표와 주문 내용(티어, 매수·매도, 주문 방식, 지정가, 수량)을
 * 비교한다 (GLOSSARY.md "주문표 신선도").
 *
 * 기준 시나리오 (SOXL, Pro2, 시드 $100,000, 주문일 2026-07-15):
 * - 직전 거래일 2026-07-14 종가 $50
 * - 티어 1 보유: 2026-07-06에 $48 × 208주 매수, 보유 6거래일 (07-07 ~ 07-14)
 * - 기대 주문표 (손으로 계산한 값):
 *   - 티어 1 LOC 매도: floor(48 × 1.015, 2) = $48.72, 208주
 *   - 티어 2 LOC 매수: floor(50 × 0.9999, 2) = $49.99, floor(15,000 ÷ 49.99) = 300주
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { DailyOrder, TierHolding, TradingAccount } from "@/types/trading";

vi.mock("@/database/trading", () => ({
  getCycleRealizedPnl: vi.fn(),
  getDailyOrders: vi.fn(),
  getTierHoldings: vi.fn(),
  getPreviousTradingClose: vi.fn(),
  listTradingDatesBetween: vi.fn(),
  replaceDailyOrders: vi.fn(),
  // 읽기 시점은 대역 저장 함수에 그대로 넘겨지기만 하므로 빈 실행자로 work를 바로 부른다
  runInReadSnapshot: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})),
}));

import {
  getCycleRealizedPnl,
  getDailyOrders,
  getTierHoldings,
  getPreviousTradingClose,
  listTradingDatesBetween,
  replaceDailyOrders,
  type NewDailyOrder,
} from "@/database/trading";

import { getFreshDailyOrders } from "../orders";

const mockedGetCycleRealizedPnl = vi.mocked(getCycleRealizedPnl);
const mockedGetDailyOrders = vi.mocked(getDailyOrders);
const mockedGetTierHoldings = vi.mocked(getTierHoldings);
const mockedGetPreviousTradingClose = vi.mocked(getPreviousTradingClose);
const mockedListTradingDatesBetween = vi.mocked(listTradingDatesBetween);
const mockedReplaceDailyOrders = vi.mocked(replaceDailyOrders);

const ACCOUNT_ID = "account-1";
const DATE = "2026-07-15";

/** 티어 1 매수일 다음 날부터 주문일 전날까지의 거래일 (보유 6거래일) */
const TRADING_DATES_SINCE_TIER1_BUY = [
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
  "2026-07-13",
  "2026-07-14",
];

/**
 * 티어 1을 2026-06-29에 샀을 때 그 뒤 주문일 전날까지의 거래일 (07-03 휴장).
 * 보유 9거래일 → 당일 마감 시점 10거래일로 Pro2 손절일에 닿는다.
 */
const NINE_TRADING_DATES = [
  "2026-06-30",
  "2026-07-01",
  "2026-07-02",
  ...TRADING_DATES_SINCE_TIER1_BUY,
];

/** 티어 1을 손절일에 닿도록 오래 보유한 상태 (매수가·수량은 기준 시나리오와 같다) */
function holdTier1UntilStopLoss(): void {
  mockedGetTierHoldings.mockResolvedValue([
    createHolding({ tier: 1, buyPrice: 48, shares: 208, buyDate: "2026-06-29" }),
  ]);
  mockedListTradingDatesBetween.mockResolvedValue(NINE_TRADING_DATES);
}

/** 기준 시나리오에서 지금 다시 만들면 나오는 주문 (저장 순서: 티어·유형 오름차순) */
const FRESH_ROWS: NewDailyOrder[] = [
  { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
  { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 300 },
];

function createAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: ACCOUNT_ID,
    userId: "user-1",
    name: "테스트 계좌",
    ticker: "SOXL",
    seedCapital: 100_000,
    strategy: "Pro2",
    cycleStartDate: "2026-07-01",
    cycleNumber: 1,
    lastProcessedDate: "2026-07-14",
    lastViewedAt: "2026-07-15T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function createHolding(overrides: Partial<TierHolding>): TierHolding {
  return {
    id: `holding-${overrides.tier}`,
    accountId: ACCOUNT_ID,
    tier: 1,
    buyPrice: null,
    shares: 0,
    buyDate: null,
    sellTargetPrice: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/** 저장된 주문 행. 주문 내용만 정하면 나머지는 미체결 기본값으로 채운다. */
function storedOrders(rows: NewDailyOrder[], executed = false): DailyOrder[] {
  return rows.map((row, index) => ({
    id: `order-${index}`,
    accountId: ACCOUNT_ID,
    date: DATE,
    ...row,
    executed,
    createdAt: "2026-07-15T00:10:00.000Z",
    updatedAt: "2026-07-15T00:10:00.000Z",
  }));
}

/** 재생성 여부를 눈에 보이게 하는 표식. 교체 경로를 탔을 때만 반환된다. */
const REGENERATED: DailyOrder[] = storedOrders([
  { tier: 9, type: "BUY", orderMethod: "LOC", limitPrice: 1, shares: 1 },
]);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetTierHoldings.mockResolvedValue([
    createHolding({ tier: 1, buyPrice: 48, shares: 208, buyDate: "2026-07-06" }),
    createHolding({ tier: 2 }),
  ]);
  mockedListTradingDatesBetween.mockResolvedValue(TRADING_DATES_SINCE_TIER1_BUY);
  mockedGetCycleRealizedPnl.mockResolvedValue(0); // 이번 사이클에 아직 매도 기록이 없다
  mockedGetPreviousTradingClose.mockResolvedValue({ date: "2026-07-14", adjClose: 50 });
  mockedReplaceDailyOrders.mockResolvedValue(REGENERATED);
});

/** 저장된 주문표가 낡았다고 판정되어 rows로 교체됐는지 확인한다. */
async function expectReplacedWith(account: TradingAccount, rows: NewDailyOrder[]): Promise<void> {
  const { orders } = await getFreshDailyOrders(account, DATE);

  expect(orders).toBe(REGENERATED);
  expect(mockedReplaceDailyOrders).toHaveBeenCalledOnce();
  expect(mockedReplaceDailyOrders).toHaveBeenCalledWith(ACCOUNT_ID, DATE, rows);
}

/** 저장된 주문표가 그대로 반환되고 교체되지 않았는지 확인한다. */
async function expectKept(account: TradingAccount, existing: DailyOrder[]): Promise<void> {
  const { orders } = await getFreshDailyOrders(account, DATE);

  expect(orders).toBe(existing);
  expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
}

describe("getFreshDailyOrders - 계좌 설정 변경", () => {
  it("시드 금액이 바뀌어 매수 수량이 달라지면 낡은 것으로 보고 다시 만든다", async () => {
    // 수정 시각은 그대로다 - 판정은 수정 시각이 아니라 주문 내용으로 한다
    mockedGetDailyOrders.mockResolvedValue(storedOrders(FRESH_ROWS));

    // 시드 $50,000: 티어 2 금액 7,500 → floor(7,500 ÷ 49.99) = 150주
    await expectReplacedWith(createAccount({ seedCapital: 50_000 }), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 150 },
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
    ]);
  });

  it("전략이 바뀌면 낡은 것으로 보고 다시 만든다", async () => {
    mockedGetDailyOrders.mockResolvedValue(storedOrders(FRESH_ROWS));

    // Pro1: 티어 2 비율 10% → floor(10,000 ÷ 49.99) = 200주, 매도 floor(48 × 1.0001, 2) = $48.00
    await expectReplacedWith(createAccount({ strategy: "Pro1" }), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 200 },
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48, shares: 208 },
    ]);
  });

  it("종목이 바뀌면 그 종목의 직전 종가로 다시 만든다", async () => {
    mockedGetDailyOrders.mockResolvedValue(storedOrders(FRESH_ROWS));
    mockedGetPreviousTradingClose.mockImplementation(async (ticker) =>
      ticker === "TQQQ"
        ? { date: "2026-07-14", adjClose: 80 }
        : { date: "2026-07-14", adjClose: 50 }
    );

    // TQQQ 직전 종가 $80: 매수 floor(80 × 0.9999, 2) = $79.99, floor(15,000 ÷ 79.99) = 187주
    await expectReplacedWith(createAccount({ ticker: "TQQQ" }), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 79.99, shares: 187 },
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
    ]);
    expect(mockedGetPreviousTradingClose).toHaveBeenCalledWith("TQQQ", DATE);
  });

  it("운용 시작일 변경처럼 주문 내용이 그대로인 설정 변경은 교체하지 않는다", async () => {
    // 수정 시각 비교는 없어졌다 - 설정이 바뀌어도 다시 만든 주문이 같으면 신선하다.
    // 운용 시작일은 주문 계산의 입력이 아니다. 사이클 안 실현손익(ADR-0003)도
    // 시작일이 아니라 수익 기록의 사이클 번호로 묶는다 (#97).
    const existing = storedOrders(FRESH_ROWS);
    mockedGetDailyOrders.mockResolvedValue(existing);
    const account = createAccount({
      cycleStartDate: "2026-07-06",
      updatedAt: "2026-07-15T01:00:00.000Z",
    });

    await expectKept(account, existing);
  });
});

describe("getFreshDailyOrders - 가격 기록과 보유 상태 변화", () => {
  it("직전 종가가 뒤늦게 적재되면 그 종가로 다시 만든다", async () => {
    // 전일(07-14) 종가 적재 전에 07-13 종가 $52로 만든 주문표:
    // 매수 floor(52 × 0.9999, 2) = $51.99, floor(15,000 ÷ 51.99) = 288주
    mockedGetDailyOrders.mockResolvedValue(
      storedOrders([
        { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
        { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 51.99, shares: 288 },
      ])
    );

    await expectReplacedWith(createAccount(), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 300 },
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
    ]);
  });

  it("보유 거래일 수가 늘어 손절일에 닿으면 MOC 매도로 다시 만든다", async () => {
    // 주문표를 만들 때는 06-30 ~ 07-02 가격 행이 아직 없어 보유 6거래일로 셌다(LOC 매도).
    // 가격 행이 채워져 보유 9거래일이 되면 당일 마감 시점 10거래일 = Pro2 손절일이다.
    mockedGetDailyOrders.mockResolvedValue(storedOrders(FRESH_ROWS));
    holdTier1UntilStopLoss();

    // MOC의 표시용 지정가는 직전 종가 $50
    await expectReplacedWith(createAccount(), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 300 },
      { tier: 1, type: "SELL", orderMethod: "MOC", limitPrice: 50, shares: 208 },
    ]);
  });
});

describe("getFreshDailyOrders - 이번 사이클 실현손익 (ADR-0003)", () => {
  it("이번 사이클 순실현손실이 생기면 줄어든 예수금으로 다시 만든다", async () => {
    // 손실이 기록되기 전에 만든 주문표(티어 2 매수 300주)가 저장돼 있다
    mockedGetDailyOrders.mockResolvedValue(storedOrders(FRESH_ROWS));
    // 이번 사이클에 앞서 손절한 티어들의 순실현손실 -$80,016
    mockedGetCycleRealizedPnl.mockResolvedValue(-80_016);

    // 계좌 현금 = 100,000 - 9,984(티어 1) - 80,016 = $10,000 → 예수금 $10,000
    // 티어 2 금액 min(15,000, 10,000) = 10,000 → floor(10,000 ÷ 49.99) = 200주
    await expectReplacedWith(createAccount(), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 200 },
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
    ]);
  });

  it("이번 사이클 실현이익은 예수금을 늘리지 않아 주문표를 그대로 둔다", async () => {
    const existing = storedOrders(FRESH_ROWS);
    mockedGetDailyOrders.mockResolvedValue(existing);
    mockedGetCycleRealizedPnl.mockResolvedValue(5_000);

    await expectKept(createAccount(), existing);
  });
});

describe("getFreshDailyOrders - 지정가 비교 정밀도", () => {
  it("MOC 표시용 지정가는 소수 둘째 자리로 반올림해 비교한다", async () => {
    holdTier1UntilStopLoss();
    // 직전 종가 $50.004는 limit_price 컬럼에 $50.00으로 저장된다
    mockedGetPreviousTradingClose.mockResolvedValue({ date: "2026-07-14", adjClose: 50.004 });
    const existing = storedOrders([
      { tier: 1, type: "SELL", orderMethod: "MOC", limitPrice: 50, shares: 208 },
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 300 },
    ]);
    mockedGetDailyOrders.mockResolvedValue(existing);

    await expectKept(createAccount(), existing);
  });

  it("MOC 표시용 지정가만 달라도 낡은 것으로 본다", async () => {
    holdTier1UntilStopLoss();
    // 직전 종가 $50.005: 매수 지정가는 그대로 $49.99, MOC 표시가는 $50.01로 달라진다
    mockedGetPreviousTradingClose.mockResolvedValue({ date: "2026-07-14", adjClose: 50.005 });
    mockedGetDailyOrders.mockResolvedValue(
      storedOrders([
        { tier: 1, type: "SELL", orderMethod: "MOC", limitPrice: 50, shares: 208 },
        { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 300 },
      ])
    );

    await expectReplacedWith(createAccount(), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 300 },
      { tier: 1, type: "SELL", orderMethod: "MOC", limitPrice: 50.005, shares: 208 },
    ]);
  });
});

describe("getFreshDailyOrders - 그대로 두는 경우", () => {
  it("주문 내용이 같으면 저장된 주문표를 그대로 반환하고 교체하지 않는다", async () => {
    // 저장 순서(티어·유형 오름차순)와 생성 순서(매수 먼저)가 달라도 같은 주문표다
    const existing = storedOrders(FRESH_ROWS);
    mockedGetDailyOrders.mockResolvedValue(existing);

    await expectKept(createAccount(), existing);
  });

  it("체결된 주문이 하나라도 있으면 낡았어도 다시 만들지 않는다", async () => {
    const existing = [
      ...storedOrders([FRESH_ROWS[0]], true),
      ...storedOrders([{ ...FRESH_ROWS[1], shares: 150 }]),
    ];
    mockedGetDailyOrders.mockResolvedValue(existing);

    await expectKept(createAccount(), existing);
    // 판정에 들어가지 않으므로 다시 계산하지도 않는다
    expect(mockedGetPreviousTradingClose).not.toHaveBeenCalled();
  });

  it("직전 종가가 없어 판정할 수 없으면 저장된 주문표를 그대로 둔다", async () => {
    const existing = storedOrders(FRESH_ROWS);
    mockedGetDailyOrders.mockResolvedValue(existing);
    mockedGetPreviousTradingClose.mockResolvedValue(null);

    await expectKept(createAccount(), existing);
  });
});

describe("getFreshDailyOrders - 주문표가 없을 때", () => {
  it("주문이 없으면 지금의 입력으로 만든다", async () => {
    mockedGetDailyOrders.mockResolvedValue([]);

    await expectReplacedWith(createAccount(), [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 300 },
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
    ]);
  });

  it("주문도 직전 종가도 없으면 만들지 않는다", async () => {
    mockedGetDailyOrders.mockResolvedValue([]);
    mockedGetPreviousTradingClose.mockResolvedValue(null);

    const { orders } = await getFreshDailyOrders(createAccount(), DATE);

    expect(orders).toEqual([]);
    expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
  });
});

describe("getFreshDailyOrders - 예수금으로 1주도 살 수 없는 날 (#98)", () => {
  it("매수 주문 없이 만든 주문표와 함께 매수 차례인 티어와 예수금을 알린다", async () => {
    mockedGetDailyOrders.mockResolvedValue([]);
    // 계좌 현금 = 100,000 - 9,984(티어 1) - 89,990 = $26 → 예수금 $26 < 매수 지정가 $49.99
    mockedGetCycleRealizedPnl.mockResolvedValue(-89_990);

    const { unaffordableBuy } = await getFreshDailyOrders(createAccount(), DATE);

    expect(unaffordableBuy).toEqual({ tier: 2, availableCash: 26 });
    expect(mockedReplaceDailyOrders).toHaveBeenCalledWith(ACCOUNT_ID, DATE, [
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
    ]);
  });

  it("저장된 주문표가 지금 다시 만든 것과 같으면 그대로 두고도 알린다", async () => {
    const stored = storedOrders([FRESH_ROWS[0]]);
    mockedGetDailyOrders.mockResolvedValue(stored);
    mockedGetCycleRealizedPnl.mockResolvedValue(-89_990);

    const { orders, unaffordableBuy } = await getFreshDailyOrders(createAccount(), DATE);

    expect(unaffordableBuy).toEqual({ tier: 2, availableCash: 26 });
    expect(orders).toBe(stored);
    expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
  });

  it("매수 주문이 나가는 날에는 알리지 않는다", async () => {
    mockedGetDailyOrders.mockResolvedValue(storedOrders(FRESH_ROWS));

    const { unaffordableBuy } = await getFreshDailyOrders(createAccount(), DATE);

    expect(unaffordableBuy).toBeNull();
  });

  it("체결된 주문이 있어 주문표를 다시 계산하지 않으면 알리지 않는다", async () => {
    // 체결 뒤의 보유로 다시 계산하면 저장된 주문표와 다른 날의 판단이 된다
    mockedGetDailyOrders.mockResolvedValue(storedOrders([FRESH_ROWS[0]], true));
    mockedGetCycleRealizedPnl.mockResolvedValue(-89_990);

    const { unaffordableBuy } = await getFreshDailyOrders(createAccount(), DATE);

    expect(unaffordableBuy).toBeNull();
  });
});

describe("getFreshDailyOrders - 예수금 때문에 비율대로보다 덜 사는 날 (#98)", () => {
  it("줄어든 수량으로 만든 주문표와 함께 그 티어의 비율대로의 수량을 알린다", async () => {
    mockedGetDailyOrders.mockResolvedValue([]);
    // 계좌 현금 = 100,000 - 9,984(티어 1) - 80,016 = $10,000 → 티어 2 금액 $10,000 (비율대로 $15,000)
    mockedGetCycleRealizedPnl.mockResolvedValue(-80_016);

    const { reducedBuy, unaffordableBuy } = await getFreshDailyOrders(createAccount(), DATE);

    // 비율대로 floor(15,000 ÷ 49.99) = 300주, 실제 floor(10,000 ÷ 49.99) = 200주
    expect(reducedBuy).toEqual({ tier: 2, nominalShares: 300 });
    expect(unaffordableBuy).toBeNull();
    expect(mockedReplaceDailyOrders).toHaveBeenCalledWith(ACCOUNT_ID, DATE, [
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 200 },
      { tier: 1, type: "SELL", orderMethod: "LOC", limitPrice: 48.72, shares: 208 },
    ]);
  });

  it("저장된 주문표가 지금 다시 만든 것과 같으면 그대로 두고도 알린다", async () => {
    const stored = storedOrders([
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 200 },
      FRESH_ROWS[0],
    ]);
    mockedGetDailyOrders.mockResolvedValue(stored);
    mockedGetCycleRealizedPnl.mockResolvedValue(-80_016);

    const { orders, reducedBuy } = await getFreshDailyOrders(createAccount(), DATE);

    expect(reducedBuy).toEqual({ tier: 2, nominalShares: 300 });
    expect(orders).toBe(stored);
    expect(mockedReplaceDailyOrders).not.toHaveBeenCalled();
  });

  it("비율대로 사는 날에는 알리지 않는다", async () => {
    mockedGetDailyOrders.mockResolvedValue(storedOrders(FRESH_ROWS));

    const { reducedBuy } = await getFreshDailyOrders(createAccount(), DATE);

    expect(reducedBuy).toBeNull();
  });

  it("체결된 주문이 있어 주문표를 다시 계산하지 않으면 알리지 않는다", async () => {
    const reducedRows: NewDailyOrder[] = [
      FRESH_ROWS[0],
      { tier: 2, type: "BUY", orderMethod: "LOC", limitPrice: 49.99, shares: 200 },
    ];
    mockedGetDailyOrders.mockResolvedValue(storedOrders(reducedRows, true));
    mockedGetCycleRealizedPnl.mockResolvedValue(-80_016);

    const { reducedBuy } = await getFreshDailyOrders(createAccount(), DATE);

    expect(reducedBuy).toBeNull();
  });
});
