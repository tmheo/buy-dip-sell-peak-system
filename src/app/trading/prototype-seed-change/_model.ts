/**
 * PROTOTYPE - 버려질 코드. main에 합치지 않는다 (#106 사이클 중 시드 변경 화면).
 *
 * 가상 계좌 하나를 매매 규칙(planOrdersDetailed, settle, cashBreakdown)으로 하루씩 굴려
 * 시드 변경의 네 시점을 만든다. 규칙이 아직 없는 두 가지만 여기서 흉내 낸다:
 * - ADR-0005: 바꾼 날의 다음 거래일(적용일)부터 새 시드를 사이클 자본으로 쓴다.
 * - ADR-0006: 적용일에 시드가 줄었고 새 시드로 계산한 0으로 자르기 전의 예수금이 0보다 작으면
 *   매수 없이 보유 티어를 모두 MOC로 판다.
 */
import Decimal from "decimal.js";
import {
  availableCash,
  cashBreakdown,
  getStrategyParams,
  planOrdersDetailed,
  settle,
  startNextCycle,
  calculateSellLimitPrice,
} from "@/strategy";
import type {
  CashBreakdown,
  CycleState,
  OrderIntent,
  ReducedBuy,
  TierHolding as RuleHolding,
  UnaffordableBuy,
} from "@/strategy";
import type { DailyOrder, TierHolding, TradingAccountWithHoldings } from "@/types/trading";

export const OLD_SEED = 10000;
export const MIN_SEED = 2000;
const STRATEGY = "Pro2" as const;
const params = getStrategyParams(STRATEGY);

/** 바꾼 날, 적용일, 그다음 거래일. 사이클 시작일은 계좌를 만들 때의 시드가 적용된 날이다 */
export const DATES = {
  cycleStart: "2026-10-01",
  change: "2026-11-10",
  apply: "2026-11-11",
  next: "2026-11-12",
} as const;

// 종가: 바꾼 날의 전날, 바꾼 날, 적용일
const CLOSE_BEFORE_CHANGE = 27.9;
const CLOSE_CHANGE_FILLED = 27.5; // 4번 티어 매수가 체결되는 종가
const CLOSE_CHANGE_UNFILLED = 28.0; // 매수 지정가보다 높아 체결되지 않는 종가
const CLOSE_APPLY = 27.8;

const HELD: RuleHolding[] = [
  { tier: 1, buyPrice: 30.0, shares: 33, buyDate: "2026-11-02", holdingDays: 6 },
  { tier: 2, buyPrice: 29.1, shares: 51, buyDate: "2026-11-04", holdingDays: 4 },
  { tier: 3, buyPrice: 28.2, shares: 70, buyDate: "2026-11-06", holdingDays: 2 },
];
const LOSS = -310.5;

export type Phase = "before" | "pending" | "applied" | "after";

export const PHASES: Array<{ key: Phase; name: string }> = [
  { key: "before", name: "바꾸는 날" },
  { key: "pending", name: "저장 뒤" },
  { key: "applied", name: "적용일" },
  { key: "after", name: "적용 다음 날" },
];

export interface Fixture {
  phase: Phase;
  // 저장한 새 시드. 바꾸는 날 저장 전이면 null
  newSeed: number | null;
  withLoss: boolean;
  // 바꾼 날의 4번 티어 매수가 그날 종가로 체결되는지
  buyFilled: boolean;
}

/** 바꾸는 순간에 고른 새 시드가 어느 구간인지 (ADR-0004, ADR-0006 Consequences) */
export type SeedChangeKind =
  | "same"
  | "invalid"
  | "increase"
  | "keep" // 오늘 매수가 체결돼도 예수금 이내
  | "depends" // 오늘 매수가 체결되면 예수금보다 커진다
  | "ends"; // 직전 마감 예수금보다 크다

export interface Preview {
  // 직전 거래일까지 마감된 예수금
  closedCash: number;
  // 오늘 주문표의 매수 (없으면 null)
  todayBuy: { tier: number; shares: number; limitPrice: number; maxCost: number } | null;
  // 오늘 매수가 지정가로 체결된다고 쳤을 때의 예수금 (어림)
  cashIfBuyFills: number;
}

export interface HoldingRow extends TierHolding {
  // 매수 당시 적용된 시드 (시드 이력에서 찾는다)
  seedAtBuy: number;
}

export interface SeedHistoryRow {
  effectiveDate: string;
  seed: number;
  status: "past" | "current" | "pending";
}

