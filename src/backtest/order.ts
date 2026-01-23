/**
 * LOC/MOC 주문 계산 함수
 * SPEC-BACKTEST-001 REQ-002, REQ-003, REQ-004, REQ-005
 *
 * 이 파일은 공통 유틸리티 모듈의 함수들을 re-export합니다.
 * 백테스트 코드의 기존 import 경로를 유지하면서 중복 코드를 제거합니다.
 */

export {
  floorToDecimal,
  roundToDecimal,
  calculateBuyLimitPrice,
  calculateSellLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
} from "@/utils/trading-core";
