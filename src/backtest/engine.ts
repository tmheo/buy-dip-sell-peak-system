/**
 * 백테스트 엔진 메인 클래스
 * SPEC-BACKTEST-001
 *
 * #46: 하루 루프는 src/strategy의 planOrders + settle 합성이다.
 * 매매 규칙(티어 선정, 지정가, 체결 판정, 손절)은 전부 src/strategy가 소유하고,
 * 이 엔진은 가격 공급, 사이클 자본 복리 이월, 스냅샷·지표 계산만 담당한다.
 *
 * 가격은 adjClose 하나로 통일한다 (#43): 체결 판정, 체결가, 보유 자산 평가 모두
 * 분할·배당이 조정된 연속 시계열을 사용한다.
 *
 * #63: 전략 결정을 분리하는 경계. 선택적 공급자(StrategyProvider)를 받아
 * 사이클 경계에서 전략을 동적으로 전환한다. 공급자 호출 시점 세 가지(모두 전일
 * 종가 기준일): 백테스트 시작 전날, 사이클 완료 익일, 사이클 내 첫 매수 전
 * 매일(재평가). 공급자가 없으면(고정 전략) 루프에서 await를 한 번도 타지 않고,
 * 사이클 시작 지표도 확정 시점에만 계산해 하루 단위 오버헤드를 만들지 않는다.
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type {
  BacktestRequest,
  BacktestResult,
  CycleStrategyInfo,
  DailySnapshot,
  DailyTechnicalMetrics,
  StrategyDecision,
  StrategyDecisionMetrics,
  StrategyProvider,
  StrategyUsageStats,
} from "./types";
import type { Strategy } from "@/types/trading";
import type { CycleState, StrategyParams } from "@/strategy";
import { getStrategyParams, planOrders, settle, startNextCycle } from "@/strategy";
import {
  cashBalance,
  createRemainingTiers,
  createSnapshot,
  toOrderActions,
  toTradeActions,
} from "./snapshot";
import {
  calculateMDD,
  calculateWinRate,
  calculateTechnicalMetrics,
  calculateCAGR,
} from "./metrics";
import { computeIndicatorSeries, computeIndicatorsAt } from "@/metrics";

/** 고정 전략 실행(공급자 없음)의 사이클 전략 결정 사유 */
const FIXED_STRATEGY_REASON = "고정 전략";

/** 시작 지표 확정 전 자리값 (데이터가 끝까지 부족하면 그대로 남는다) */
const NEUTRAL_START_METRICS: StrategyDecisionMetrics = { rsi14: 0, isGoldenCross: false };

/** 사이클 시작 지표를 엔진이 직접 계산 (고정 전략 모드용, 데이터 부족 시 중립값) */
function cycleStartMetrics(adjClosePrices: number[], refIndex: number): StrategyDecisionMetrics {
  if (refIndex < 0) {
    return NEUTRAL_START_METRICS;
  }
  const row = computeIndicatorsAt(adjClosePrices, refIndex);
  return { rsi14: row.rsi14 ?? 0, isGoldenCross: row.isGoldenCross ?? false };
}

/**
 * 백테스트 엔진
 * 가격 데이터와 전략을 기반으로 백테스트를 수행
 */
export class BacktestEngine {
  private strategyName: Strategy;
  private strategy: StrategyParams;

  /**
   * 백테스트 엔진 생성
   *
   * @param strategyName - 전략 이름. 공급자 모드에서는 초기 기준일이 없을 때
   *   유지되는 초기 전략이다 (추천 백테스트의 "부족하면 Pro2" 재현 의미는
   *   공급자를 꽂는 쪽이 생성자 전략을 Pro2로 지정해 보장한다)
   */
  constructor(strategyName: Strategy) {
    this.strategyName = strategyName;
    this.strategy = getStrategyParams(strategyName);
  }

