/**
 * 공유 트레이딩 유틸리티 함수
 * BacktestEngine과 RecommendBacktestEngine에서 공통으로 사용
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type {
  StrategyConfig,
  TierState,
  TradeAction,
  OrderAction,
  RemainingTier,
  DailySnapshot,
} from "./types";
import type { CycleManager } from "./cycle";
import {
  calculateBuyLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
} from "./order";
import { calculateSMA } from "./metrics";

/**
 * 매수 주문 생성 결과
 */
export interface BuyOrderResult {
  buyTrade: TradeAction | null;
  buyOrder: OrderAction | null;
}

/**
 * 매도 주문 처리 결과
 */
export interface SellOrderResult {
  sellTrades: TradeAction[];
  sellOrders: OrderAction[];
}

/**
 * REQ-002, REQ-003: LOC 매수 주문 생성
 * 매도 체결 전 상태를 기준으로 다음 매수 티어를 결정
 * 티어 활성화는 호출자가 별도로 처리해야 함
 *
 * @param cycleManager - 사이클 매니저
 * @param strategy - 전략 설정 (buyThreshold 사용)
 * @param prevClose - 전일 종가
 * @param currentClose - 현재 종가
 * @returns 매수 주문 및 거래 결과
 */
export function generateBuyOrder(
  cycleManager: CycleManager,
  strategy: StrategyConfig,
  prevClose: number,
  currentClose: number
): BuyOrderResult {
  const nextTier = cycleManager.getNextBuyTier();
  if (nextTier === null) {
    return { buyTrade: null, buyOrder: null };
  }

  const buyLimitPrice = calculateBuyLimitPrice(prevClose, strategy.buyThreshold);
  const tierAmount = cycleManager.getTierAmount(nextTier);
  // REQ-002: 매수 수량 = floor(티어 금액 ÷ 매수 지정가, 정수)
  const shares = calculateBuyQuantity(tierAmount, buyLimitPrice);

  if (shares === 0) {
    return { buyTrade: null, buyOrder: null };
  }

  // 현금이 충분한지 확인 (손절로 인해 현금이 줄어든 경우 대비)
  const estimatedCost = new Decimal(currentClose).mul(shares);
  if (estimatedCost.gt(cycleManager.getCash())) {
    return { buyTrade: null, buyOrder: null };
  }

  const orderAmount = new Decimal(buyLimitPrice)
    .mul(shares)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
  const executed = shouldExecuteBuy(currentClose, buyLimitPrice);

  if (executed) {
    // 체결됨 - 티어 활성화는 호출자가 처리
    const executedAmount = new Decimal(currentClose)
      .mul(shares)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();

    const buyTrade: TradeAction = {
      type: "BUY",
      tier: nextTier,
      price: currentClose,
      shares,
      amount: executedAmount,
      orderType: "LOC",
    };

    const buyOrder: OrderAction = {
      type: "BUY",
      tier: nextTier,
      limitPrice: buyLimitPrice,
      shares,
      amount: orderAmount,
      orderType: "LOC",
      executed: true,
      executedPrice: currentClose,
      executedAmount,
    };

    return { buyTrade, buyOrder };
  } else {
    // 미체결
    const buyOrder: OrderAction = {
      type: "BUY",
      tier: nextTier,
      limitPrice: buyLimitPrice,
      shares,
      amount: orderAmount,
      orderType: "LOC",
      executed: false,
      reason: `종가 ${currentClose} > 매수지정가 ${buyLimitPrice}`,
    };

    return { buyTrade: null, buyOrder };
  }
}

/**
 * REQ-005: LOC 매도 주문 처리
 * 모든 활성 티어에 대해 매도 주문을 생성하고 체결 여부를 확인
 *
 * @param cycleManager - 사이클 매니저
 * @param currentClose - 현재 종가
 * @param excludeTiers - 손절 예정으로 LOC 매도에서 제외할 티어 번호 집합
 * @returns 매도 거래 및 주문 결과
 */
export function handleSellOrders(
  cycleManager: CycleManager,
  currentClose: number,
  excludeTiers: Set<number> = new Set()
): SellOrderResult {
  const sellTrades: TradeAction[] = [];
  const sellOrders: OrderAction[] = [];
  // 손절 예정 티어는 제외
  const activeTiers = [...cycleManager.getActiveTiers()].filter((t) => !excludeTiers.has(t.tier));
  const closePrice = new Decimal(currentClose);

  for (const tier of activeTiers) {
    const limitPrice = tier.sellLimitPrice;
    const orderAmount = new Decimal(limitPrice)
      .mul(tier.shares)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
    const executed = shouldExecuteSell(currentClose, limitPrice);

    if (executed) {
      // 체결됨
      cycleManager.deactivateTier(tier.tier, currentClose);
      const executedAmount = closePrice
        .mul(tier.shares)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();

      sellTrades.push({
        type: "SELL",
        tier: tier.tier,
        price: currentClose,
        shares: tier.shares,
        amount: executedAmount,
        orderType: "LOC",
      });

      sellOrders.push({
        type: "SELL",
        tier: tier.tier,
        limitPrice,
        shares: tier.shares,
        amount: orderAmount,
        orderType: "LOC",
        executed: true,
        executedPrice: currentClose,
        executedAmount,
      });
    } else {
      // 미체결
      sellOrders.push({
        type: "SELL",
        tier: tier.tier,
        limitPrice,
        shares: tier.shares,
        amount: orderAmount,
        orderType: "LOC",
        executed: false,
        reason: `종가 ${currentClose} < 매도지정가 ${limitPrice}`,
      });
    }
  }

  return { sellTrades, sellOrders };
}

