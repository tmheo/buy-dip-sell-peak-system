/**
 * RPM 방식 추천 백테스트 엔진
 * SPEC-RPM-EXPERIMENT-001 REQ-006
 *
 * 기존 RecommendBacktestEngine과 유사하지만:
 * - 8개 RPM 지표 기반 유사도 계산
 * - 가중합 방식 (-500 ~ +500)
 * - 유사도 점수 차이가 적은 구간 선택
 */
import Decimal from "decimal.js";
import type { DailyPrice } from "@/types";
import type {
  StrategyName,
  StrategyConfig,
  TradeAction,
  OrderAction,
  DailyTechnicalMetrics,
  TechnicalMetrics,
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
import { BacktestEngine } from "@/backtest";
import { calculateStrategyScore } from "@/recommend/score";
import { applySOXLDowngrade, formatDowngradeReason } from "@/backtest/downgrade";

import type {
  RecommendBacktestRequest,
  RecommendBacktestResult,
  CycleStrategyInfo,
  DailySnapshotWithStrategy,
} from "@/backtest-recommend/types";

import type { RpmIndicators, RpmSimilarityResult } from "./types";
import { calculateRpmIndicators } from "./rpm-indicators";
import { findRpmSimilarPeriods, DEFAULT_RPM_CONFIG, getTotalMaxScore } from "./rpm-similarity";

/** RPM 추천 결과 */
export interface RpmRecommendResult {
  /** 추천 전략 */
  strategy: StrategyName;
  /** 추천 이유 */
  reason: string;
  /** 기준일 RPM 지표 */
  indicators: RpmIndicators;
  /** 정배열 여부 */
  isGoldenCross: boolean;
  /** RSI 14 */
  rsi14: number;
  /** 이격도 (disparity20) */
  disparity: number;
}

/** 유사 구간별 전략 성과 */
interface PeriodPerformance {
  /** 유사도 점수 */
  similarityScore: number;
  /** 각 전략별 성과 */
  strategyResults: Record<
    StrategyName,
    {
      returnRate: number;
      mdd: number;
      score: number;
    }
  >;
}

/** 성과 확인 기간 (20 거래일) */
const PERFORMANCE_PERIOD_DAYS = 20;

/** 백테스트용 lookback 일수 */
const LOOKBACK_DAYS = 90;

/** 인메모리 메모이제이션 캐시 (ticker:date -> 추천 결과) */
const rpmRecommendationCache = new Map<string, RpmRecommendResult>();

/**
 * RPM 추천 캐시 초기화
 * 새로운 백테스트 세션 시작 시 호출
 */
export function clearRpmRecommendationCache(): void {
  rpmRecommendationCache.clear();
}

/**
 * RPM 지표로부터 TechnicalMetrics 생성 (기존 함수와 호환)
 */
function rpmToTechnicalMetrics(
  indicators: RpmIndicators,
  isGoldenCross: boolean,
  prices: number[],
  index: number
): TechnicalMetrics {
  // 기존 TechnicalMetrics 계산 함수 사용
  const metrics = calculateTechnicalMetrics(prices, index);
  if (metrics) {
    return metrics;
  }

  // fallback: RPM 지표에서 변환
  return {
    goldenCross: indicators.disparity60,
    isGoldenCross,
    maSlope: 0, // RPM에 없음
    disparity: indicators.disparity20,
    rsi14: indicators.rsi14,
    roc12: indicators.roc10, // ROC10 -> ROC12 대체
    volatility20: indicators.bollingerWidth * 100, // 대략적 변환
  };
}

/**
 * RPM 기반 빠른 추천 조회
 *
 * @param ticker - 종목 티커
 * @param referenceDate - 기준일
 * @param allPrices - 전체 가격 데이터
 * @param dateToIndexMap - 날짜-인덱스 맵
 * @param historicalIndicatorsCache - 과거 지표 캐시 (선택)
 * @returns RPM 추천 결과 또는 null
 */
export function getRpmQuickRecommendation(
  ticker: "SOXL" | "TQQQ",
  referenceDate: string,
  allPrices: DailyPrice[],
  dateToIndexMap: Map<string, number>,
  historicalIndicatorsCache?: Map<string, { date: string; indicators: RpmIndicators }>
): RpmRecommendResult | null {
  // 0. 메모이제이션 캐시 확인
  const cacheKey = `${ticker}:${referenceDate}`;
  const cached = rpmRecommendationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. 기준일 인덱스 찾기
  const referenceDateIndex = dateToIndexMap.get(referenceDate);
  if (referenceDateIndex === undefined || referenceDateIndex < 59) {
    return {
      strategy: "Pro2",
      reason: "데이터 부족으로 기본 전략 사용",
      indicators: createDefaultRpmIndicators(),
      isGoldenCross: false,
      rsi14: 50,
      disparity: 0,
    };
  }

  // 2. 기준일 RPM 지표 계산
  const referenceIndicators = calculateRpmIndicators(allPrices, referenceDateIndex);
  if (!referenceIndicators) {
    return {
      strategy: "Pro2",
      reason: "RPM 지표 계산 실패로 기본 전략 사용",
      indicators: createDefaultRpmIndicators(),
      isGoldenCross: false,
      rsi14: 50,
      disparity: 0,
    };
  }

  // 3. 정배열 여부 확인 (disparity60 > 0 이면 MA > MA60 의미)
  const adjClosePrices = allPrices.map((p) => p.adjClose);
  const technicalMetrics = calculateTechnicalMetrics(adjClosePrices, referenceDateIndex);
  const isGoldenCross = technicalMetrics?.isGoldenCross ?? referenceIndicators.disparity60 > 0;

  // 4. 과거 지표 데이터 준비
  const minPastGapDays = 40;
  const maxHistoricalIndex = referenceDateIndex - minPastGapDays;

  if (maxHistoricalIndex < 59) {
    return {
      strategy: "Pro2",
      reason: "과거 데이터 부족으로 기본 전략 사용",
      indicators: referenceIndicators,
      isGoldenCross,
      rsi14: referenceIndicators.rsi14,
      disparity: referenceIndicators.disparity20,
    };
  }

  // 5. 과거 지표 계산 (캐시 사용 또는 직접 계산)
  const historicalData: Array<{ date: string; indicators: RpmIndicators }> = [];

  for (let i = 59; i <= maxHistoricalIndex; i++) {
    const date = allPrices[i].date;

    // 캐시에서 조회
    if (historicalIndicatorsCache) {
      const cachedIndicators = historicalIndicatorsCache.get(date);
      if (cachedIndicators) {
        historicalData.push(cachedIndicators);
        continue;
      }
    }

    // 직접 계산
    const indicators = calculateRpmIndicators(allPrices, i);
    if (indicators) {
      historicalData.push({ date, indicators });

      // 캐시에 저장
      if (historicalIndicatorsCache) {
        historicalIndicatorsCache.set(date, { date, indicators });
      }
    }
  }

  if (historicalData.length < 3) {
    return {
      strategy: "Pro2",
      reason: "유사 구간 부족으로 기본 전략 사용",
      indicators: referenceIndicators,
      isGoldenCross,
      rsi14: referenceIndicators.rsi14,
      disparity: referenceIndicators.disparity20,
    };
  }

  // 6. RPM 유사 구간 검색
  const similarPeriods = findRpmSimilarPeriods(
    referenceDate,
    referenceIndicators,
    historicalData,
    3, // Top 3
    20, // 최소 20일 간격
    minPastGapDays,
    DEFAULT_RPM_CONFIG
  );

  if (similarPeriods.length < 3) {
    return {
      strategy: "Pro2",
      reason: "유사 구간 3개 미만으로 기본 전략 사용",
      indicators: referenceIndicators,
      isGoldenCross,
      rsi14: referenceIndicators.rsi14,
      disparity: referenceIndicators.disparity20,
    };
  }

  // 7. 유사 구간별 전략 성과 계산
  const periodPerformances = calculatePeriodPerformances(
    ticker,
    similarPeriods,
    allPrices,
    dateToIndexMap
  );

  if (periodPerformances.length < 3) {
    return {
      strategy: "Pro2",
      reason: "성과 구간 부족으로 기본 전략 사용",
      indicators: referenceIndicators,
      isGoldenCross,
      rsi14: referenceIndicators.rsi14,
      disparity: referenceIndicators.disparity20,
    };
  }

  // 8. SOXL: 다이버전스 조건 체크 (정배열 Pro1 제외 규칙 무시용)
  // RPM에서는 기존 TechnicalMetrics 방식으로 변환 후 체크
  const metricsForDowngrade = rpmToTechnicalMetrics(
    referenceIndicators,
    isGoldenCross,
    adjClosePrices,
    referenceDateIndex
  );

  // checkDivergenceCondition 대신 직접 판단 (RSI >= 60 AND disparity < 20)
  const isDivergenceCondition =
    ticker === "SOXL" && referenceIndicators.rsi14 >= 60 && referenceIndicators.disparity20 < 20;

  // 9. 전략 점수 계산
  const strategyScores = calculateRpmStrategyScores(
    periodPerformances,
    isGoldenCross,
    isDivergenceCondition
  );

  // 10. 최고 점수 전략 선택
  let recommendedStrategy = selectBestStrategy(strategyScores);
  const bestScore = strategyScores.find((s) => s.strategy === recommendedStrategy);
  let reason = bestScore ? `RPM 평균 점수 ${bestScore.averageScore.toFixed(2)}점` : "RPM 추천";

  // 11. SOXL 전용 하향 규칙 적용
  if (ticker === "SOXL") {
    const downgradeResult = applySOXLDowngrade(
      recommendedStrategy,
      metricsForDowngrade,
      adjClosePrices,
      referenceDateIndex
    );
    recommendedStrategy = downgradeResult.strategy;
    reason = formatDowngradeReason(reason, downgradeResult);
  }

  const result: RpmRecommendResult = {
    strategy: recommendedStrategy,
    reason,
    indicators: referenceIndicators,
    isGoldenCross,
    rsi14: referenceIndicators.rsi14,
    disparity: referenceIndicators.disparity20,
  };

  // 캐시에 저장
  rpmRecommendationCache.set(cacheKey, result);

  return result;
}

/**
 * 기본 RPM 지표 생성
 */
function createDefaultRpmIndicators(): RpmIndicators {
  return {
    rsi14: 50,
    disparity20: 0,
    roc10: 0,
    macdHistogram: 0,
    bollingerWidth: 0.2,
    atrPercent: 3,
    disparity60: 0,
    stochasticK: 50,
  };
}

/**
 * 유사 구간별 전략 성과 계산
 */
function calculatePeriodPerformances(
  ticker: "SOXL" | "TQQQ",
  similarPeriods: RpmSimilarityResult[],
  allPrices: DailyPrice[],
  dateToIndexMap: Map<string, number>
): PeriodPerformance[] {
  const performances: PeriodPerformance[] = [];
  const strategies: StrategyName[] = ["Pro1", "Pro2", "Pro3"];
  const initialCapital = 10000000;

  for (const period of similarPeriods) {
    const periodDateIndex = dateToIndexMap.get(period.date);
    if (periodDateIndex === undefined) continue;

    // 성과 확인 구간 인덱스
    const performanceStartIndex = periodDateIndex + 1;
    const performanceEndIndex = performanceStartIndex + PERFORMANCE_PERIOD_DAYS - 1;

    if (performanceEndIndex >= allPrices.length) continue;

    const performanceStartDate = allPrices[performanceStartIndex].date;
    const performanceEndDate = allPrices[performanceEndIndex].date;

    // 백테스트용 가격 데이터 슬라이스
    const backtestLookbackIndex = Math.max(0, performanceStartIndex - LOOKBACK_DAYS);
    const backtestPrices = allPrices.slice(backtestLookbackIndex, performanceEndIndex + 1);
    const backtestStartIdx = performanceStartIndex - backtestLookbackIndex;

    const strategyResults: Record<
      StrategyName,
      { returnRate: number; mdd: number; score: number }
    > = {
      Pro1: { returnRate: 0, mdd: 0, score: 0 },
      Pro2: { returnRate: 0, mdd: 0, score: 0 },
      Pro3: { returnRate: 0, mdd: 0, score: 0 },
    };

    for (const strategy of strategies) {
      try {
        const engine = new BacktestEngine(strategy);
        const result = engine.run(
          {
            ticker,
            strategy,
            startDate: performanceStartDate,
            endDate: performanceEndDate,
            initialCapital,
          },
          backtestPrices,
          backtestStartIdx
        );

        const returnRatePercent = result.returnRate * 100;
        const mddPercent = result.mdd * 100;
        const score = calculateStrategyScore(returnRatePercent, mddPercent);

        strategyResults[strategy] = {
          returnRate: result.returnRate,
          mdd: result.mdd,
          score,
        };
      } catch {
        // 백테스트 실패 시 기본값 유지
      }
    }

    performances.push({
      similarityScore: period.similarityScore,
      strategyResults,
    });
  }

  return performances;
}

/** 전략 점수 정보 */
interface RpmStrategyScore {
  strategy: StrategyName;
  averageScore: number;
  excluded: boolean;
  excludeReason?: string;
}

/**
 * RPM 유사 구간 기반 전략 점수 계산
 * 유사도 점수로 가중 평균
 */
function calculateRpmStrategyScores(
  performances: PeriodPerformance[],
  isGoldenCross: boolean,
  skipPro1Exclusion: boolean
): RpmStrategyScore[] {
  const strategies: StrategyName[] = ["Pro1", "Pro2", "Pro3"];
  const scores: RpmStrategyScore[] = [];
  const maxScore = getTotalMaxScore(DEFAULT_RPM_CONFIG);

  for (const strategy of strategies) {
    // 유사도 가중 평균 점수 계산
    // 유사도 점수를 0~1 범위로 정규화: (score + maxScore) / (2 * maxScore)
    let weightedScoreSum = new Decimal(0);
    let weightSum = new Decimal(0);

    for (const perf of performances) {
      // 유사도 점수를 가중치로 변환 (점수가 높을수록 가중치 높음)
      // 범위: -470 ~ +470 -> 0 ~ 940 -> 정규화
      const normalizedSimilarity = (perf.similarityScore + maxScore) / (2 * maxScore);
      const weight = new Decimal(Math.max(0.1, normalizedSimilarity)); // 최소 가중치 0.1

      const strategyScore = new Decimal(perf.strategyResults[strategy].score);
      weightedScoreSum = weightedScoreSum.add(strategyScore.mul(weight));
      weightSum = weightSum.add(weight);
    }

    const averageScore = weightSum.gt(0)
      ? weightedScoreSum.div(weightSum).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()
      : 0;

    // 정배열 시 Pro1 제외 (다이버전스 조건 발동 시 무시)
    const excluded = strategy === "Pro1" && isGoldenCross && !skipPro1Exclusion;
    const excludeReason = excluded ? "정배열 시 제외" : undefined;

    scores.push({
      strategy,
      averageScore,
      excluded,
      excludeReason,
    });
  }

  return scores;
}

/**
 * 최고 점수 전략 선택 (제외되지 않은 전략 중)
 */
function selectBestStrategy(scores: RpmStrategyScore[]): StrategyName {
  const validScores = scores.filter((s) => !s.excluded);

  if (validScores.length === 0) {
    return "Pro2";
  }

  return validScores.reduce((best, current) =>
    current.averageScore > best.averageScore ? current : best
  ).strategy;
}

/**
 * RPM 방식 추천 백테스트 엔진
 * 기존 RecommendBacktestEngine과 동일한 구조이지만 RPM 유사도 기반 추천 사용
 */
export class RpmRecommendBacktestEngine {
  private currentStrategy: StrategyConfig;
  private currentStrategyName: StrategyName;
  private ticker: "SOXL" | "TQQQ";
  private allPrices: DailyPrice[];
  private dateToIndexMap: Map<string, number>;
  private historicalIndicatorsCache: Map<string, { date: string; indicators: RpmIndicators }>;

  constructor(
    ticker: "SOXL" | "TQQQ",
    allPrices: DailyPrice[],
    dateToIndexMap: Map<string, number>
  ) {
    this.ticker = ticker;
    this.allPrices = allPrices;
    this.dateToIndexMap = dateToIndexMap;
    this.historicalIndicatorsCache = new Map();

    // 초기 전략은 run()에서 설정
    this.currentStrategyName = "Pro2";
    this.currentStrategy = getStrategy("Pro2");
  }

  /**
   * RPM 추천 전략 백테스트 실행
   */
  run(request: RecommendBacktestRequest, backtestStartIndex: number): RecommendBacktestResult {
    const { initialCapital, startDate, endDate } = request;
    const prices = this.allPrices;

    // 유효성 검사
    const backtestPricesCount = prices.length - backtestStartIndex;
    if (backtestPricesCount < 2) {
      throw new Error("At least 2 days of price data required");
    }

    // 초기 전략 결정 (시작일 전날 종가 기준으로 RPM 추천)
    const initialRecommendDateIndex = backtestStartIndex - 1;
    const initialRecommend =
      initialRecommendDateIndex >= 0
        ? getRpmQuickRecommendation(
            this.ticker,
            prices[initialRecommendDateIndex].date,
            this.allPrices,
            this.dateToIndexMap,
            this.historicalIndicatorsCache
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
      startRsi: initialRecommend?.rsi14 ?? 0,
      isGoldenCross: initialRecommend?.isGoldenCross ?? false,
      recommendReason: initialReason,
    };
    cycleStrategies.push(currentCycleInfo);
    strategyStats[this.currentStrategyName].cycles++;

    // 사이클별 MDD 계산을 위한 변수
    let cyclePeak = initialCapital;
    let cycleMdd = 0;
    let cycleCompletedToday = false;

    // 첫날 처리
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

        // 새 전략 RPM 추천 받기 (전일 종가 기준)
        const newRecommend = getRpmQuickRecommendation(
          this.ticker,
          prevPrice.date,
          this.allPrices,
          this.dateToIndexMap,
          this.historicalIndicatorsCache
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
          startRsi: newRecommend?.rsi14 ?? 0,
          isGoldenCross: newRecommend?.isGoldenCross ?? false,
          recommendReason: newReason,
        };
        cycleStrategies.push(currentCycleInfo);
        strategyStats[this.currentStrategyName].cycles++;

        cycleCompletedToday = false;
      }

      // 첫 매수 전까지 매일 전략 재평가 (전일 종가 기준)
      if (!cycleManager.hasTradedThisCycle()) {
        const todayRecommend = getRpmQuickRecommendation(
          this.ticker,
          prevPrice.date,
          this.allPrices,
          this.dateToIndexMap,
          this.historicalIndicatorsCache
        );
        const todayStrategy = todayRecommend?.strategy ?? "Pro2";
        const todayReason = todayRecommend?.reason ?? "기본 전략";

        // 전략이 변경되었으면 업데이트
        if (todayStrategy !== this.currentStrategyName) {
          strategyStats[this.currentStrategyName].cycles--;
          strategyStats[todayStrategy].cycles++;

          this.currentStrategyName = todayStrategy;
          this.currentStrategy = getStrategy(todayStrategy);
          cycleManager.setStrategy(this.currentStrategy);
        }

        // 현재 사이클 정보 업데이트
        currentCycleInfo.strategy = this.currentStrategyName;
        currentCycleInfo.startDate = currentPrice.date;
        currentCycleInfo.startRsi = todayRecommend?.rsi14 ?? 0;
        currentCycleInfo.isGoldenCross = todayRecommend?.isGoldenCross ?? false;
        currentCycleInfo.recommendReason = todayReason;
      }

      strategyStats[this.currentStrategyName].totalDays++;

      // 경과 일수 증가
      if (cycleManager.getActiveTiers().length > 0) {
        cycleManager.incrementDay();
      }

      // === 매수/매도 로직 ===

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

      // 일별 스냅샷 생성
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

    // 마지막 사이클 정보 업데이트
    if (currentCycleInfo.endDate === null) {
      const lastSnapshot = dailyHistory[dailyHistory.length - 1];

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
