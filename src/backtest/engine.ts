/**
 * 백테스트 엔진 메인 클래스
 * SPEC-BACKTEST-001
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type {
  BacktestRequest,
  BacktestResult,
  DailySnapshot,
  OrderAction,
  RemainingTier,
  StrategyConfig,
  StrategyName,
  TierState,
  TradeAction,
} from "./types";
import { getStrategy } from "./strategy";
import { CycleManager } from "./cycle";
import {
  calculateBuyLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
} from "./order";
import {
  calculateMDD,
  calculateWinRate,
  calculateSMA,
  calculateTechnicalMetrics,
  calculateCAGR,
  calculateDailyMetrics,
} from "./metrics";
import type { DailyTechnicalMetrics } from "./types";

/**
 * 백테스트 엔진
 * 가격 데이터와 전략을 기반으로 백테스트를 수행
 */
export class BacktestEngine {
  private strategy: StrategyConfig;

  /**
   * 백테스트 엔진 생성
   *
   * @param strategyName - 전략 이름
   */
  constructor(strategyName: StrategyName) {
    this.strategy = getStrategy(strategyName);
  }

  /**
   * 백테스트 실행
   *
   * @param request - 백테스트 요청
   * @param prices - 가격 데이터 (날짜순 정렬)
   * @returns 백테스트 결과
   */
  run(request: BacktestRequest, prices: DailyPrice[]): BacktestResult {
    if (prices.length < 2) {
      throw new Error("At least 2 days of price data required");
    }

    const cycleManager = new CycleManager(request.initialCapital, this.strategy, prices[0].date);

    const dailyHistory: DailySnapshot[] = [];
    let totalCycles = 1;
    const completedCycles: { profit: number }[] = [];
    let cycleCompletedToday = false; // 사이클 완료 플래그 (다음 날 새 사이클 시작)

    // SPEC-METRICS-001: adjClose 배열 생성 (기술적 지표 계산용)
    const adjClosePrices = prices.map((p) => p.adjClose);

    // 첫날 처리 (매수 불가 - 전일 종가 없음)
    const firstDaySnapshot = this.createSnapshot(
      prices[0],
      cycleManager,
      [],
      [],
      adjClosePrices,
      0
    );
    dailyHistory.push(firstDaySnapshot);

    // 둘째 날부터 거래 시작
    for (let i = 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1];
      const currentPrice = prices[i];
      const trades: TradeAction[] = [];
      const orders: OrderAction[] = [];

      // 전날 사이클이 완료되었으면 오늘 새 사이클 시작
      if (cycleCompletedToday) {
        cycleManager.startNewCycle(currentPrice.date);
        totalCycles++;
        cycleCompletedToday = false;
      }

      // 경과 일수 증가 (활성 티어가 있는 경우에만)
      if (cycleManager.getActiveTiers().length > 0) {
        cycleManager.incrementDay();
      }

      // ============================================================
      // 주문 생성 순서가 매우 중요합니다!
      // 모든 주문(매수/매도)은 장 마감 전에 "동시에" 제출됩니다.
      // 따라서 주문 생성 시점에는 아직 아무것도 체결되지 않은 상태입니다.
      // 손절(MOC)도 마찬가지로 장 마감에 체결되므로, 주문 생성 전에 처리하면 안 됩니다.
      // ============================================================

      // 1. 매수 주문 생성 (손절/매도 처리 전 상태 기준)
      // 중요: 매수 티어는 현재 보유 상태를 기준으로 결정해야 함
      // 손절이나 매도로 티어가 비워지기 전에 매수 주문을 생성해야 올바른 티어가 결정됨
      // 매수/매도 체결: close(종가) 사용 - 실제 거래 시 지불하는 가격
      // 수익률 계산: adjClose(수정종가) 사용 - 배당/분할 반영한 실제 투자 성과
      const { buyOrder: pendingBuyOrder, buyTrade: pendingBuyTrade } = this.generateBuyOrder(
        cycleManager,
        prevPrice.close,
        currentPrice.close
      );

      // 2. 손절 조건 확인 (REQ-006) - 오늘 손절 조건 충족한 티어
      // 손절 조건: 각 티어 매수일 기준으로 보유일 >= 손절일
      const tiersAtStopLoss = cycleManager.getTiersAtStopLossDay(i);

      // 3. 매도 주문 생성 (손절 티어 제외)
      // 손절 티어는 LOC 매도가 아닌 MOC 매도로 처리
      const stopLossTierNums = new Set(tiersAtStopLoss.map((t) => t.tier));
      const { sellTrades, sellOrders } = this.handleSellOrdersWithTracking(
        cycleManager,
        currentPrice.close,
        stopLossTierNums
      );
      trades.push(...sellTrades);
      orders.push(...sellOrders);

      // 4. 손절 처리 (REQ-006) - 당일 MOC 매도
      // 손절 조건 충족한 티어를 당일 종가에 MOC 매도
      if (tiersAtStopLoss.length > 0) {
        const stopLossTrades = this.handleStopLossForTiers(
          cycleManager,
          tiersAtStopLoss,
          currentPrice.close
        );
        trades.push(...stopLossTrades);
      }

      // 5. 매수 주문 추가 및 체결 처리 (REQ-002, REQ-003)
      // 중요: 매수 주문은 손절/매도와 "동시에" 제출되므로, 손절로 티어가 비워져도
      // 이미 생성된 매수 주문이 체결되면 사이클이 계속됩니다.
      // 티어 고정 방식: 매수 주문은 손절/매도 전 상태 기준으로 이미 티어가 결정됨
      if (pendingBuyOrder) {
        orders.push(pendingBuyOrder);
        // 체결된 경우 티어 활성화
        if (pendingBuyTrade) {
          cycleManager.activateTier(
            pendingBuyTrade.tier,
            pendingBuyTrade.price,
            pendingBuyTrade.shares,
            currentPrice.date,
            i
          );
          trades.push(pendingBuyTrade);
        }
      }

      // 6. 사이클 완료 체크 (REQ-007) - 다음 날 새 사이클 시작
      // 중요: 매수 처리 후에 체크해야 손절 + 매수가 동시에 발생한 경우를 올바르게 처리
      if (cycleManager.isCycleComplete()) {
        const cycleProfit = cycleManager.getCash() - cycleManager.getCycleInitialCapital();
        completedCycles.push({ profit: cycleProfit });
        cycleManager.endCycle();
        cycleCompletedToday = true; // 다음 날 새 사이클 시작
      }

      // 일별 스냅샷 생성 (SPEC-METRICS-001: MA 계산용 데이터 전달)
      const snapshot = this.createSnapshot(
        currentPrice,
        cycleManager,
        trades,
        orders,
        adjClosePrices,
        i
      );
      dailyHistory.push(snapshot);
    }

