/**
 * 추천 전략 백테스트 엔진
 * 사이클 경계에서 전략을 동적으로 전환
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type {
  StrategyName,
  StrategyConfig,
  TierState,
  TradeAction,
  OrderAction,
  RemainingTier,
  DailyTechnicalMetrics,
} from "@/backtest/types";
import { getStrategy } from "@/backtest/strategy";
import { CycleManager } from "@/backtest/cycle";
import {
  calculateBuyLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
} from "@/backtest/order";
import {
  calculateMDD,
  calculateWinRate,
  calculateSMA,
  calculateTechnicalMetrics,
  calculateCAGR,
  calculateDailyMetrics,
} from "@/backtest/metrics";

import type {
  RecommendBacktestRequest,
  RecommendBacktestResult,
  CycleStrategyInfo,
  DailySnapshotWithStrategy,
} from "./types";
import { getQuickRecommendation } from "./recommend-helper";

/**
 * 추천 전략 백테스트 엔진
 * 기존 BacktestEngine과 유사하지만 사이클 경계에서 전략을 동적으로 변경
 */
export class RecommendBacktestEngine {
  private currentStrategy: StrategyConfig;
  private currentStrategyName: StrategyName;
  private ticker: "SOXL" | "TQQQ";
  private allPrices: DailyPrice[];
  private dateToIndexMap: Map<string, number>;

  constructor(
    ticker: "SOXL" | "TQQQ",
    allPrices: DailyPrice[],
    dateToIndexMap: Map<string, number>
  ) {
    this.ticker = ticker;
    this.allPrices = allPrices;
    this.dateToIndexMap = dateToIndexMap;
    // 초기 전략은 run()에서 설정
    this.currentStrategyName = "Pro2";
    this.currentStrategy = getStrategy("Pro2");
  }

