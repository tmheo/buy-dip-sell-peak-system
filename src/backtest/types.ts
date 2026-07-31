/**
 * 백테스트 전용 타입 정의
 * SPEC-BACKTEST-001
 * SPEC-METRICS-001 기술적 지표
 */

import type { Strategy } from "@/types/trading";

// ============================================================
// 타입 정의
// ============================================================

/**
 * 전략별 테마 색상
 * UI 컴포넌트에서 일관된 색상 사용을 위한 상수
 */
export const STRATEGY_COLORS: Record<Strategy, string> = {
  Pro1: "#268bd2",
  Pro2: "#2aa198",
  Pro3: "#6c71c4",
};

/**
 * 기술적 지표 인터페이스
 * SPEC-METRICS-001
 */
export interface TechnicalMetrics {
  // 골든크로스 지표: (MA20 - MA60) / MA60 × 100
  goldenCross: number;
  // 정배열 여부: MA20 > MA60 (짧은 백테스트 기간에도 표시)
  isGoldenCross: boolean;
  // MA 기울기: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100
  maSlope: number;
  // 이격도: (adjClose - MA20) / MA20 × 100
  disparity: number;
  // RSI 14일 (Wilder's EMA 방식)
  rsi14: number;
  // 12일 변화율
  roc12: number;
  // 20일 일별 표준편차
  volatility20: number;
}

/**
 * 전략 결정에 담기는 기준일 지표 (TechnicalMetrics의 좁은 투영)
 */
export interface StrategyDecisionMetrics {
  // RSI 14일 (Wilder's EMA 방식)
  rsi14: number;
  // 정배열 여부: MA20 > MA60
  isGoldenCross: boolean;
}

/**
 * 전략 결정
 * 전략 결정 공급자(StrategyProvider)가 기준일에 대해 반환하는 전략·사유·지표
 */
export interface StrategyDecision {
  // 결정된 전략
  strategy: Strategy;
  // 결정 사유
  reason: string;
  // 기준일 지표
  metrics: StrategyDecisionMetrics;
}

/**
 * 전략 결정 공급자 (이슈 #61에서 확정한 분리 경계 계약)
 * (기준일, 사이클 번호) → 전략 결정. 기준일은 항상 전일 종가 기준일이다.
 * 엔진이 호출하는 시점 세 가지: 백테스트 시작 전날, 사이클 완료 익일,
 * 사이클 내 첫 매수 전 매일(재평가).
 */
export type StrategyProvider = (
  referenceDate: string,
  cycleNumber: number
) => Promise<StrategyDecision>;

/**
 * 사이클별 전략 정보
 * 각 사이클에서 어떤 전략이 사용되었는지 추적
 */
export interface CycleStrategyInfo {
  // 사이클 번호
  cycleNumber: number;
  // 해당 사이클에서 사용한 전략
  strategy: Strategy;
  // 사이클 시작일 (첫 매수 전까지는 재평가일로 갱신된다)
  startDate: string;
  // 사이클 종료일 (진행 중이면 null)
  endDate: string | null;
  // 사이클 자본 (사이클 시작 시점에 정해져 사이클 동안 고정)
  initialCapital: number;
  // 사이클 종료 시 자산 (진행 중이면 null)
  finalAsset: number | null;
  // 사이클 수익률 (진행 중이면 null)
  returnRate: number | null;
  // 사이클 MDD (진행 중이면 현재까지 MDD)
  mdd: number;
  // 시작일 RSI 14
  startRsi: number;
  // 시작일 정배열 여부 (MA20 > MA60)
  isGoldenCross: boolean;
  // 전략 결정 사유 (고정 전략 실행이면 "고정 전략")
  recommendReason: string;
}

/**
 * 전략별 사용 통계
 */
export interface StrategyUsageStats {
  // 사용된 사이클 수
  cycles: number;
  // 총 사용 일수
  totalDays: number;
}

/**
 * 백테스트 요청 인터페이스
 */
export interface BacktestRequest {
  // 티커 심볼
  ticker: string;
  // 전략 이름
  strategy: Strategy;
  // 시작 날짜 (YYYY-MM-DD)
  startDate: string;
  // 종료 날짜 (YYYY-MM-DD)
  endDate: string;
  // 초기 투자금
  initialCapital: number;
}

/**
 * 잔여 티어 정보 인터페이스
 * 백테스트 종료 시점에 아직 매도되지 않은 보유 주식 정보
 */
export interface RemainingTier {
  // 티어 번호
  tier: number;
  // 매수 수량
  shares: number;
  // 매수 체결가
  buyPrice: number;
  // 매수 체결일
  buyDate: string;
  // 현재가 (백테스트 종료일 종가)
  currentPrice: number;
  // 평가 금액 (현재가 × 수량)
  currentValue: number;
  // 수익/손실 금액
  profitLoss: number;
  // 수익률 (소수점)
  returnRate: number;
}

