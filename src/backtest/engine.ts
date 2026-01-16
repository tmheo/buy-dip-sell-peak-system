/**
 * 백테스트 엔진 메인 클래스
 * SPEC-BACKTEST-001
 */
import type { DailyPrice } from "@/types";
import type {
  BacktestRequest,
  BacktestResult,
  DailySnapshot,
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
  floorToDecimal,
} from "./order";

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

    // 첫날 처리 (매수 불가 - 전일 종가 없음)
    const firstDaySnapshot = this.createSnapshot(prices[0], cycleManager, []);
    dailyHistory.push(firstDaySnapshot);

    // 둘째 날부터 거래 시작
    for (let i = 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1];
      const currentPrice = prices[i];
      const trades: TradeAction[] = [];

      // 경과 일수 증가 (활성 티어가 있는 경우에만)
      if (cycleManager.getActiveTiers().length > 0) {
        cycleManager.incrementDay();
      }

      // 1. 손절 처리 (REQ-006) - 각 티어별 매수 거래일 기준으로 손절일 도달 여부 확인
      const tiersAtStopLoss = cycleManager.getTiersAtStopLossDay(i);
      if (tiersAtStopLoss.length > 0) {
        const stopLossTrades = this.handleStopLossForTiers(
          cycleManager,
          tiersAtStopLoss,
          currentPrice.close
        );
        trades.push(...stopLossTrades);
      }

      // 2. 매도 처리 (REQ-005)
      const sellTrades = this.handleSellOrders(cycleManager, currentPrice.close);
      trades.push(...sellTrades);

      // 3. 사이클 완료 체크 및 새 사이클 시작 (REQ-007)
      if (cycleManager.isCycleComplete()) {
        const cycleProfit = cycleManager.getCash() - cycleManager.getCycleInitialCapital();
        completedCycles.push({ profit: cycleProfit });
        cycleManager.endCycle();
        cycleManager.startNewCycle(currentPrice.date);
        totalCycles++;
      }

      // 4. 매수 처리 (REQ-002, REQ-003)
      const buyTrade = this.handleBuyOrder(
        cycleManager,
        prevPrice.close,
        currentPrice.close,
        currentPrice.date,
        i
      );
      if (buyTrade) {
        trades.push(buyTrade);
      }

      // 일별 스냅샷 생성
      const snapshot = this.createSnapshot(currentPrice, cycleManager, trades);
      dailyHistory.push(snapshot);
    }

    // 결과 계산
    const lastSnapshot = dailyHistory[dailyHistory.length - 1];
    const finalAsset = lastSnapshot.totalAsset;
    const returnRate = (finalAsset - request.initialCapital) / request.initialCapital;
    const mdd = this.calculateMDD(dailyHistory);
    const winRate = this.calculateWinRate(completedCycles);

    return {
      strategy: request.strategy,
      startDate: request.startDate,
      endDate: request.endDate,
      initialCapital: request.initialCapital,
      finalAsset,
      returnRate: floorToDecimal(returnRate, 4),
      mdd,
      totalCycles,
      winRate,
      dailyHistory,
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

    for (const tier of tiersToStopLoss) {
      cycleManager.deactivateTier(tier.tier, currentClose);
      trades.push({
        type: "STOP_LOSS",
        tier: tier.tier,
        price: currentClose,
        shares: tier.shares,
        amount: currentClose * tier.shares,
        orderType: "MOC",
      });
    }

    return trades;
  }

  /**
   * REQ-005: LOC 매도 주문 처리
   */
  private handleSellOrders(cycleManager: CycleManager, currentClose: number): TradeAction[] {
    const trades: TradeAction[] = [];
    const activeTiers = [...cycleManager.getActiveTiers()]; // 복사본 사용

    for (const tier of activeTiers) {
      if (shouldExecuteSell(currentClose, tier.sellLimitPrice)) {
        cycleManager.deactivateTier(tier.tier, currentClose);
        trades.push({
          type: "SELL",
          tier: tier.tier,
          price: currentClose,
          shares: tier.shares,
          amount: currentClose * tier.shares,
          orderType: "LOC",
        });
      }
    }

    return trades;
  }

  /**
   * REQ-002, REQ-003: LOC 매수 주문 처리
   */
  private handleBuyOrder(
    cycleManager: CycleManager,
    prevClose: number,
    currentClose: number,
    date: string,
    dayIndex: number
  ): TradeAction | null {
    const nextTier = cycleManager.getNextBuyTier();
    if (nextTier === null) {
      return null;
    }

    const buyLimitPrice = calculateBuyLimitPrice(prevClose, this.strategy.buyThreshold);

    if (!shouldExecuteBuy(currentClose, buyLimitPrice)) {
      return null;
    }

    const tierAmount = cycleManager.getTierAmount(nextTier);
    // REQ-002: 매수 수량 = floor(티어 금액 ÷ 매수 지정가, 정수)
    const shares = calculateBuyQuantity(tierAmount, buyLimitPrice);

    if (shares === 0) {
      return null;
    }

    cycleManager.activateTier(nextTier, currentClose, shares, date, dayIndex);

    return {
      type: "BUY",
      tier: nextTier,
      price: currentClose,
      shares,
      amount: currentClose * shares,
      orderType: "LOC",
    };
  }

  /**
   * 일별 스냅샷 생성
   */
  private createSnapshot(
    price: DailyPrice,
    cycleManager: CycleManager,
    trades: TradeAction[]
  ): DailySnapshot {
    const activeTiers = cycleManager.getActiveTiers();
    let holdingsValue = 0;
    for (const tier of activeTiers) {
      holdingsValue += tier.shares * price.close;
    }

    const cash = cycleManager.getCash();
    const totalAsset = floorToDecimal(cash + holdingsValue, 2);

    return {
      date: price.date,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      cash,
      holdingsValue: floorToDecimal(holdingsValue, 2),
      totalAsset,
      trades,
      activeTiers: activeTiers.length,
      cycleNumber: cycleManager.getCycleNumber(),
    };
  }

  /**
   * REQ-009: MDD (Maximum Drawdown) 계산
   */
  private calculateMDD(history: DailySnapshot[]): number {
    if (history.length === 0) return 0;

    let peak = history[0].totalAsset;
    let maxDrawdown = 0;

    for (const snapshot of history) {
      if (snapshot.totalAsset > peak) {
        peak = snapshot.totalAsset;
      }
      const drawdown = (peak - snapshot.totalAsset) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return floorToDecimal(-maxDrawdown, 4); // 음수로 반환
  }

  /**
   * REQ-009: 승률 계산
   */
  private calculateWinRate(cycles: { profit: number }[]): number {
    if (cycles.length === 0) return 0;

    const wins = cycles.filter((c) => c.profit > 0).length;
    return floorToDecimal(wins / cycles.length, 4);
  }
}
