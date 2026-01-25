/**
 * RSI 다이버전스 탐지 함수
 * SPEC-RECOMMEND-002 RSI 다이버전스 + 이격도120+ 하향 조건
 */
import Decimal from "decimal.js";
import { calculateRSI } from "./metrics";

/** 다이버전스 탐지 결과 */
export interface DivergenceResult {
  /** 베어리시 다이버전스 탐지 여부 */
  hasBearishDivergence: boolean;
  /** 탐지된 가격 고점들 (인덱스) */
  priceHighIndices: number[];
  /** 탐지된 가격 고점들 */
  priceHighs: number[];
  /** 탐지된 RSI 고점들 */
  rsiHighs: number[];
}

/** 다이버전스 탐지 옵션 */
export interface DivergenceOptions {
  /** 분석 윈도우 크기 (기본값: 15 거래일) */
  windowSize?: number;
  /** 고점 간 최소 거리 (기본값: 3 거래일) */
  minPeakDistance?: number;
  /** 가격 허용 오차 (기본값: -0.01 = -1%) */
  priceTolerance?: number;
  /** RSI 최소 하락폭 (기본값: 3 포인트) */
  rsiMinDrop?: number;
}

/** 기본 옵션 */
const DEFAULT_OPTIONS: Required<DivergenceOptions> = {
  windowSize: 15,
  minPeakDistance: 3,
  priceTolerance: -0.01,
  rsiMinDrop: 3,
};

/** 다이버전스 없음 기본 결과 */
const NO_DIVERGENCE_RESULT: DivergenceResult = Object.freeze({
  hasBearishDivergence: false,
  priceHighIndices: [],
  priceHighs: [],
  rsiHighs: [],
});

/**
 * 로컬 고점 탐지
 * 양쪽 이웃보다 높은 값을 고점으로 판정
 *
 * @param prices - 가격 배열
 * @param startIndex - 검색 시작 인덱스
 * @param endIndex - 검색 종료 인덱스
 * @param minDistance - 고점 간 최소 거리
 * @returns 고점 인덱스 배열
 */
export function findLocalHighs(
  prices: number[],
  startIndex: number,
  endIndex: number,
  minDistance: number
): number[] {
  const highs: number[] = [];

  for (let i = startIndex + 1; i < endIndex; i++) {
    // 양쪽 이웃보다 높으면 로컬 고점
    if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
      // 이전 고점과의 거리 확인
      if (highs.length === 0 || i - highs[highs.length - 1] >= minDistance) {
        highs.push(i);
      } else {
        // 거리가 가까우면 더 높은 쪽을 선택
        const lastHighIndex = highs[highs.length - 1];
        if (prices[i] > prices[lastHighIndex]) {
          highs[highs.length - 1] = i;
        }
      }
    }
  }

  return highs;
}

/**
 * RSI 베어리시 다이버전스 탐지
 *
 * 베어리시 다이버전스:
 * - 가격이 상승/횡보하는데 (최근 고점 >= 이전 고점의 99%)
 * - RSI는 하락 (최근 RSI < 이전 RSI - 3)
 *
 * @param prices - 전체 가격 배열 (adjClose 값들)
 * @param currentIndex - 현재 날짜 인덱스 (기준일)
 * @param options - 탐지 옵션
 * @returns DivergenceResult
 */
export function detectBearishDivergence(
  prices: number[],
  currentIndex: number,
  options?: DivergenceOptions
): DivergenceResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const windowStart = currentIndex - opts.windowSize + 1;

  // 데이터 부족 또는 범위 초과 시 기본 결과 반환
  if (windowStart < 14 || currentIndex >= prices.length) {
    return NO_DIVERGENCE_RESULT;
  }

  // 윈도우 내 로컬 고점 탐지
  const highIndices = findLocalHighs(prices, windowStart, currentIndex, opts.minPeakDistance);

  // 고점이 2개 미만이면 다이버전스 판정 불가
  if (highIndices.length < 2) {
    return NO_DIVERGENCE_RESULT;
  }

  // 각 고점에서 RSI 계산
  const rsiValues = highIndices.map((idx) => calculateRSI(prices, idx));

  // 가장 최근 2개의 고점 비교
  // 인덱스가 큰 쪽이 최근
  const recentIdx = highIndices.length - 1;
  const prevIdx = highIndices.length - 2;

  const recentHighIndex = highIndices[recentIdx];
  const prevHighIndex = highIndices[prevIdx];

  const recentPrice = prices[recentHighIndex];
  const prevPrice = prices[prevHighIndex];

  const recentRsi = rsiValues[recentIdx];
  const prevRsi = rsiValues[prevIdx];

  // RSI 값이 계산 불가능한 경우
  if (recentRsi === null || prevRsi === null) {
    return NO_DIVERGENCE_RESULT;
  }

  // 베어리시 다이버전스 판정
  // 1. 가격 조건: 최근 고점 >= 이전 고점 * (1 + tolerance)
  //    tolerance = -0.01 이므로, 최근 고점 >= 이전 고점 * 0.99
  const priceThreshold = new Decimal(prevPrice).mul(new Decimal(1).add(opts.priceTolerance));
  const priceCondition = new Decimal(recentPrice).gte(priceThreshold);

  // 2. RSI 조건: 최근 RSI < 이전 RSI - minDrop
  const rsiThreshold = new Decimal(prevRsi).sub(opts.rsiMinDrop);
  const rsiCondition = new Decimal(recentRsi).lt(rsiThreshold);

  const hasBearishDivergence = priceCondition && rsiCondition;

  return {
    hasBearishDivergence,
    priceHighIndices: [prevHighIndex, recentHighIndex],
    priceHighs: [prevPrice, recentPrice],
    rsiHighs: [prevRsi, recentRsi],
  };
}
