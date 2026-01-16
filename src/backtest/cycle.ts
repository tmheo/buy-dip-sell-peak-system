/**
 * 사이클 상태 관리
 * SPEC-BACKTEST-001 REQ-006, REQ-007, REQ-008
 */
import type { StrategyConfig, TierState } from "./types";
import { calculateSellLimitPrice, floorToDecimal } from "./order";

/**
 * 사이클 관리 클래스
 * 티어 매수/매도, 예수금 관리, 사이클 종료/시작을 담당
 */
export class CycleManager {
  private cycleNumber: number = 1;
  private startDate: string;
  private initialCapital: number;
  private cash: number;
  private dayCount: number = 0;
  private tiers: Map<number, TierState> = new Map();
  private strategy: StrategyConfig;
  private hasTraded: boolean = false;
  private cycleInitialCapital: number;

  /**
   * 사이클 관리자 생성
   *
   * @param initialCapital - 초기 투자금
   * @param strategy - 전략 설정
   * @param startDate - 사이클 시작일
   */
  constructor(initialCapital: number, strategy: StrategyConfig, startDate: string) {
    this.initialCapital = initialCapital;
    this.cycleInitialCapital = initialCapital;
    this.cash = initialCapital;
    this.strategy = strategy;
    this.startDate = startDate;
  }

  /**
   * 현재 예수금 반환
   */
  getCash(): number {
    return floorToDecimal(this.cash, 2);
  }

  /**
   * 현재 사이클 번호 반환
   */
  getCycleNumber(): number {
    return this.cycleNumber;
  }

  /**
   * 현재 경과 일수 반환
   */
  getDayCount(): number {
    return this.dayCount;
  }

  /**
   * 다음 매수할 티어 번호 반환
   * 티어 1-6이 모두 활성화되고 예수금이 있으면 티어 7(예비) 반환
   *
   * @returns 다음 티어 번호 또는 null (매수 불가)
   */
  getNextBuyTier(): number | null {
    // 티어 1-6 중 비활성화된 티어 찾기
    for (let i = 1; i <= 6; i++) {
      if (!this.tiers.has(i)) {
        return i;
      }
    }

    // REQ-008: 티어 1-6 모두 활성화 + 예수금 존재 시 티어 7
    if (this.cash > 0 && !this.tiers.has(7)) {
      return 7;
    }

    return null;
  }

  /**
   * 특정 티어의 투자 금액 반환
   * 티어 7은 잔여 예수금 전액
   *
   * @param tier - 티어 번호 (1-7)
   * @returns 투자 금액
   */
  getTierAmount(tier: number): number {
    if (tier === 7) {
      // REQ-008: 티어 7은 잔여 예수금 전액
      return floorToDecimal(this.cash, 2);
    }

    if (tier < 1 || tier > 6) {
      throw new Error(`Invalid tier number: ${tier}`);
    }

    const ratio = this.strategy.tierRatios[tier - 1];
    return floorToDecimal(this.cycleInitialCapital * ratio, 2);
  }

  /**
   * 티어 활성화 (매수 체결)
   *
   * @param tier - 티어 번호
   * @param buyPrice - 매수 체결가
   * @param shares - 매수 수량
   * @param date - 매수 체결일
   * @param dayIndex - 매수 시점의 거래일 인덱스
   */
  activateTier(
    tier: number,
    buyPrice: number,
    shares: number,
    date: string,
    dayIndex: number
  ): void {
    const cost = buyPrice * shares;
    this.cash -= cost;
    this.hasTraded = true;

    const sellLimitPrice = calculateSellLimitPrice(buyPrice, this.strategy.sellThreshold);

    this.tiers.set(tier, {
      tier,
      isActive: true,
      buyPrice,
      shares,
      buyDate: date,
      buyDayIndex: dayIndex,
      sellLimitPrice,
    });
  }