  /**
   * 백테스트 실행
   *
   * @param request - 백테스트 요청
   * @param prices - 가격 데이터 (날짜순 정렬, 과거 데이터 포함 가능)
   * @param backtestStartIndex - 백테스트 시작 인덱스 (과거 데이터는 지표 계산용)
   * @param provider - 선택적 전략 결정 공급자 (#63). 없으면 고정 전략 실행
   * @returns 백테스트 결과
   */
  async run(
    request: BacktestRequest,
    prices: DailyPrice[],
    backtestStartIndex: number = 0,
    provider?: StrategyProvider
  ): Promise<BacktestResult> {
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

    // SPEC-METRICS-001: adjClose 배열 생성 (기술적 지표 계산용 - 전체 데이터)
    const adjClosePrices = prices.map((p) => p.adjClose);

    // 초기 전략 결정 (백테스트 시작 전날 종가 기준)
    let currentStrategyName = this.strategyName;
    let currentStrategy = this.strategy;
    const initialRefIndex = effectiveStartIndex - 1;
    // 고정 모드의 사이클 시작 지표는 시작 시점이 확정될 때(첫 매수 또는 백테스트 종료)
    // 한 번만 계산한다 - 확정 전까지는 계산할 기준일 인덱스만 기억해 둔다
    let pendingStartMetricsIndex: number | null = null;
    let initialReason: string;
    let initialMetrics = NEUTRAL_START_METRICS;
    if (!provider) {
      initialReason = FIXED_STRATEGY_REASON;
      pendingStartMetricsIndex = initialRefIndex;
    } else if (initialRefIndex >= 0) {
      const decision = await provider(prices[initialRefIndex].date, 1);
      currentStrategyName = decision.strategy;
      currentStrategy = getStrategyParams(decision.strategy);
      initialReason = decision.reason;
      initialMetrics = decision.metrics;
    } else {
      // 기준일이 없으면 공급자를 부를 수 없다 - 생성자 전략을 초기 전략으로 유지
      initialReason = "초기 전략 유지";
    }

    let state: CycleState = {
      strategy: currentStrategy,
      cycleCapital: request.initialCapital,
      holdings: [],
      cycleNumber: 1,
    };
    // 사이클 중 실현 손익 누적 (ADR-0001: 예수금이 아닌 현금에만 쌓이고,
    // 사이클 경계에서 다음 사이클 자본으로 복리 이월된다)
    let realizedProfit = new Decimal(0);
    let hasTradedThisCycle = false;
    let cycleCompletedToday = false; // 사이클 완료 플래그 (다음 날 새 사이클 시작)

    const dailyHistory: DailySnapshot[] = [];
    const cycleStrategies: CycleStrategyInfo[] = [];
    const completedCycles: { profit: number; strategy: Strategy }[] = [];

    // 첫 번째 사이클 정보 생성
    let currentCycleInfo: CycleStrategyInfo = {
      cycleNumber: 1,
      strategy: currentStrategyName,
      startDate: prices[effectiveStartIndex].date,
      endDate: null,
      initialCapital: request.initialCapital,
      finalAsset: null,
      returnRate: null,
      mdd: 0,
      startRsi: initialMetrics.rsi14,
      isGoldenCross: initialMetrics.isGoldenCross,
      recommendReason: initialReason,
    };
    cycleStrategies.push(currentCycleInfo);

    // 사이클별 MDD 계산을 위한 변수
    let cyclePeak = request.initialCapital;
    let cycleMdd = 0;

    /** 현재 사이클 정보 마감 (종료일·최종 자산·수익률·MDD) */
    const closeCycleInfo = (endDate: string | null, finalAsset: number): void => {
      currentCycleInfo.endDate = endDate;
      currentCycleInfo.finalAsset = finalAsset;
      currentCycleInfo.returnRate =
        (finalAsset - currentCycleInfo.initialCapital) / currentCycleInfo.initialCapital;
      currentCycleInfo.mdd = cycleMdd;
    };

    /** 고정 모드: 미뤄 둔 사이클 시작 지표를 계산해 확정 */
    const freezeStartMetrics = (): void => {
      if (pendingStartMetricsIndex === null) return;
      const metrics = cycleStartMetrics(adjClosePrices, pendingStartMetricsIndex);
      currentCycleInfo.startRsi = metrics.rsi14;
      currentCycleInfo.isGoldenCross = metrics.isGoldenCross;
      pendingStartMetricsIndex = null;
    };

    // 백테스트 첫날 처리 (매수 불가 - 전일 종가 없음)
    dailyHistory.push({
      ...createSnapshot(
        prices[effectiveStartIndex],
        state,
        realizedProfit,
        [],
        [],
        adjClosePrices,
        effectiveStartIndex
      ),
      strategy: currentStrategyName,
    });

    // 백테스트 둘째 날부터 거래 시작
    for (let i = effectiveStartIndex + 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1];
      const currentPrice = prices[i];

      // 같은 전일 종가 기준일의 결정은 한 번만 조회한다
      // (사이클 완료 다음 날은 새 사이클 시작과 첫 매수 전 재평가가 모두 실행되므로)
      let prevDateDecision: StrategyDecision | null = null;

      // 전날 사이클이 완료되었으면 오늘 새 사이클 시작 (실현 손익 복리 이월)
      if (cycleCompletedToday) {
        // 이전 사이클 마감 (보유 티어가 없으므로 총 자산 = 사이클 자본 + 실현 손익)
        closeCycleInfo(
          prevPrice.date,
          cashBalance(state, realizedProfit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
        );

        // 새 사이클 전략 결정 (사이클 완료 익일, 전일 종가 기준)
        let newReason = FIXED_STRATEGY_REASON;
        let newMetrics = NEUTRAL_START_METRICS;
        if (provider) {
          const decision = await provider(prevPrice.date, state.cycleNumber + 1);
          prevDateDecision = decision;
          currentStrategyName = decision.strategy;
          currentStrategy = getStrategyParams(decision.strategy);
          newReason = decision.reason;
          newMetrics = decision.metrics;
        } else {
          pendingStartMetricsIndex = i - 1;
        }

        state = startNextCycle(
          state,
          new Decimal(state.cycleCapital).add(realizedProfit).toNumber(),
          currentStrategy
        );
        realizedProfit = new Decimal(0);
        hasTradedThisCycle = false;

        // 새 사이클 MDD 초기화
        cyclePeak = state.cycleCapital;
        cycleMdd = 0;

        // 새 사이클 정보 생성
        currentCycleInfo = {
          cycleNumber: state.cycleNumber,
          strategy: currentStrategyName,
          startDate: currentPrice.date,
          endDate: null,
          initialCapital: state.cycleCapital,
          finalAsset: null,
          returnRate: null,
          mdd: 0,
          startRsi: newMetrics.rsi14,
          isGoldenCross: newMetrics.isGoldenCross,
          recommendReason: newReason,
        };
        cycleStrategies.push(currentCycleInfo);

        cycleCompletedToday = false;
      }

      // 첫 매수 전까지 매일 전략 재평가 (전일 종가 기준)
      // 아직 보유가 없으므로 사이클 경계와 동일 상태다 - 전략 교체 허용 (CONTEXT.md 사이클 정의)
      if (!hasTradedThisCycle) {
        if (provider) {
          const decision = prevDateDecision ?? (await provider(prevPrice.date, state.cycleNumber));
          // 추천이 바뀌었으면 전략 교체
          if (decision.strategy !== currentStrategyName) {
            currentStrategyName = decision.strategy;
            currentStrategy = getStrategyParams(decision.strategy);
            state = { ...state, strategy: currentStrategy };
          }
          currentCycleInfo.strategy = currentStrategyName;
          currentCycleInfo.startRsi = decision.metrics.rsi14;
          currentCycleInfo.isGoldenCross = decision.metrics.isGoldenCross;
          currentCycleInfo.recommendReason = decision.reason;
        } else {
          pendingStartMetricsIndex = i - 1;
        }
        // 아직 매수 전이므로 사이클 시작 시점이 오늘로 밀린다
        currentCycleInfo.startDate = currentPrice.date;
      }

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

      // 고정 모드: 첫 매수로 사이클 시작 시점이 확정되면 시작 지표를 계산한다
      if (hasTradedThisCycle) {
        freezeStartMetrics();
      }

      if (events.some((e) => e.type === "CYCLE_COMPLETED")) {
        completedCycles.push({
          profit: realizedProfit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
          strategy: currentStrategyName,
        });
        cycleCompletedToday = true; // 다음 날 새 사이클 시작
      }

      state = newState;

      const snapshot: DailySnapshot = {
        ...createSnapshot(
          currentPrice,
          state,
          realizedProfit,
          toTradeActions(executions),
          toOrderActions(orders, executions, currentPrice.adjClose),
          adjClosePrices,
          i
        ),
        strategy: currentStrategyName,
      };
      dailyHistory.push(snapshot);

      // 사이클 MDD 갱신
      if (snapshot.totalAsset > cyclePeak) {
        cyclePeak = snapshot.totalAsset;
      }
      const drawdown = (snapshot.totalAsset - cyclePeak) / cyclePeak;
      if (drawdown < cycleMdd) {
        cycleMdd = drawdown;
      }
    }

    // 매수 없이 끝난 마지막 사이클의 시작 지표 확정 (고정 모드)
    freezeStartMetrics();

    // 마지막 사이클 정보 마감 (진행 중인 경우)
    const lastSnapshot = dailyHistory[dailyHistory.length - 1];
    if (currentCycleInfo.endDate === null) {
      // 마지막 날에 사이클이 완료된 경우에만 종료일이 있다
      closeCycleInfo(
        cycleCompletedToday ? prices[prices.length - 1].date : null,
        lastSnapshot.totalAsset
      );
    }

    // 전략별 사용 통계 (사이클 정보·일별 스냅샷에서 집계)
    const strategyStats: Record<Strategy, StrategyUsageStats> = {
      Pro1: { cycles: 0, totalDays: 0 },
      Pro2: { cycles: 0, totalDays: 0 },
      Pro3: { cycles: 0, totalDays: 0 },
    };
    for (const cycle of cycleStrategies) {
      strategyStats[cycle.strategy].cycles++;
    }
    for (const snapshot of dailyHistory) {
      strategyStats[snapshot.strategy].totalDays++;
    }

    // 결과 계산
    const lastPrice = prices[prices.length - 1];
    const finalAsset = lastSnapshot.totalAsset;
    const returnRate = (finalAsset - request.initialCapital) / request.initialCapital;
    const mdd = calculateMDD(dailyHistory);
    const winRate = calculateWinRate(completedCycles);

    // CAGR 계산 (백테스트 기간 기준)
    const backtestDays = prices.length - effectiveStartIndex;
    const cagr = calculateCAGR(request.initialCapital, finalAsset, backtestDays);

    // 잔여 티어 (미매도 보유 주식) 정보 생성 - adjClose 기준 평가
    const remainingTiers = createRemainingTiers(state, lastPrice.adjClose);

    // SPEC-METRICS-001: 종료 시점 기술적 지표 계산
    // 원본 사이트 방식: 백테스트 기간 내 거래일 수가 60일 미만이면 정배열(goldenCross) NaN
    // 지표 계산은 전체 데이터(과거 포함)를 사용하여 정확한 값 산출
    const technicalMetrics = calculateTechnicalMetrics(
      adjClosePrices,
      prices.length - 1,
      backtestDays
    );

    // 일별 기술적 지표 배열 생성 (차트용 - 백테스트 기간만, 배치 한 번 호출)
    const dailyTechnicalMetrics: DailyTechnicalMetrics[] = computeIndicatorSeries(
      adjClosePrices,
      effectiveStartIndex,
      prices.length - 1
    ).map((row, offset) => ({
      date: prices[effectiveStartIndex + offset].date,
      goldenCross: row.goldenCross,
      maSlope: row.maSlope,
      disparity: row.disparity,
      rsi14: row.rsi14,
      roc12: row.roc12,
      volatility20: row.volatility20,
    }));

    return {
      strategy: request.strategy,
      startDate: request.startDate,
      endDate: request.endDate,
      initialCapital: request.initialCapital,
      finalAsset,
      returnRate: new Decimal(returnRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber(),
      cagr,
      mdd,
      totalCycles: cycleStrategies.length,
      winRate,
      dailyHistory,
      remainingTiers,
      completedCycles,
      technicalMetrics,
      dailyTechnicalMetrics,
      cycleStrategies,
      strategyStats,
    };
  }
}
