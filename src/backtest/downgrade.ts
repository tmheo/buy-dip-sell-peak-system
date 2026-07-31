/**
 * SOXL 전략 하향 규칙
 * 특정 조건에서 전략을 한 단계 보수적으로 하향
 */
import type { TechnicalMetrics } from "./types";
import type { Strategy } from "@/types/trading";
import { detectBearishDivergence } from "./divergence";

/** 하향 적용 결과 */
export interface DowngradeResult {
  /** 하향된 전략 (하향 없으면 원본 그대로) */
  strategy: Strategy;
  /** 하향이 적용되었는지 여부 */
  applied: boolean;
  /** 원본 전략 (하향 시에만 설정) */
  originalStrategy?: Strategy;
  /** 하향 사유 목록 */
  reasons: string[];
}

/** 전략 하향 매핑 */
const DOWNGRADE_MAP: Record<Strategy, Strategy> = {
  Pro3: "Pro2",
  Pro2: "Pro1",
  Pro1: "Pro1",
};

/** 조건 2 사유 문자열 */
const DIVERGENCE_REASON = "RSI 다이버전스 & 이격도<120";

/**
 * SOXL 전략 하향 규칙 적용
 *
 * 2가지 조건 중 하나라도 충족 시 전략을 한 단계 하향 (중복 시 1회만):
 * - 조건 1: RSI >= 60 AND 역배열
 * - 조건 2: 다이버전스 조건 (checkDivergenceCondition으로 호출부가 한 번 계산해 전달)
 *
 * @param strategy - 원본 추천 전략
 * @param metrics - 기준일 기술적 지표
 * @param hasDivergenceCondition - 다이버전스 조건(조건 2) 발동 여부
 * @returns 하향 적용 결과
 */
export function applySOXLDowngrade(
  strategy: Strategy,
  metrics: TechnicalMetrics,
  hasDivergenceCondition: boolean
): DowngradeResult {
  const reasons: string[] = [];

  // 조건 1: RSI >= 60 AND 역배열
  const isCondition1 = metrics.rsi14 >= 60 && !metrics.isGoldenCross;
  if (isCondition1) {
    reasons.push("RSI≥60 & 역배열");
  }

  // 조건 2: RSI 다이버전스 AND 이격도<120 AND RSI>=60
  if (hasDivergenceCondition) {
    reasons.push(DIVERGENCE_REASON);
  }

  // 조건이 없으면 원본 그대로 반환
  if (reasons.length === 0) {
    return {
      strategy,
      applied: false,
      reasons: [],
    };
  }

  // 하향 적용 (1회만)
  const downgradedStrategy = DOWNGRADE_MAP[strategy];
  const applied = downgradedStrategy !== strategy;

  return {
    strategy: downgradedStrategy,
    applied,
    originalStrategy: applied ? strategy : undefined,
    reasons,
  };
}

/**
 * 하향 사유를 reason 문자열에 추가
 *
 * @param baseReason - 기존 reason 문자열
 * @param result - 하향 적용 결과
 * @returns 하향 정보가 포함된 reason 문자열
 */
export function formatDowngradeReason(baseReason: string, result: DowngradeResult): string {
  if (!result.applied || !result.originalStrategy) {
    return baseReason;
  }
  return `${baseReason} (${result.reasons.join(", ")}로 ${result.originalStrategy}→${result.strategy} 하향)`;
}

/**
 * RSI 다이버전스 조건(조건 2) 발동 여부 체크
 * RSI 다이버전스 AND 이격도 < 120 AND 기준일 RSI >= 60
 * 정배열 시 Pro1 제외 규칙 무시와 전략 하향(조건 2)에 공용으로 쓰이므로
 * 호출부가 한 번 계산해 전달한다
 *
 * @param metrics - 기준일 기술적 지표
 * @param prices - 전체 가격 배열
 * @param referenceDateIndex - 기준일 인덱스
 * @returns 다이버전스 조건 발동 여부
 */
export function checkDivergenceCondition(
  metrics: TechnicalMetrics,
  prices: number[],
  referenceDateIndex: number
): boolean {
  if (metrics.disparity >= 20 || metrics.rsi14 < 60) {
    return false;
  }
  const divergence = detectBearishDivergence(prices, referenceDateIndex);
  return divergence.hasBearishDivergence;
}