/**
 * 일별 기술적 지표 인터페이스
 * 차트용 일별 지표 데이터
 */
export interface DailyTechnicalMetrics {
  // 날짜
  date: string;
  // 골든크로스 지표: (MA20 - MA60) / MA60 × 100
  goldenCross: number | null;
  // MA 기울기: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100
  maSlope: number | null;
  // 이격도: (adjClose - MA20) / MA20 × 100
  disparity: number | null;
  // RSI 14일 (Wilder's EMA 방식)
  rsi14: number | null;
  // 12일 변화율
  roc12: number | null;
  // 20일 일별 표준편차
  volatility20: number | null;
}

/**
 * 백테스트 결과 인터페이스
 */
export interface BacktestResult {
  // 전략 이름
  strategy: Strategy;
  // 시작 날짜
  startDate: string;
  // 종료 날짜
  endDate: string;
  // 초기 투자금
  initialCapital: number;
  // 최종 자산
  finalAsset: number;
  // 수익률 (소수점)
  returnRate: number;
  // 연평균 수익률 (CAGR, 소수점)
  cagr: number;
  // 최대 낙폭 (MDD, 소수점)
  mdd: number;
  // 총 사이클 수
  totalCycles: number;
  // 승률 (소수점)
  winRate: number;
  // 일별 스냅샷 히스토리
  dailyHistory: DailySnapshot[];
  // 잔여 티어 (백테스트 종료 시 미매도 보유 주식)
  remainingTiers: RemainingTier[];
  // 완료된 사이클별 수익 (완료 시점 전략 포함)
  completedCycles: { profit: number; strategy: Strategy }[];
  // 종료 시점 기술적 지표 (데이터 부족 시 null) - SPEC-METRICS-001
  technicalMetrics: TechnicalMetrics | null;
  // 일별 기술적 지표 배열 (차트용)
  dailyTechnicalMetrics: DailyTechnicalMetrics[];
  // 사이클별 전략 정보 (고정 전략 실행은 사유 "고정 전략")
  cycleStrategies: CycleStrategyInfo[];
  // 전략별 사용 통계
  strategyStats: Record<Strategy, StrategyUsageStats>;
}

/**
 * 일별 스냅샷 인터페이스
 */
export interface DailySnapshot {
  // 날짜
  date: string;
  // 시가
  open: number;
  // 고가
  high: number;
  // 저가
  low: number;
  // 종가 (실제 거래 체결 시 사용되는 가격)
  close: number;
  // 수정종가 (주식분할, 배당 등 반영, 수익률 계산에 사용)
  adjClose: number;
  // 현재 예수금
  cash: number;
  // 보유 주식 총 가치 (수정종가 기준, 수익률 계산용)
  holdingsValue: number;
  // 총 자산 (예수금 + 보유 주식 가치)
  totalAsset: number;
  // 당일 거래 내역 (체결된 거래만)
  trades: TradeAction[];
  // 당일 주문 내역 (체결/미체결 모두 포함)
  orders: OrderAction[];
  // 활성 티어 수
  activeTiers: number;
  // 총 보유 주식 수
  totalShares: number;
  // 현재 사이클 번호
  cycleNumber: number;
  // 해당 일자에 사용 중인 전략
  strategy: Strategy;
  // 20일 단순이동평균 (데이터 부족 시 null) - SPEC-METRICS-001
  ma20: number | null;
  // 60일 단순이동평균 (데이터 부족 시 null) - SPEC-METRICS-001
  ma60: number | null;
}

/**
 * 거래 행동 인터페이스
 */
export interface TradeAction {
  // 거래 유형
  type: "BUY" | "SELL" | "STOP_LOSS";
  // 티어 번호
  tier: number;
  // 체결가
  price: number;
  // 수량
  shares: number;
  // 거래 금액
  amount: number;
  // 거래 시간 (LOC/MOC)
  orderType: "LOC" | "MOC";
}

/**
 * 주문 상태 인터페이스
 * 체결 여부와 관계없이 모든 주문을 추적
 */
export interface OrderAction {
  // 주문 유형 (BUY: 매수, SELL: 매도)
  type: "BUY" | "SELL";
  // 티어 번호
  tier: number;
  // 지정가
  limitPrice: number;
  // 주문 수량
  shares: number;
  // 주문 금액
  amount: number;
  // 주문 방식 (LOC/MOC)
  orderType: "LOC" | "MOC";
  // 체결 여부
  executed: boolean;
  // 체결가 (체결된 경우에만)
  executedPrice?: number;
  // 체결 금액 (체결된 경우에만)
  executedAmount?: number;
  // 미체결 사유 (미체결인 경우에만)
  reason?: string;
}
