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
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type { BacktestRequest, BacktestResult, DailySnapshot } from "./types";
import type { Strategy } from "@/types/trading";
import type { CycleState, StrategyParams } from "@/strategy";
import { getStrategyParams, planOrders, settle, startNextCycle } from "@/strategy";
import { createRemainingTiers, createSnapshot, toOrderActions, toTradeActions } from "./snapshot";
import {
  calculateMDD,
  calculateWinRate,
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
  private strategy: StrategyParams;

  /**
   * 백테스트 엔진 생성
   *
   * @param strategyName - 전략 이름
   */
  constructor(strategyName: Strategy) {
    this.strategy = getStrategyParams(strategyName);
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

    let state: CycleState = {
      strategy: this.strategy,
      cycleCapital: request.initialCapital,
      holdings: [],
      cycleNumber: 1,
    };
    // 사이클 중 실현 손익 누적 (ADR-0001: 예수금이 아닌 현금에만 쌓이고,
    // 사이클 경계에서 다음 사이클 자본으로 복리 이월된다)
    let realizedProfit = new Decimal(0);
    let cycleCompletedToday = false; // 사이클 완료 플래그 (다음 날 새 사이클 시작)

    const dailyHistory: DailySnapshot[] = [];
    let totalCycles = 1;
    const completedCycles: { profit: number }[] = [];

    // SPEC-METRICS-001: adjClose 배열 생성 (기술적 지표 계산용 - 전체 데이터)
    const adjClosePrices = prices.map((p) => p.adjClose);

    // 백테스트 첫날 처리 (매수 불가 - 전일 종가 없음)
    dailyHistory.push(
      createSnapshot(
        prices[effectiveStartIndex],
        state,
        realizedProfit,
        [],
        [],
        adjClosePrices,
        effectiveStartIndex
      )
    );

    // 백테스트 둘째 날부터 거래 시작
    for (let i = effectiveStartIndex + 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1];
      const currentPrice = prices[i];

      // 전날 사이클이 완료되었으면 오늘 새 사이클 시작 (실현 손익 복리 이월)
      if (cycleCompletedToday) {
        state = startNextCycle(
          state,
          new Decimal(state.cycleCapital).add(realizedProfit).toNumber()
        );
        realizedProfit = new Decimal(0);
        totalCycles++;
        cycleCompletedToday = false;
      }

      const orders = planOrders(state, prevPrice.adjClose);
      const { newState, executions, events } = settle(state, orders, {
        date: currentPrice.date,
        close: currentPrice.adjClose,
      });

      for (const execution of executions) {
        if (execution.profit !== undefined) {
          realizedProfit = realizedProfit.add(execution.profit);
        }
      }

      if (events.some((e) => e.type === "CYCLE_COMPLETED")) {
        completedCycles.push({
          profit: realizedProfit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        });
        cycleCompletedToday = true; // 다음 날 새 사이클 시작
      }

      state = newState;

      dailyHistory.push(
        createSnapshot(
          currentPrice,
          state,
          realizedProfit,
          toTradeActions(executions),
          toOrderActions(orders, executions, currentPrice.adjClose),
          adjClosePrices,
          i
        )
      );
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