/**
 * REQ-006: 특정 티어들에 대한 손절일 MOC 매도 처리
 * 각 티어의 매수일 기준으로 손절일에 도달한 티어만 처리
 *
 * @param cycleManager - 사이클 매니저
 * @param tiersToStopLoss - 손절할 티어 상태 배열
 * @param currentClose - 현재 종가
 * @returns 손절 거래 배열
 */
export function handleStopLoss(
  cycleManager: CycleManager,
  tiersToStopLoss: TierState[],
  currentClose: number
): TradeAction[] {
  const trades: TradeAction[] = [];
  const closePrice = new Decimal(currentClose);

  for (const tier of tiersToStopLoss) {
    cycleManager.deactivateTier(tier.tier, currentClose);
    const amount = closePrice.mul(tier.shares).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    trades.push({
      type: "STOP_LOSS",
      tier: tier.tier,
      price: currentClose,
      shares: tier.shares,
      amount,
      orderType: "MOC",
    });
  }

  return trades;
}

/**
 * 일별 스냅샷 생성
 * 보유 자산 평가는 adjClose(수정종가)를 사용하여 배당/분할이 반영된 실제 수익률을 계산
 * SPEC-METRICS-001: MA20, MA60 계산 추가
 *
 * @param price - 당일 가격 데이터
 * @param cycleManager - 사이클 매니저
 * @param trades - 당일 거래 배열
 * @param orders - 당일 주문 배열
 * @param adjClosePrices - 수정 종가 배열 (MA 계산용)
 * @param priceIndex - 현재 가격 인덱스
 * @returns 일별 스냅샷
 */
export function createSnapshot(
  price: DailyPrice,
  cycleManager: CycleManager,
  trades: TradeAction[],
  orders: OrderAction[] = [],
  adjClosePrices: number[] = [],
  priceIndex: number = 0
): DailySnapshot {
  const activeTiers = cycleManager.getActiveTiers();
  let holdingsValue = new Decimal(0);
  let totalShares = 0;
  // 보유 자산 평가: adjClose(수정종가) 사용 - 배당/분할 반영된 실제 투자 성과
  const adjClosePrice = new Decimal(price.adjClose);
  for (const tier of activeTiers) {
    holdingsValue = holdingsValue.add(adjClosePrice.mul(tier.shares));
    totalShares += tier.shares;
  }

  const cash = cycleManager.getCash();
  const holdingsValueNum = holdingsValue.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const totalAsset = new Decimal(cash)
    .add(holdingsValue)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // SPEC-METRICS-001: MA20, MA60 계산
  const ma20 = calculateSMA(adjClosePrices, 20, priceIndex);
  const ma60 = calculateSMA(adjClosePrices, 60, priceIndex);

  return {
    date: price.date,
    open: price.open,
    high: price.high,
    low: price.low,
    close: price.close,
    adjClose: price.adjClose,
    cash,
    holdingsValue: holdingsValueNum,
    totalAsset,
    trades,
    orders,
    activeTiers: activeTiers.length,
    totalShares,
    cycleNumber: cycleManager.getCycleNumber(),
    ma20,
    ma60,
  };
}

/**
 * 잔여 티어 정보 생성
 * 백테스트 종료 시점에 아직 매도되지 않은 보유 주식 정보
 *
 * @param cycleManager - 사이클 매니저
 * @param currentPrice - 백테스트 종료일 종가
 * @returns 잔여 티어 정보 배열
 */
export function createRemainingTiers(
  cycleManager: CycleManager,
  currentPrice: number
): RemainingTier[] {
  const activeTiers = cycleManager.getActiveTiers();
  const price = new Decimal(currentPrice);

  return activeTiers.map((tier) => {
    const shares = new Decimal(tier.shares);
    const buyPrice = new Decimal(tier.buyPrice);
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
      tier: tier.tier,
      shares: tier.shares,
      buyPrice: tier.buyPrice,
      buyDate: tier.buyDate,
      currentPrice,
      currentValue,
      profitLoss,
      returnRate,
    };
  });
}
