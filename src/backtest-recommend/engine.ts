/**
 * 추천 전략 백테스트 엔진
 * 사이클 경계에서 전략을 동적으로 전환
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type {
  StrategyName,
  StrategyConfig,
  TradeAction,
  OrderAction,
  DailyTechnicalMetrics,
} from "@/backtest/types";
import { getStrategy } from "@/backtest/strategy";
import { CycleManager } from "@/backtest/cycle";
import {
  calculateMDD,
  calculateWinRate,
  calculateTechnicalMetrics,
  calculateCAGR,
  calculateDailyMetrics,
} from "@/backtest/metrics";
import {
  generateBuyOrder,
  handleSellOrders,
  handleStopLoss,
  createSnapshot,
  createRemainingTiers,
} from "@/backtest/trading-utils";

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

    // 첫날 처리 - 공유 유틸리티로 기본 스냅샷 생성 후 strategy 추가
    const firstDayBaseSnapshot = createSnapshot(
      prices[backtestStartIndex],
      cycleManager,
      [],
      [],
      adjClosePrices,
      backtestStartIndex
    );
    const firstDaySnapshot: DailySnapshotWithStrategy = {
      ...firstDayBaseSnapshot,
      strategy: this.currentStrategyName,
    };
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

        // 전략이 변경되었으면 업데이트 (cycles 카운트도 조정)
        if (todayStrategy !== this.currentStrategyName) {
          // 첫 매수 전이므로, 이전 전략의 cycles를 새 전략으로 이전
          strategyStats[this.currentStrategyName].cycles--;
          strategyStats[todayStrategy].cycles++;

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

      // === 매수/매도 로직 (공유 유틸리티 사용) ===

      // 1. 매수 주문 생성
      const { buyOrder, buyTrade } = generateBuyOrder(
        cycleManager,
        this.currentStrategy,
        prevPrice.close,
        currentPrice.close
      );

      // 2. 손절 조건 확인
      const tiersAtStopLoss = cycleManager.getTiersAtStopLossDay(i);
      const stopLossTierNums = new Set(tiersAtStopLoss.map((t) => t.tier));

      // 3. 매도 주문 생성
      const { sellTrades, sellOrders } = handleSellOrders(
        cycleManager,
        currentPrice.close,
        stopLossTierNums
      );
      trades.push(...sellTrades);
      orders.push(...sellOrders);

      // 4. 손절 처리
      if (tiersAtStopLoss.length > 0) {
        const stopLossTrades = handleStopLoss(cycleManager, tiersAtStopLoss, currentPrice.close);
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

      // 일별 스냅샷 생성 - 공유 유틸리티로 기본 스냅샷 생성 후 strategy 추가
      const baseSnapshot = createSnapshot(
        currentPrice,
        cycleManager,
        trades,
        orders,
        adjClosePrices,
        i
      );
      const snapshot: DailySnapshotWithStrategy = {
        ...baseSnapshot,
        strategy: this.currentStrategyName,
      };
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

      // 마지막 날에 사이클이 완료된 경우 endDate 설정
      if (cycleCompletedToday) {
        currentCycleInfo.endDate = prices[prices.length - 1].date;
      }

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
    const remainingTiers = createRemainingTiers(cycleManager, lastPrice.adjClose);

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
}
