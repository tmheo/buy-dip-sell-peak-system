/**
 * 추천 전략 백테스트 엔진
 * 사이클 경계에서 전략을 동적으로 전환
 *
 * #48: 하루 루프는 src/strategy의 planOrders + settle 합성이다 (BacktestEngine과 동일).
 * 이 엔진은 가격 공급, 사이클 자본 복리 이월, 사이클 경계의 전략 재추천,
 * 스냅샷·지표 계산만 담당한다. 가격은 adjClose 하나로 통일한다 (#43).
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type { DailyTechnicalMetrics } from "@/backtest/types";
import type { SimilarityConfig } from "@/recommend/types";
import type { Strategy } from "@/types/trading";
import type { CycleState, StrategyParams } from "@/strategy";
import { getStrategyParams, planOrders, settle, startNextCycle } from "@/strategy";
import {
  cashBalance,
  createRemainingTiers,
  createSnapshot,
  toOrderActions,
  toTradeActions,
} from "@/backtest/snapshot";
import {
  calculateMDD,
  calculateWinRate,
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
import { getQuickRecommendation, type QuickRecommendationOptions } from "./recommend-helper";

/** RecommendBacktestEngine 옵션 */
export interface RecommendBacktestEngineOptions {
  /**
   * 커스텀 유사도 설정 (가중치·허용오차)
   * 지정하면 추천 캐시(메모리·DB)를 전부 우회해 기본 설정의 결과와 섞이지 않는다
   */
  similarityConfig?: SimilarityConfig;
}

/**
 * 추천 전략 백테스트 엔진
 * 기존 BacktestEngine과 유사하지만 사이클 경계에서 전략을 동적으로 변경
 */
export class RecommendBacktestEngine {
  private currentStrategy: StrategyParams;
  private currentStrategyName: Strategy;
  private ticker: "SOXL" | "TQQQ";
  private allPrices: DailyPrice[];
  private dateToIndexMap: Map<string, number>;
  private recommendOptions: QuickRecommendationOptions;

  constructor(
    ticker: "SOXL" | "TQQQ",
    allPrices: DailyPrice[],
    dateToIndexMap: Map<string, number>,
    options: RecommendBacktestEngineOptions = {}
  ) {
    this.ticker = ticker;
    this.allPrices = allPrices;
    this.dateToIndexMap = dateToIndexMap;
    // 초기 전략은 run()에서 설정
    this.currentStrategyName = "Pro2";
    this.currentStrategy = getStrategyParams("Pro2");
    // 캐시 사용 여부는 커스텀 유사도 설정의 유무로 helper가 스스로 결정한다
    this.recommendOptions = { similarityConfig: options.similarityConfig };
  }