  /**
   * 추천 전략 백테스트 실행
   */
  run(request: RecommendBacktestRequest, backtestStartIndex: number): RecommendBacktestResult {
    const { initialCapital, startDate, endDate } = request;
    const prices = this.allPrices;

    // 유효성 검사
    const backtestPricesCount = prices.length - backtestStartIndex;
    if (backtestPricesCount < 2) {
      throw new Error("At least 2 days of price data required");
    }

    // 초기 전략 결정 (시작일 전날 종가 기준으로 추천)
    // 시작일에 주문을 넣으려면 전날까지의 데이터로 판단해야 함
    const initialRecommendDateIndex = backtestStartIndex - 1;
    const initialRecommend =
      initialRecommendDateIndex >= 0
        ? getQuickRecommendation(
            this.ticker,
            prices[initialRecommendDateIndex].date,
            this.allPrices,
            this.dateToIndexMap
          )
        : null;
    this.currentStrategyName = initialRecommend?.strategy ?? "Pro2";
    this.currentStrategy = getStrategy(this.currentStrategyName);
    const initialReason = initialRecommend?.reason ?? "기본 전략";

    // 사이클 매니저 생성
    const cycleManager = new CycleManager(
      initialCapital,
      this.currentStrategy,
      prices[backtestStartIndex].date
    );

    const dailyHistory: DailySnapshotWithStrategy[] = [];
    const cycleStrategies: CycleStrategyInfo[] = [];
    const completedCycles: { profit: number; strategy: StrategyName }[] = [];
    const adjClosePrices = prices.map((p) => p.adjClose);

    // 전략 통계
    const strategyStats = {
      Pro1: { cycles: 0, totalDays: 0 },
      Pro2: { cycles: 0, totalDays: 0 },
      Pro3: { cycles: 0, totalDays: 0 },
    };

    // 첫 번째 사이클 정보 생성
    let currentCycleInfo: CycleStrategyInfo = {
      cycleNumber: 1,
      strategy: this.currentStrategyName,
      startDate: prices[backtestStartIndex].date,
      endDate: null,
      initialCapital,
      finalAsset: null,
      returnRate: null,
      mdd: 0,
      startRsi: initialRecommend?.metrics.rsi14 ?? 0,
      isGoldenCross: initialRecommend?.metrics.isGoldenCross ?? false,
      recommendReason: initialReason,
    };
    cycleStrategies.push(currentCycleInfo);
    strategyStats[this.currentStrategyName].cycles++;

    // 사이클별 MDD 계산을 위한 변수
    let cyclePeak = initialCapital;
    let cycleMdd = 0;

    let cycleCompletedToday = false;

    // 첫날 처리
    const firstDaySnapshot = this.createSnapshot(
      prices[backtestStartIndex],
      cycleManager,
      [],
      [],
      adjClosePrices,
      backtestStartIndex,
      this.currentStrategyName
    );
    dailyHistory.push(firstDaySnapshot);
    strategyStats[this.currentStrategyName].totalDays++;

    // 둘째 날부터 거래 시작
    for (let i = backtestStartIndex + 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1];
      const currentPrice = prices[i];
      const trades: TradeAction[] = [];
      const orders: OrderAction[] = [];

      // 전날 사이클 완료 시 새 사이클 시작 + 전략 재결정
      if (cycleCompletedToday) {
        // 이전 사이클 종료 처리
        currentCycleInfo.endDate = prevPrice.date;
        currentCycleInfo.finalAsset = cycleManager.getCash();
        currentCycleInfo.returnRate =
          (currentCycleInfo.finalAsset - currentCycleInfo.initialCapital) /
          currentCycleInfo.initialCapital;
        currentCycleInfo.mdd = cycleMdd;

        // 새 전략 추천 받기 (전일 종가 기준)
        const newRecommend = getQuickRecommendation(
          this.ticker,
          prevPrice.date,
          this.allPrices,
          this.dateToIndexMap
        );
        const newStrategy = newRecommend?.strategy ?? "Pro2";
        const newReason = newRecommend?.reason ?? "기본 전략";

        // 전략 변경
        this.currentStrategyName = newStrategy;
        this.currentStrategy = getStrategy(newStrategy);

        // CycleManager의 strategy 업데이트
        cycleManager.setStrategy(this.currentStrategy);

        // 새 사이클 시작
        cycleManager.startNewCycle(currentPrice.date);

        // 새 사이클 MDD 초기화
        cyclePeak = cycleManager.getCycleInitialCapital();
        cycleMdd = 0;

        // 새 사이클 정보 생성
        currentCycleInfo = {
          cycleNumber: cycleManager.getCycleNumber(),
          strategy: this.currentStrategyName,
          startDate: currentPrice.date,
          endDate: null,
          initialCapital: cycleManager.getCycleInitialCapital(),
          finalAsset: null,
          returnRate: null,
          mdd: 0,
          startRsi: newRecommend?.metrics.rsi14 ?? 0,
          isGoldenCross: newRecommend?.metrics.isGoldenCross ?? false,
          recommendReason: newReason,
        };
        cycleStrategies.push(currentCycleInfo);
        strategyStats[this.currentStrategyName].cycles++;

        cycleCompletedToday = false;
      }

      // 첫 매수 전까지 매일 전략 재평가 (전일 종가 기준)
      // (사이클이 시작되었지만 아직 첫 매수가 일어나지 않은 경우)
      if (!cycleManager.hasTradedThisCycle()) {
        const todayRecommend = getQuickRecommendation(
          this.ticker,
          prevPrice.date,
          this.allPrices,
          this.dateToIndexMap
        );
        const todayStrategy = todayRecommend?.strategy ?? "Pro2";
        const todayReason = todayRecommend?.reason ?? "기본 전략";

        // 전략이 변경되었으면 업데이트
        if (todayStrategy !== this.currentStrategyName) {
          this.currentStrategyName = todayStrategy;
          this.currentStrategy = getStrategy(todayStrategy);
          cycleManager.setStrategy(this.currentStrategy);
        }

        // 현재 사이클 정보 업데이트 (아직 매수 전이므로)
        currentCycleInfo.strategy = this.currentStrategyName;
        currentCycleInfo.startDate = currentPrice.date;
        currentCycleInfo.startRsi = todayRecommend?.metrics.rsi14 ?? 0;
        currentCycleInfo.isGoldenCross = todayRecommend?.metrics.isGoldenCross ?? false;
        currentCycleInfo.recommendReason = todayReason;
      }

      strategyStats[this.currentStrategyName].totalDays++;

      // 경과 일수 증가
      if (cycleManager.getActiveTiers().length > 0) {
        cycleManager.incrementDay();
      }

      // === 매수/매도 로직 (기존 BacktestEngine과 동일) ===

      // 1. 매수 주문 생성
      const { buyOrder, buyTrade } = this.generateBuyOrder(
        cycleManager,
        prevPrice.close,
        currentPrice.close
      );

      // 2. 손절 조건 확인
      const tiersAtStopLoss = cycleManager.getTiersAtStopLossDay(i);
      const stopLossTierNums = new Set(tiersAtStopLoss.map((t) => t.tier));

      // 3. 매도 주문 생성
      const { sellTrades, sellOrders } = this.handleSellOrders(
        cycleManager,
        currentPrice.close,
        stopLossTierNums
      );
      trades.push(...sellTrades);
      orders.push(...sellOrders);

      // 4. 손절 처리
      if (tiersAtStopLoss.length > 0) {
        const stopLossTrades = this.handleStopLoss(
          cycleManager,
          tiersAtStopLoss,
          currentPrice.close
        );
        trades.push(...stopLossTrades);
      }

      // 5. 매수 처리
      if (buyOrder) {
        orders.push(buyOrder);
        if (buyTrade) {
          cycleManager.activateTier(
            buyTrade.tier,
            buyTrade.price,
            buyTrade.shares,
            currentPrice.date,
            i
          );
          trades.push(buyTrade);
        }
      }

      // 6. 사이클 완료 체크
      if (cycleManager.isCycleComplete()) {
        const cycleProfit = cycleManager.getCash() - cycleManager.getCycleInitialCapital();
        completedCycles.push({
          profit: cycleProfit,
          strategy: this.currentStrategyName,
        });
        cycleManager.endCycle();
        cycleCompletedToday = true;
      }

      // 일별 스냅샷 생성
      const snapshot = this.createSnapshot(
        currentPrice,
        cycleManager,
        trades,
        orders,
        adjClosePrices,
        i,
        this.currentStrategyName
      );
      dailyHistory.push(snapshot);

      // 사이클 MDD 업데이트
      if (snapshot.totalAsset > cyclePeak) {
        cyclePeak = snapshot.totalAsset;
      }
      const drawdown = (snapshot.totalAsset - cyclePeak) / cyclePeak;
      if (drawdown < cycleMdd) {
        cycleMdd = drawdown;
      }
    }

