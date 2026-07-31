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
  lastProcessedDate: string | null;
  lastViewedAt: string | null;
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
// 수익 기록 타입 (SPEC-TRADING-002)
// =====================================================

/**
 * 매도 체결 시 수익 기록
 */
export interface ProfitRecord {
  id: string;
  accountId: string;
  tier: number;
  ticker: Ticker;
  strategy: Strategy;
  buyDate: string;
  buyPrice: number;
  buyQuantity: number;
  sellDate: string;
  sellPrice: number;
  buyAmount: number;
  sellAmount: number;
  profit: number;
  profitRate: number;
  createdAt: string;
}

/**
 * 월별 수익 요약
 */
export interface MonthlyProfitSummary {
  yearMonth: string;
  records: ProfitRecord[];
  totalTrades: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalProfit: number;
  averageProfitRate: number;
}

/**
 * 수익 현황 API 응답
 */
export interface ProfitStatusResponse {
  accountId: string;
  months: MonthlyProfitSummary[];
  grandTotal: {
    totalTrades: number;
    totalBuyAmount: number;
    totalSellAmount: number;
    totalProfit: number;
    averageProfitRate: number;
  };
}