  /**
   * 추천 전략 백테스트 실행
   */
  async run(
    request: RecommendBacktestRequest,
    backtestStartIndex: number
  ): Promise<RecommendBacktestResult> {
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
        ? await getQuickRecommendation(
            this.ticker,
            prices[initialRecommendDateIndex].date,
            this.allPrices,
            this.dateToIndexMap,
            this.recommendOptions
          )
        : null;
    this.currentStrategyName = initialRecommend?.strategy ?? "Pro2";
    this.currentStrategy = getStrategyParams(this.currentStrategyName);
    const initialReason = initialRecommend?.reason ?? "기본 전략";

    let state: CycleState = {
      strategy: this.currentStrategy,
      cycleCapital: initialCapital,
      holdings: [],
      cycleNumber: 1,
    };
    // 사이클 중 실현 손익 누적 (ADR-0001: 예수금이 아닌 현금에만 쌓이고,
    // 사이클 경계에서 다음 사이클 자본으로 복리 이월된다)
    let realizedProfit = new Decimal(0);
    let hasTradedThisCycle = false;
    let cycleCompletedToday = false;

    const dailyHistory: DailySnapshotWithStrategy[] = [];
    const cycleStrategies: CycleStrategyInfo[] = [];
    const completedCycles: { profit: number; strategy: Strategy }[] = [];
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

    // 첫날 처리 (매수 불가 - 전일 종가 없음)
    const firstDaySnapshot: DailySnapshotWithStrategy = {
      ...createSnapshot(
        prices[backtestStartIndex],
        state,
        realizedProfit,
        [],
        [],
        adjClosePrices,
        backtestStartIndex
      ),
      strategy: this.currentStrategyName,
    };
    dailyHistory.push(firstDaySnapshot);
    strategyStats[this.currentStrategyName].totalDays++;

    // 둘째 날부터 거래 시작
    for (let i = backtestStartIndex + 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1];
      const currentPrice = prices[i];

      // 전날 사이클 완료 시 새 사이클 시작 + 전략 재결정
      if (cycleCompletedToday) {
        // 이전 사이클 종료 처리 (보유 티어가 없으므로 총 자산 = 사이클 자본 + 실현 손익)
        currentCycleInfo.endDate = prevPrice.date;
        currentCycleInfo.finalAsset = cashBalance(state, realizedProfit)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();
        currentCycleInfo.returnRate =
          (currentCycleInfo.finalAsset - currentCycleInfo.initialCapital) /
          currentCycleInfo.initialCapital;
        currentCycleInfo.mdd = cycleMdd;

        // 새 전략 추천 받기 (전일 종가 기준)
        const newRecommend = await getQuickRecommendation(
          this.ticker,
          prevPrice.date,
          this.allPrices,
          this.dateToIndexMap,
          this.recommendOptions
        );
        const newStrategy = newRecommend?.strategy ?? "Pro2";
        const newReason = newRecommend?.reason ?? "기본 전략";

        // 전략 변경 + 새 사이클 시작 (실현 손익 복리 이월)
        this.currentStrategyName = newStrategy;
        this.currentStrategy = getStrategyParams(newStrategy);
        state = startNextCycle(
          state,
          new Decimal(state.cycleCapital).add(realizedProfit).toNumber(),
          this.currentStrategy
        );
        realizedProfit = new Decimal(0);
        hasTradedThisCycle = false;

        // 새 사이클 MDD 초기화
        cyclePeak = state.cycleCapital;
        cycleMdd = 0;

        // 새 사이클 정보 생성
        currentCycleInfo = {
          cycleNumber: state.cycleNumber,
          strategy: this.currentStrategyName,
          startDate: currentPrice.date,
          endDate: null,
          initialCapital: state.cycleCapital,
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
      if (!hasTradedThisCycle) {
        const todayRecommend = await getQuickRecommendation(
          this.ticker,
          prevPrice.date,
          this.allPrices,
          this.dateToIndexMap,
          this.recommendOptions
        );
        const todayStrategy = todayRecommend?.strategy ?? "Pro2";
        const todayReason = todayRecommend?.reason ?? "기본 전략";

        // 전략이 변경되었으면 업데이트 (cycles 카운트도 조정)
        // 아직 매수가 없었으므로 사이클 경계와 동일한 상태다 - 전략 교체 허용
        if (todayStrategy !== this.currentStrategyName) {
          // 첫 매수 전이므로, 이전 전략의 cycles를 새 전략으로 이전
          strategyStats[this.currentStrategyName].cycles--;
          strategyStats[todayStrategy].cycles++;

          this.currentStrategyName = todayStrategy;
          this.currentStrategy = getStrategyParams(todayStrategy);
          state = { ...state, strategy: this.currentStrategy };
        }

        // 현재 사이클 정보 업데이트 (아직 매수 전이므로)
        currentCycleInfo.strategy = this.currentStrategyName;
        currentCycleInfo.startDate = currentPrice.date;
        currentCycleInfo.startRsi = todayRecommend?.metrics.rsi14 ?? 0;
        currentCycleInfo.isGoldenCross = todayRecommend?.metrics.isGoldenCross ?? false;
        currentCycleInfo.recommendReason = todayReason;
      }

      strategyStats[this.currentStrategyName].totalDays++;

      // === 하루 처리: planOrders + settle 합성 ===
      const orders = planOrders(state, prevPrice.adjClose);
      const { newState, executions, events } = settle(state, orders, {
        date: currentPrice.date,
        close: currentPrice.adjClose,
      });

      for (const execution of executions) {
        if (execution.order.type === "BUY") {
          hasTradedThisCycle = true;
        }
        if (execution.profit !== undefined) {
          realizedProfit = realizedProfit.add(execution.profit);
        }
      }

      if (events.some((e) => e.type === "CYCLE_COMPLETED")) {
        completedCycles.push({
          profit: realizedProfit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
          strategy: this.currentStrategyName,
        });
        cycleCompletedToday = true; // 다음 날 새 사이클 시작
      }

      state = newState;

      // 일별 스냅샷 생성
      const snapshot: DailySnapshotWithStrategy = {
        ...createSnapshot(
          currentPrice,
          state,
          realizedProfit,
          toTradeActions(executions),
          toOrderActions(orders, executions, currentPrice.adjClose),
          adjClosePrices,
          i
        ),
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

    // 잔여 티어 (adjClose 기준 평가)
    const remainingTiers = createRemainingTiers(state, lastPrice.adjClose);

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
      returnRate: new Decimal(returnRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber(),
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
