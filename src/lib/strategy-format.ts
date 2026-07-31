/**
 * 전략 파라미터 표시 형식 헬퍼
 * UI가 src/strategy의 전략 파라미터 표에서 표시 문자열을 파생할 때 사용한다 (#43).
 * 파라미터 수치를 UI에 하드코딩하지 않기 위한 공용 변환 함수.
 */
import type { StrategyParams } from "@/strategy";

/**
 * 임계값(소수 비율)을 부호 있는 퍼센트 문자열로 변환
 * 예: 0.015 → "+1.50%", -0.0001 → "-0.01%"
 */
export function formatThresholdPercent(threshold: number): string {
  const percent = threshold * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

/**
 * 티어 비율(소수)을 퍼센트 문자열 배열로 변환
 * 예: [0.05, 0.1, ...] → ["5.0%", "10.0%", ...]
 */
export function formatTierRatiosPercent(params: StrategyParams): string[] {
  return params.tierRatios.map((ratio) => `${(ratio * 100).toFixed(1)}%`);
}