    // 마지막 사이클 정보 업데이트 (진행 중인 경우)
    if (currentCycleInfo.endDate === null) {
      const lastSnapshot = dailyHistory[dailyHistory.length - 1];
      currentCycleInfo.finalAsset = lastSnapshot.totalAsset;
      currentCycleInfo.returnRate =
        (currentCycleInfo.finalAsset - currentCycleInfo.initialCapital) /
        currentCycleInfo.initialCapital;
      currentCycleInfo.mdd = cycleMdd;
    }

    // 결과 계산
    const lastSnapshot = dailyHistory[dailyHistory.length - 1];
    const lastPrice = prices[prices.length - 1];
    const finalAsset = lastSnapshot.totalAsset;
    const returnRate = (finalAsset - initialCapital) / initialCapital;
    const mdd = calculateMDD(dailyHistory);
    const winRate = calculateWinRate(completedCycles);
    const backtestDays = prices.length - backtestStartIndex;
    const cagr = calculateCAGR(initialCapital, finalAsset, backtestDays);

    // 잔여 티어
    const remainingTiers = this.createRemainingTiers(cycleManager, lastPrice.adjClose);

    // 기술적 지표
    const technicalMetrics = calculateTechnicalMetrics(
      adjClosePrices,
      prices.length - 1,
      backtestDays
    );

    // 일별 기술적 지표
    const dailyTechnicalMetrics: DailyTechnicalMetrics[] = [];
    for (let i = backtestStartIndex; i < prices.length; i++) {
      dailyTechnicalMetrics.push(calculateDailyMetrics(adjClosePrices, i, prices[i].date));
    }

    return {
      startDate,
      endDate,
      initialCapital,
      finalAsset,
      returnRate: new Decimal(returnRate).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber(),
      cagr,
      mdd,
      totalCycles: cycleStrategies.length,
      winRate,
      cycleStrategies,
      dailyHistory,
      remainingTiers,
      completedCycles,
      technicalMetrics,
      dailyTechnicalMetrics,
      strategyStats,
    };
  }

  /**
   * 매수 주문 생성
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

    const buyLimitPrice = calculateBuyLimitPrice(prevClose, this.currentStrategy.buyThreshold);
    const tierAmount = cycleManager.getTierAmount(nextTier);
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
   * 매도 주문 처리
   */
  private handleSellOrders(
    cycleManager: CycleManager,
    currentClose: number,
    excludeTiers: Set<number> = new Set()
  ): { sellTrades: TradeAction[]; sellOrders: OrderAction[] } {
    const sellTrades: TradeAction[] = [];
    const sellOrders: OrderAction[] = [];
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
   * 손절 처리
   */
  private handleStopLoss(
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
   * 일별 스냅샷 생성
   */
  private createSnapshot(
    price: DailyPrice,
    cycleManager: CycleManager,
    trades: TradeAction[],
    orders: OrderAction[] = [],
    adjClosePrices: number[] = [],
    priceIndex: number = 0,
    strategy: StrategyName
  ): DailySnapshotWithStrategy {
    const activeTiers = cycleManager.getActiveTiers();
    let holdingsValue = new Decimal(0);
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
      strategy,
    };
  }

  /**
   * 잔여 티어 정보 생성
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
