/**
 * CycleState 기반 일별 스냅샷·주문 내역 변환 헬퍼
 * BacktestEngine과 RecommendBacktestEngine이 공유한다.
 *
 * 보유 자산 평가와 체결 내역 변환은 모두 adjClose(수정종가) 기준이다 (#43).
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type { CycleState, Execution, OrderIntent } from "@/strategy";
import { availableCash } from "@/strategy";
import { calculateSMA } from "./metrics";
import type { DailySnapshot, OrderAction, RemainingTier, TradeAction } from "./types";

/**
 * 현금 잔고 계산
 * 현금 = 예수금 + 사이클 중 실현 손익
 * 실현 손익은 현금에는 쌓이지만 매수 여력(예수금)에는 포함되지 않는다 (ADR-0001).
 * 예수금 공식(사이클 자본 - Σ 활성 티어 투자원금)은 src/strategy가 소유한다.
 */
export function cashBalance(state: CycleState, realizedProfit: Decimal): Decimal {
  return new Decimal(availableCash(state)).add(realizedProfit);
}

/**
 * 체결 목록을 스냅샷의 거래 내역으로 변환
 * MOC 매도(손절)는 STOP_LOSS 거래로 기록한다.
 */
export function toTradeActions(executions: Execution[]): TradeAction[] {
  return executions.map((execution) => {
    const { order } = execution;
    const type = order.type === "BUY" ? "BUY" : order.orderMethod === "MOC" ? "STOP_LOSS" : "SELL";
    return {
      type,
      tier: order.tier,
      price: execution.price,
      shares: order.shares,
      amount: execution.amount,
      orderType: order.orderMethod,
    };
  });
}

/**
 * 주문표를 스냅샷의 주문 내역으로 변환 (체결/미체결 모두 포함)
 * MOC 손절 주문은 지정가가 없어 주문 내역에서 제외한다 (거래 내역에 STOP_LOSS로 기록됨).
 */
export function toOrderActions(
  orders: OrderIntent[],
  executions: Execution[],
  closePrice: number
): OrderAction[] {
  const executedOrders = new Set(executions.map((e) => e.order));

  const actions: OrderAction[] = [];
  for (const order of orders) {
    if (order.orderMethod === "MOC") continue;

    const amount = new Decimal(order.limitPrice)
      .mul(order.shares)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (executedOrders.has(order)) {
      const executedAmount = new Decimal(closePrice)
        .mul(order.shares)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
      actions.push({
        type: order.type,
        tier: order.tier,
        limitPrice: order.limitPrice,
        shares: order.shares,
        amount,
        orderType: order.orderMethod,
        executed: true,
        executedPrice: closePrice,
        executedAmount,
      });
    } else {
      const reason =
        order.type === "BUY"
          ? `종가 ${closePrice} > 매수지정가 ${order.limitPrice}`
          : `종가 ${closePrice} < 매도지정가 ${order.limitPrice}`;
      actions.push({
        type: order.type,
        tier: order.tier,
        limitPrice: order.limitPrice,
        shares: order.shares,
        amount,
        orderType: order.orderMethod,
        executed: false,
        reason,
      });
    }
  }
  return actions;
}

/**
 * 일별 스냅샷 생성 (전략 필드는 각 엔진이 채운다)
 * 보유 자산 평가는 adjClose(수정종가)를 사용하여 배당/분할이 반영된 실제 수익률을 계산
 * SPEC-METRICS-001: MA20, MA60 계산
 */
export function createSnapshot(
  price: DailyPrice,
  state: CycleState,
  realizedProfit: Decimal,
  trades: TradeAction[],
  orders: OrderAction[],
  adjClosePrices: number[],
  priceIndex: number
): Omit<DailySnapshot, "strategy"> {
  let holdingsValue = new Decimal(0);
  let totalShares = 0;
  const closePrice = new Decimal(price.adjClose);
  for (const holding of state.holdings) {
    holdingsValue = holdingsValue.add(closePrice.mul(holding.shares));
    totalShares += holding.shares;
  }

  const cash = cashBalance(state, realizedProfit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalAsset = cash.add(holdingsValue).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  return {
    date: price.date,
    open: price.open,
    high: price.high,
    low: price.low,
    close: price.close,
    adjClose: price.adjClose,
    cash: cash.toNumber(),
    holdingsValue: holdingsValue.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalAsset,
    trades,
    orders,
    activeTiers: state.holdings.length,
    totalShares,
    cycleNumber: state.cycleNumber,
    ma20: calculateSMA(adjClosePrices, 20, priceIndex),
    ma60: calculateSMA(adjClosePrices, 60, priceIndex),
  };
}

/**
 * 잔여 티어 정보 생성
 * 백테스트 종료 시점에 아직 매도되지 않은 보유 주식 정보 (adjClose 기준 평가)
 */
export function createRemainingTiers(state: CycleState, currentPrice: number): RemainingTier[] {
  const price = new Decimal(currentPrice);

  return state.holdings
    .map((holding) => {
      const shares = new Decimal(holding.shares);
      const buyPrice = new Decimal(holding.buyPrice);
      const currentValue = shares.mul(price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      const cost = shares.mul(buyPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      const profitLoss = new Decimal(currentValue)
        .sub(cost)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
      const returnRate = price
        .sub(buyPrice)
        .div(buyPrice)
        .toDecimalPlaces(4, Decimal.ROUND_DOWN)
        .toNumber();

      return {
        tier: holding.tier,
        shares: holding.shares,
        buyPrice: holding.buyPrice,
        buyDate: holding.buyDate,
        currentPrice,
        currentValue,
        profitLoss,
        returnRate,
      };
    })
    .sort((a, b) => a.tier - b.tier);
}