    // 결과 계산
    const lastSnapshot = dailyHistory[dailyHistory.length - 1];
    const lastPrice = prices[prices.length - 1];
    const finalAsset = lastSnapshot.totalAsset;
    const returnRate = (finalAsset - request.initialCapital) / request.initialCapital;
    const mdd = calculateMDD(dailyHistory);
    const winRate = calculateWinRate(completedCycles);

    // CAGR 계산
    const cagr = calculateCAGR(request.initialCapital, finalAsset, prices.length);

    // 잔여 티어 (미매도 보유 주식) 정보 생성
    const remainingTiers = this.createRemainingTiers(cycleManager, lastPrice.adjClose);

    // SPEC-METRICS-001: 종료 시점 기술적 지표 계산
    // 원본 사이트 방식: 백테스트 기간 내 거래일 수가 60일 미만이면 정배열(goldenCross) NaN
    const backtestDays = prices.length;
    const technicalMetrics = calculateTechnicalMetrics(
      adjClosePrices,
      prices.length - 1,
      backtestDays
    );

    // 일별 기술적 지표 배열 생성 (차트용)
    const dailyTechnicalMetrics: DailyTechnicalMetrics[] = prices.map((price, index) => {
      return calculateDailyMetrics(adjClosePrices, index, price.date);
    });

