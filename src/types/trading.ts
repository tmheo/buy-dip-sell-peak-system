/**
 * 트레이딩 페이지 타입 정의 (PRD-TRADING-001)
 */

// =====================================================
// 기본 열거형 타입
// =====================================================

export type Ticker = "SOXL" | "TQQQ";
export type Strategy = "Pro1" | "Pro2" | "Pro3";
export type OrderType = "BUY" | "SELL";
export type OrderMethod = "LOC" | "MOC";

// =====================================================
// 엔티티 인터페이스
// =====================================================

/**
 * 트레이딩 계좌
 */
export interface TradingAccount {
  id: string;
  userId: string;
  name: string;
  ticker: Ticker;
  seedCapital: number;
  strategy: Strategy;
  cycleStartDate: string;
  cycleNumber: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 티어별 보유 현황
 */
export interface TierHolding {
  id: string;
  accountId: string;
  tier: number;
  buyPrice: number | null;
  shares: number;
  buyDate: string | null;
  sellTargetPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 당일 주문표
 */
export interface DailyOrder {
  id: string;
  accountId: string;
  date: string;
  tier: number;
  type: OrderType;
  orderMethod: OrderMethod;
  limitPrice: number;
  shares: number;
  executed: boolean;
  createdAt: string;
  updatedAt: string;
}

// =====================================================
// 생성/수정 DTO
// =====================================================

/**
 * 트레이딩 계좌 생성 요청
 */
export interface CreateTradingAccountRequest {
  name: string;
  ticker: Ticker;
  seedCapital: number;
  strategy: Strategy;
  cycleStartDate: string;
}

/**
 * 트레이딩 계좌 수정 요청
 */
export interface UpdateTradingAccountRequest {
  name?: string;
  ticker?: Ticker;
  seedCapital?: number;
  strategy?: Strategy;
  cycleStartDate?: string;
}

// =====================================================
// 응답 타입
// =====================================================

/**
 * 계좌 상세 응답 (holdings 포함)
 */
export interface TradingAccountWithHoldings extends TradingAccount {
  holdings: TierHolding[];
  totalShares: number;
  isCycleInProgress: boolean;
}

// =====================================================
// 비즈니스 상수
// =====================================================

/**
 * Pro 전략 티어별 비율 (%)
 */
export const TIER_RATIOS: Record<Strategy, number[]> = {
  Pro1: [5, 10, 15, 20, 25, 25, 0], // 예비티어(7)는 0%
  Pro2: [10, 15, 20, 25, 20, 10, 0],
  Pro3: [16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 0], // 균등 분할
};

/**
 * Pro 전략 매수 임계값 (전일 종가 대비 %)
 */
export const BUY_THRESHOLDS: Record<Strategy, number> = {
  Pro1: -0.01,
  Pro2: -0.01,
  Pro3: -0.1,
};

/**
 * Pro 전략 매도 목표 (매수가 대비 %)
 */
export const SELL_THRESHOLDS: Record<Strategy, number> = {
  Pro1: 0.01,
  Pro2: 1.5,
  Pro3: 2.0,
};

/**
 * 티어 수
 */
export const TIER_COUNT = 7;