export interface Model {
  date: string;
  fixture: Fixture;
  // 그날 적용되는 시드 (사이클 자본)
  appliedSeed: number;
  // 아직 적용되지 않은 시드 변경
  pending: { seed: number; effectiveDate: string } | null;
  account: TradingAccountWithHoldings;
  holdings: HoldingRow[];
  cash: CashBreakdown;
  orders: DailyOrder[];
  unaffordableBuy: UnaffordableBuy | null;
  reducedBuy: ReducedBuy | null;
  latestClose: { date: string; adjClose: number };
  preview: Preview;
  // 적용일 주문표가 사이클을 끝내려 모두 파는가
  isSellAllDay: boolean;
  // 적용일에 모두 팔아 사이클이 끝났는가 (적용 다음 날)
  endedBySeedCut: {
    cycleNumber: number;
    realizedPnl: number;
    // 옛 시드로 따진 증권사 잔고: 옛 시드 + 끝난 사이클 실현손익
    brokerCash: number;
    // 시스템이 적용일의 사이클 자본(새 시드)으로 계산한 끝난 사이클의 계좌 현금
    systemAccountCash: number;
    // 출금할 금액 (음수면 입금)
    withdrawal: number;
  } | null;
  seedHistory: SeedHistoryRow[];
}

function round2(v: Decimal.Value): number {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

function invested(holdings: RuleHolding[]): number {
  return holdings
    .reduce((s, h) => s.add(new Decimal(h.buyPrice).mul(h.shares)), new Decimal(0))
    .toNumber();
}

/** 0으로 자르기 전의 예수금: min(사이클 자본 - Σ 매수금액, 계좌 현금) (ADR-0006) */
function rawCash(state: CycleState): number {
  const uninvested = new Decimal(state.cycleCapital).sub(invested(state.holdings));
  return Decimal.min(uninvested, uninvested.add(state.realizedPnl)).toNumber();
}

export function classify(newSeed: number, preview: Preview, oldSeed = OLD_SEED): SeedChangeKind {
  if (!Number.isFinite(newSeed) || newSeed < MIN_SEED) return "invalid";
  if (newSeed === oldSeed) return "same";
  if (newSeed > oldSeed) return "increase";
  const cut = oldSeed - newSeed;
  if (cut > preview.closedCash) return "ends";
  if (cut > preview.cashIfBuyFills) return "depends";
  return "keep";
}

function toDailyOrders(intents: OrderIntent[], date: string): DailyOrder[] {
  return intents.map((o, i) => ({
    id: `o${i}`,
    accountId: "proto",
    date,
    tier: o.tier,
    type: o.type,
    orderMethod: o.orderMethod,
    limitPrice: o.limitPrice ?? 0,
    shares: o.shares,
    executed: false,
    createdAt: date,
    updatedAt: date,
  }));
}

function sellAll(state: CycleState): OrderIntent[] {
  return state.holdings.map((h) => ({
    type: "SELL",
    tier: h.tier,
    orderMethod: "MOC",
    limitPrice: null,
    shares: h.shares,
  }));
}

export function buildModel(fixture: Fixture): Model {
  const { phase, withLoss, buyFilled } = fixture;
  const newSeed = phase === "before" ? null : fixture.newSeed;

  // 바꾼 날: 옛 시드로 만든 주문표
  const stateChange: CycleState = {
    strategy: params,
    cycleCapital: OLD_SEED,
    holdings: HELD,
    cycleNumber: 3,
    realizedPnl: withLoss ? LOSS : 0,
  };
  const planChange = planOrdersDetailed(stateChange, CLOSE_BEFORE_CHANGE);
  const buyIntent = planChange.intents.find((o) => o.type === "BUY");
  const closedCash = availableCash(stateChange);
  const todayBuy = buyIntent
    ? {
        tier: buyIntent.tier,
        shares: buyIntent.shares,
        limitPrice: buyIntent.limitPrice ?? 0,
        maxCost: round2(new Decimal(buyIntent.limitPrice ?? 0).mul(buyIntent.shares)),
      }
    : null;
  const preview: Preview = {
    closedCash,
    todayBuy,
    cashIfBuyFills: Math.max(0, round2(new Decimal(closedCash).sub(todayBuy?.maxCost ?? 0))),
  };

  const effectiveSeed = newSeed ?? OLD_SEED;
  const seedOn = (date: string): number =>
    newSeed !== null && date >= DATES.apply ? newSeed : OLD_SEED;
  const seedHistory: SeedHistoryRow[] = [
    { effectiveDate: DATES.cycleStart, seed: OLD_SEED, status: "current" },
  ];
  if (newSeed !== null && newSeed !== OLD_SEED) {
    const applied = phase === "applied" || phase === "after";
    seedHistory[0].status = applied ? "past" : "current";
    seedHistory.push({
      effectiveDate: DATES.apply,
      seed: newSeed,
      status: applied ? "current" : "pending",
    });
  }

  let date: string = DATES.change;
  let state: CycleState = stateChange;
  let intents = planChange.intents;
  let unaffordableBuy = planChange.unaffordableBuy;
  let reducedBuy = planChange.reducedBuy;
  let latestClose = { date: "2026-11-09", adjClose: CLOSE_BEFORE_CHANGE };
  let isSellAllDay = false;
  let endedBySeedCut: Model["endedBySeedCut"] = null;

  if (phase === "applied" || phase === "after") {
    const closeChange = buyFilled ? CLOSE_CHANGE_FILLED : CLOSE_CHANGE_UNFILLED;
    const afterChange = settle(stateChange, planChange.intents, {
      date: DATES.change,
      close: closeChange,
    }).newState;
    const stateApply: CycleState = { ...afterChange, cycleCapital: effectiveSeed };
    isSellAllDay = effectiveSeed < OLD_SEED && rawCash(stateApply) < 0;
    const planApply = isSellAllDay
      ? { intents: sellAll(stateApply), unaffordableBuy: null, reducedBuy: null }
      : planOrdersDetailed(stateApply, closeChange);

    date = DATES.apply;
    state = stateApply;
    intents = planApply.intents;
    unaffordableBuy = planApply.unaffordableBuy;
    reducedBuy = planApply.reducedBuy;
    latestClose = { date: DATES.change, adjClose: closeChange };

    if (phase === "after") {
      const result = settle(stateApply, planApply.intents, {
        date: DATES.apply,
        close: CLOSE_APPLY,
      });
      let stateNext = result.newState;
      if (isSellAllDay) {
        const systemAccountCash = round2(new Decimal(effectiveSeed).add(stateNext.realizedPnl));
        const brokerCash = round2(new Decimal(OLD_SEED).add(stateNext.realizedPnl));
        endedBySeedCut = {
          cycleNumber: stateNext.cycleNumber,
          realizedPnl: stateNext.realizedPnl,
          brokerCash,
          systemAccountCash,
          withdrawal: round2(new Decimal(brokerCash).sub(effectiveSeed)),
        };
        stateNext = startNextCycle(stateNext, effectiveSeed);
      }
      const planNext = planOrdersDetailed(stateNext, CLOSE_APPLY);
      date = DATES.next;
      state = stateNext;
      intents = planNext.intents;
      unaffordableBuy = planNext.unaffordableBuy;
      reducedBuy = planNext.reducedBuy;
      latestClose = { date: DATES.apply, adjClose: CLOSE_APPLY };
      isSellAllDay = false;
    }
  }

  const holdings: HoldingRow[] = state.holdings.map((h) => ({
    id: `h${h.tier}`,
    accountId: "proto",
    tier: h.tier,
    buyPrice: h.buyPrice,
    shares: h.shares,
    buyDate: h.buyDate,
    sellTargetPrice: calculateSellLimitPrice(h.buyPrice, params.sellThreshold),
    createdAt: date,
    updatedAt: date,
    seedAtBuy: seedOn(h.buyDate),
  }));

  const appliedSeed = state.cycleCapital;
  const pending =
    newSeed !== null && newSeed !== OLD_SEED && phase === "pending"
      ? { seed: newSeed, effectiveDate: DATES.apply }
      : null;

  const account: TradingAccountWithHoldings = {
    id: "proto",
    userId: "proto",
    name: "프로토타입 계좌",
    ticker: "SOXL",
    seedCapital: appliedSeed,
    strategy: STRATEGY,
    cycleStartDate: DATES.cycleStart,
    cycleNumber: state.cycleNumber,
    lastProcessedDate: date,
    lastViewedAt: date,
    createdAt: date,
    updatedAt: date,
    holdings,
    totalShares: holdings.reduce((s, h) => s + h.shares, 0),
    isCycleInProgress: holdings.length > 0,
  };

  return {
    date,
    fixture: { ...fixture, newSeed },
    appliedSeed,
    pending,
    account,
    holdings,
    cash: cashBreakdown(state),
    orders: toDailyOrders(intents, date),
    unaffordableBuy,
    reducedBuy,
    latestClose,
    preview,
    isSellAllDay,
    endedBySeedCut,
    seedHistory,
  };
}

// =====================================================
// 표시 형식
// =====================================================

export function usd(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** YYYY-MM-DD → "11월 11일(수)" */
export function md(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return `${m}월 ${d}일(${WEEKDAYS[day]})`;
}