    return {
      strategy: request.strategy,
      startDate: request.startDate,
      endDate: request.endDate,
      initialCapital: request.initialCapital,
      finalAsset,
      returnRate: new Decimal(returnRate).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber(),
      cagr,
      mdd,
      totalCycles,
      winRate,
      dailyHistory,
      remainingTiers,
      completedCycles,
      technicalMetrics,
      dailyTechnicalMetrics,
    };
  }

  /**
   * REQ-006: 특정 티어들에 대한 손절일 MOC 매도 처리
   * 각 티어의 매수일 기준으로 손절일에 도달한 티어만 처리
   */
  private handleStopLossForTiers(
    cycleManager: CycleManager,
    tiersToStopLoss: TierState[],
    currentClose: number
  ): TradeAction[] {
    const trades: TradeAction[] = [];
    const closePrice = new Decimal(currentClose);

    for (const tier of tiersToStopLoss) {
      cycleManager.deactivateTier(tier.tier, currentClose);
      const amount = closePrice
        .mul(tier.shares)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
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
   * REQ-005: LOC 매도 주문 처리 (주문 추적 포함)
   * 모든 활성 티어에 대해 매도 주문을 생성하고 체결 여부를 확인
   *
   * @param cycleManager - 사이클 매니저
   * @param currentClose - 현재 종가
   * @param excludeTiers - 손절 예정으로 LOC 매도에서 제외할 티어 번호 집합
   */
  private handleSellOrdersWithTracking(
    cycleManager: CycleManager,
    currentClose: number,
    excludeTiers: Set<number> = new Set()
  ): { sellTrades: TradeAction[]; sellOrders: OrderAction[] } {
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
   * REQ-002, REQ-003: LOC 매수 주문 생성 (체결 처리 없이 주문만 생성)
   * 중요: 매도 체결 전 상태를 기준으로 다음 매수 티어를 결정
   * 티어 활성화는 호출자가 별도로 처리해야 함
   */
  private generateBuyOrder(
    cycleManager: CycleManager,
    prevClose: number,
    currentClose: number
  ): { buyTrade: TradeAction | null; buyOrder: OrderAction | null } {
    const nextTier = cycleManager.getNextBuyTier();
    if (nextTier === null) {
      return { buyTrade: null, buyOrder: null };
    }

    const buyLimitPrice = calculateBuyLimitPrice(prevClose, this.strategy.buyThreshold);
    const tierAmount = cycleManager.getTierAmount(nextTier);
    // REQ-002: 매수 수량 = floor(티어 금액 ÷ 매수 지정가, 정수)
    const shares = calculateBuyQuantity(tierAmount, buyLimitPrice);

    if (shares === 0) {
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
   * 일별 스냅샷 생성
   * 보유 자산 평가는 adjClose(수정종가)를 사용하여 배당/분할이 반영된 실제 수익률을 계산
   * SPEC-METRICS-001: MA20, MA60 계산 추가
   */
  private createSnapshot(
    price: DailyPrice,
    cycleManager: CycleManager,
    trades: TradeAction[],
    orders: OrderAction[] = [],
    adjClosePrices: number[] = [],
    priceIndex: number = 0
  ): DailySnapshot {
    const activeTiers = cycleManager.getActiveTiers();
    let holdingsValue = new Decimal(0);
    // 보유 자산 평가: adjClose(수정종가) 사용 - 배당/분할 반영된 실제 투자 성과
    const adjClosePrice = new Decimal(price.adjClose);
    for (const tier of activeTiers) {
      holdingsValue = holdingsValue.add(adjClosePrice.mul(tier.shares));
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
  private createRemainingTiers(cycleManager: CycleManager, currentPrice: number): RemainingTier[] {
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
}
