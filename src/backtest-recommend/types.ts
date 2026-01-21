/**
 * 추천 전략 백테스트 전용 타입 정의
 * 사이클마다 추천 전략이 동적으로 변경되는 백테스트
 */
import type {
  DailySnapshot,
  StrategyName,
  TechnicalMetrics,
  DailyTechnicalMetrics,
  RemainingTier,
} from "@/backtest/types";

// ============================================================
// 사이클 전략 정보
// ============================================================

/**
 * 사이클별 전략 정보
 * 각 사이클에서 어떤 전략이 사용되었는지 추적
 */
export interface CycleStrategyInfo {
  /** 사이클 번호 */
  cycleNumber: number;
  /** 해당 사이클에서 사용한 전략 */
  strategy: StrategyName;
  /** 사이클 시작일 */
  startDate: string;
  /** 사이클 종료일 (진행 중이면 null) */
  endDate: string | null;
  /** 사이클 시작 시 자본금 */
  initialCapital: number;
  /** 사이클 종료 시 자산 (진행 중이면 null) */
  finalAsset: number | null;
  /** 사이클 수익률 (진행 중이면 null) */
  returnRate: number | null;
  /** 사이클 MDD (진행 중이면 현재까지 MDD) */
  mdd: number;
  /** 시작일 RSI 14 */
  startRsi: number;
  /** 시작일 정배열 여부 (MA20 > MA60) */
  isGoldenCross: boolean;
  /** 추천 이유 (recommendation API에서 받은 reason) */
  recommendReason: string;
}

// ============================================================
// 일별 스냅샷 확장
// ============================================================

/**
 * 전략 정보가 포함된 일별 스냅샷
 * 기존 DailySnapshot에 사용 중인 전략 정보 추가
 */
export interface DailySnapshotWithStrategy extends DailySnapshot {
  /** 해당 일자에 사용 중인 전략 */
  strategy: StrategyName;
}

// ============================================================
// 요청/응답 타입
// ============================================================

/**
 * 추천 전략 백테스트 요청
 */
export interface RecommendBacktestRequest {
  /** 티커 심볼 */
  ticker: "SOXL" | "TQQQ";
  /** 시작 날짜 (YYYY-MM-DD) */
  startDate: string;
  /** 종료 날짜 (YYYY-MM-DD) */
  endDate: string;
  /** 초기 투자금 */
  initialCapital: number;
}

/**
 * 전략별 사용 통계
 */
export interface StrategyUsageStats {
  /** 사용된 사이클 수 */
  cycles: number;
  /** 총 사용 일수 */
  totalDays: number;
}

/**
 * 추천 전략 백테스트 결과
 */
export interface RecommendBacktestResult {
  /** 시작 날짜 */
  startDate: string;
  /** 종료 날짜 */
  endDate: string;
  /** 초기 투자금 */
  initialCapital: number;
  /** 최종 자산 */
  finalAsset: number;
  /** 총 수익률 (소수점) */
  returnRate: number;
  /** 연평균 수익률 (CAGR, 소수점) */
  cagr: number;
  /** 최대 낙폭 (MDD, 소수점) */
  mdd: number;
  /** 총 사이클 수 */
  totalCycles: number;
  /** 승률 (소수점) */
  winRate: number;
  /** 사이클별 전략 정보 */
  cycleStrategies: CycleStrategyInfo[];
  /** 일별 스냅샷 히스토리 (전략 정보 포함) */
  dailyHistory: DailySnapshotWithStrategy[];
  /** 잔여 티어 (백테스트 종료 시 미매도 보유 주식) */
  remainingTiers: RemainingTier[];
  /** 완료된 사이클별 수익 */
  completedCycles: { profit: number; strategy: StrategyName }[];
  /** 종료 시점 기술적 지표 */
  technicalMetrics: TechnicalMetrics | null;
  /** 일별 기술적 지표 배열 (차트용) */
  dailyTechnicalMetrics: DailyTechnicalMetrics[];
  /** 전략별 사용 통계 */
  strategyStats: {
    Pro1: StrategyUsageStats;
    Pro2: StrategyUsageStats;
    Pro3: StrategyUsageStats;
  };
}

// ============================================================
// 추천 헬퍼 타입
// ============================================================

/**
 * 빠른 추천 결과
 * 백테스트 중 사이클 경계에서 사용
 */
export interface QuickRecommendResult {
  /** 추천 전략 */
  strategy: StrategyName;
  /** 추천 이유 */
  reason: string;
  /** 기준일 기술적 지표 */
  metrics: TechnicalMetrics;
}
