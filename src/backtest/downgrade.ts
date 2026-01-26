/**
 * SOXL 전략 하향 규칙
 * 특정 조건에서 전략을 한 단계 보수적으로 하향
 */
import type { StrategyName, TechnicalMetrics } from "./types";
import { detectBearishDivergence } from "./divergence";

/** 하향 적용 결과 */
export interface DowngradeResult {
  /** 하향된 전략 (하향 없으면 원본 그대로) */
  strategy: StrategyName;
  /** 하향이 적용되었는지 여부 */
  applied: boolean;
  /** 원본 전략 (하향 시에만 설정) */
  originalStrategy?: StrategyName;
  /** 하향 사유 목록 */
  reasons: string[];
}

/** 전략 하향 매핑 */
const DOWNGRADE_MAP: Record<StrategyName, StrategyName> = {
  Pro3: "Pro2",
  Pro2: "Pro1",
  Pro1: "Pro1", // Pro1은 그대로 유지
};

/**
 * SOXL 전략 하향 규칙 적용
 *
 * 2가지 조건 중 하나라도 충족 시 전략을 한 단계 하향 (중복 시 1회만):
 * - 조건 1: RSI >= 60 AND 역배열
 * - 조건 2: RSI 다이버전스 AND 이격도120+ (disparity >= 20%)
 *
 * @param strategy - 원본 추천 전략
 * @param metrics - 기준일 기술적 지표
 * @param prices - 전체 가격 배열
 * @param referenceDateIndex - 기준일 인덱스
 * @returns 하향 적용 결과
 */
export function applySOXLDowngrade(
  strategy: StrategyName,
  metrics: TechnicalMetrics,
  prices: number[],
  referenceDateIndex: number
): DowngradeResult {
  const downgradeReasons: string[] = [];

  // 조건 1: RSI >= 60 AND 역배열
  if (metrics.rsi14 >= 60 && !metrics.isGoldenCross) {
    downgradeReasons.push("RSI≥60 & 역배열");
  }

  // 조건 2: RSI 다이버전스 AND 이격도 < 120 AND 기준일 RSI >= 60
  if (metrics.disparity < 20 && metrics.rsi14 >= 60) {
    const divergence = detectBearishDivergence(prices, referenceDateIndex);
    if (divergence.hasBearishDivergence) {
      downgradeReasons.push("RSI 다이버전스 & 이격도<120");
    }
  }

  // 조건이 없으면 원본 그대로 반환
  if (downgradeReasons.length === 0) {
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
    reasons: downgradeReasons,
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
