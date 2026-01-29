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
  StrategyConfig,
  StrategyName,
  TradeAction,
  OrderAction,
} from "./types";
import { getStrategy } from "./strategy";
import { CycleManager } from "./cycle";
import {
  calculateMDD,
  calculateWinRate,
  calculateTechnicalMetrics,
  calculateCAGR,
  calculateDailyMetrics,
} from "./metrics";
import type { DailyTechnicalMetrics } from "./types";
import {
  generateBuyOrder,
  handleSellOrders,
  handleStopLoss,
  createSnapshot,
  createRemainingTiers,
} from "./trading-utils";

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
   * @param prices - 가격 데이터 (날짜순 정렬, 과거 데이터 포함 가능)
   * @param backtestStartIndex - 백테스트 시작 인덱스 (과거 데이터는 지표 계산용)
   * @returns 백테스트 결과
   */
  run(
    request: BacktestRequest,
    prices: DailyPrice[],
    backtestStartIndex: number = 0
  ): BacktestResult {
    // 백테스트 시작 인덱스 유효성 검사
    if (
      !Number.isFinite(backtestStartIndex) ||
      !Number.isInteger(backtestStartIndex) ||
      backtestStartIndex < 0 ||
      backtestStartIndex >= prices.length
    ) {
      // 유효하지 않은 경우 0으로 폴백 (전체 기간 백테스트)
      backtestStartIndex = 0;
    }
    const effectiveStartIndex = backtestStartIndex;
    const backtestPricesCount = prices.length - effectiveStartIndex;

    if (backtestPricesCount < 2) {
      throw new Error("At least 2 days of price data required");
    }

    const cycleManager = new CycleManager(
      request.initialCapital,
      this.strategy,
      prices[effectiveStartIndex].date
    );

    const dailyHistory: DailySnapshot[] = [];
    let totalCycles = 1;
    const completedCycles: { profit: number }[] = [];
    let cycleCompletedToday = false; // 사이클 완료 플래그 (다음 날 새 사이클 시작)

    // SPEC-METRICS-001: adjClose 배열 생성 (기술적 지표 계산용 - 전체 데이터)
    const adjClosePrices = prices.map((p) => p.adjClose);

    // 백테스트 첫날 처리 (매수 불가 - 전일 종가 없음)
    const firstDaySnapshot = createSnapshot(
      prices[effectiveStartIndex],
      cycleManager,
      [],
      [],
      adjClosePrices,
      effectiveStartIndex
    );
    dailyHistory.push(firstDaySnapshot);

    // 백테스트 둘째 날부터 거래 시작
    for (let i = effectiveStartIndex + 1; i < prices.length; i++) {
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
      const { buyOrder: pendingBuyOrder, buyTrade: pendingBuyTrade } = generateBuyOrder(
        cycleManager,
        this.strategy,
        prevPrice.close,
        currentPrice.close
      );

      // 2. 손절 조건 확인 (REQ-006) - 오늘 손절 조건 충족한 티어
      // 손절 조건: 각 티어 매수일 기준으로 보유일 >= 손절일
      const tiersAtStopLoss = cycleManager.getTiersAtStopLossDay(i);

      // 3. 매도 주문 생성 (손절 티어 제외)
      // 손절 티어는 LOC 매도가 아닌 MOC 매도로 처리
      const stopLossTierNums = new Set(tiersAtStopLoss.map((t) => t.tier));
      const { sellTrades, sellOrders } = handleSellOrders(
        cycleManager,
        currentPrice.close,
        stopLossTierNums
      );
      trades.push(...sellTrades);
      orders.push(...sellOrders);

      // 4. 손절 처리 (REQ-006) - 당일 MOC 매도
      // 손절 조건 충족한 티어를 당일 종가에 MOC 매도
      if (tiersAtStopLoss.length > 0) {
        const stopLossTrades = handleStopLoss(cycleManager, tiersAtStopLoss, currentPrice.close);
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
      const snapshot = createSnapshot(
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

    // CAGR 계산 (백테스트 기간 기준)
    const backtestDays = prices.length - effectiveStartIndex;
    const cagr = calculateCAGR(request.initialCapital, finalAsset, backtestDays);

    // 잔여 티어 (미매도 보유 주식) 정보 생성
    const remainingTiers = createRemainingTiers(cycleManager, lastPrice.adjClose);

    // SPEC-METRICS-001: 종료 시점 기술적 지표 계산
    // 원본 사이트 방식: 백테스트 기간 내 거래일 수가 60일 미만이면 정배열(goldenCross) NaN
    // 지표 계산은 전체 데이터(과거 포함)를 사용하여 정확한 값 산출
    const technicalMetrics = calculateTechnicalMetrics(
      adjClosePrices,
      prices.length - 1,
      backtestDays
    );

    // 일별 기술적 지표 배열 생성 (차트용 - 백테스트 기간만)
    const dailyTechnicalMetrics: DailyTechnicalMetrics[] = [];
    for (let i = effectiveStartIndex; i < prices.length; i++) {
      dailyTechnicalMetrics.push(calculateDailyMetrics(adjClosePrices, i, prices[i].date));
    }

    return {
      strategy: request.strategy,
      startDate: request.startDate,
      endDate: request.endDate,
      initialCapital: request.initialCapital,
      finalAsset,
      returnRate: new Decimal(returnRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber(),
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
}