  /**
   * 티어 비활성화 (매도 체결)
   *
   * @param tier - 티어 번호
   * @param sellPrice - 매도 체결가
   * @returns 수익 (양수) 또는 손실 (음수)
   */
  deactivateTier(tier: number, sellPrice: number): number {
    const tierState = this.tiers.get(tier);
    if (!tierState) {
      throw new Error(`Tier ${tier} is not active`);
    }

    const proceeds = sellPrice * tierState.shares;
    const cost = tierState.buyPrice * tierState.shares;
    const profit = proceeds - cost;

    this.cash += proceeds;
    this.tiers.delete(tier);

    return floorToDecimal(profit, 2);
  }

  /**
   * 경과 일수 증가
   */
  incrementDay(): void {
    this.dayCount++;
  }

  /**
   * REQ-006: 손절일 도달 여부 확인 (사이클 전체 기준 - deprecated)
   *
   * @returns 손절일 이상이면 true
   * @deprecated 각 티어별 손절일 확인은 getTiersAtStopLossDay 사용
   */
  isStopLossDay(): boolean {
    return this.dayCount >= this.strategy.stopLossDay;
  }

  /**
   * REQ-006: 현재 거래일 기준으로 손절일에 도달한 티어 목록 반환
   * 각 티어의 매수 거래일로부터 손절일이 경과한 티어만 반환 (거래일 기준)
   *
   * @param currentDayIndex - 현재 거래일 인덱스
   * @returns 손절일에 도달한 티어 목록
   */
  getTiersAtStopLossDay(currentDayIndex: number): TierState[] {
    const result: TierState[] = [];

    for (const tier of this.tiers.values()) {
      // 보유일 계산: (현재 거래일 - 매수 거래일) + 1 (매수 당일 = 1일)
      const holdingDays = currentDayIndex - tier.buyDayIndex + 1;

      if (holdingDays >= this.strategy.stopLossDay) {
        result.push(tier);
      }
    }

    return result;
  }

  /**
   * 활성화된 티어 목록 반환
   */
  getActiveTiers(): TierState[] {
    return Array.from(this.tiers.values());
  }

  /**
   * 현재가 기준 총 자산 계산
   *
   * @param currentPrice - 현재 주가
   * @returns 총 자산 (예수금 + 보유 주식 가치)
   */
  getTotalAsset(currentPrice: number): number {
    let holdingsValue = 0;
    for (const tier of this.tiers.values()) {
      holdingsValue += tier.shares * currentPrice;
    }
    return floorToDecimal(this.cash + holdingsValue, 2);
  }

  /**
   * REQ-007: 사이클 완료 여부 확인
   * 한 번이라도 거래했고 현재 활성 티어가 없으면 사이클 완료
   */
  isCycleComplete(): boolean {
    return this.hasTraded && this.tiers.size === 0;
  }

  /**
   * 이번 사이클에 거래가 있었는지 확인
   */
  hasTradedThisCycle(): boolean {
    return this.hasTraded;
  }

  /**
   * REQ-007: 사이클 종료
   */
  endCycle(): void {
    // 사이클 종료 시점의 총 자산 = 현재 예수금 (모든 티어 매도 완료 상태)
    // 다음 사이클에서 사용할 초기자본으로 저장
  }

  /**
   * REQ-007: 새 사이클 시작 (풀복리)
   * 이전 사이클 종료 시 총 자산을 새 사이클의 초기자본으로 사용
   *
   * @param startDate - 새 사이클 시작일
   */
  startNewCycle(startDate: string): void {
    this.cycleNumber++;
    this.cycleInitialCapital = this.cash; // 풀복리: 현재 예수금이 새 초기자본
    this.dayCount = 0;
    this.startDate = startDate;
    this.hasTraded = false;
    this.tiers.clear();
  }

  /**
   * 현재 사이클 시작일 반환
   */
  getStartDate(): string {
    return this.startDate;
  }

  /**
   * 현재 사이클 초기자본 반환
   */
  getCycleInitialCapital(): number {
    return this.cycleInitialCapital;
  }
}
