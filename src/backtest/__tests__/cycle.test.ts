/**
 * cycle.ts 단위 테스트
 * SPEC-BACKTEST-001 REQ-006, REQ-007, REQ-008
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CycleManager } from "../cycle";
import { getStrategy } from "../strategy";
import type { StrategyConfig } from "../types";

describe("CycleManager", () => {
  let strategy: StrategyConfig;
  const initialCapital = 10000;

  beforeEach(() => {
    strategy = getStrategy("Pro2");
  });

  describe("constructor", () => {
    it("초기 자본금과 전략으로 생성되어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getCash()).toBe(initialCapital);
      expect(manager.getCycleNumber()).toBe(1);
    });

    it("dayCount가 0으로 시작해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getDayCount()).toBe(0);
    });

    it("모든 티어가 비활성화 상태여야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      const activeTiers = manager.getActiveTiers();
      expect(activeTiers.length).toBe(0);
    });
  });

  describe("getNextBuyTier", () => {
    it("처음에는 티어 1을 반환해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getNextBuyTier()).toBe(1);
    });

    it("티어 1이 활성화되면 티어 2를 반환해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0);
      expect(manager.getNextBuyTier()).toBe(2);
    });

    it("티어 1-6이 모두 활성화되면 null을 반환해야 한다 (예수금 없을 때)", () => {
      const manager = new CycleManager(6000, strategy, "2025-01-02");
      for (let i = 1; i <= 6; i++) {
        manager.activateTier(i, 100, 10, "2025-01-02", 0);
      }
      expect(manager.getNextBuyTier()).toBe(null);
    });

    it("티어 1-6이 활성화되고 예수금이 있으면 티어 7을 반환해야 한다", () => {
      const manager = new CycleManager(10000, strategy, "2025-01-02");
      // 각 티어에 1000씩 사용 가정
      for (let i = 1; i <= 6; i++) {
        manager.activateTier(i, 100, 10, "2025-01-02", 0); // 100 * 10 = 1000
      }
      // 10000 - 6000 = 4000 예수금 남음
      expect(manager.getNextBuyTier()).toBe(7);
    });
  });

  describe("getTierAmount", () => {
    it("Pro2 전략 티어 1은 초기자본의 10%이어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getTierAmount(1)).toBe(1000); // 10000 * 0.1
    });

    it("Pro2 전략 티어 2는 초기자본의 15%이어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getTierAmount(2)).toBe(1500); // 10000 * 0.15
    });

    it("Pro2 전략 티어 3는 초기자본의 20%이어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getTierAmount(3)).toBe(2000); // 10000 * 0.20
    });

    it("Pro2 전략 티어 4는 초기자본의 25%이어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getTierAmount(4)).toBe(2500); // 10000 * 0.25
    });

    it("Pro2 전략 티어 5는 초기자본의 20%이어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getTierAmount(5)).toBe(2000); // 10000 * 0.20
    });

    it("Pro2 전략 티어 6는 초기자본의 10%이어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getTierAmount(6)).toBe(1000); // 10000 * 0.10
    });

    it("티어 7(예비)은 잔여 예수금 전액이어야 한다", () => {
      const manager = new CycleManager(10000, strategy, "2025-01-02");
      // 티어 1-6 활성화 (각 1000씩)
      for (let i = 1; i <= 6; i++) {
        manager.activateTier(i, 100, 10, "2025-01-02", 0);
      }
      // 잔여 예수금 = 10000 - 6000 = 4000
      expect(manager.getTierAmount(7)).toBe(4000);
    });
  });

  describe("activateTier", () => {
    it("티어를 활성화하면 예수금이 감소해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0); // 100 * 10 = 1000
      expect(manager.getCash()).toBe(9000);
    });

    it("활성화된 티어 정보가 저장되어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-03", 1);
      const activeTiers = manager.getActiveTiers();
      expect(activeTiers.length).toBe(1);
      expect(activeTiers[0].tier).toBe(1);
      expect(activeTiers[0].buyPrice).toBe(100);
      expect(activeTiers[0].shares).toBe(10);
      expect(activeTiers[0].buyDate).toBe("2025-01-03");
    });
  });

  describe("deactivateTier", () => {
    it("티어를 비활성화하면 수익이 예수금에 추가되어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0); // 1000 투자
      // 매도: 110 * 10 = 1100
      const profit = manager.deactivateTier(1, 110);
      expect(profit).toBe(100); // 1100 - 1000 = 100 수익
      expect(manager.getCash()).toBe(10100); // 9000 + 1100
    });

    it("손실 시 음수 수익을 반환해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0);
      const profit = manager.deactivateTier(1, 90); // 90 * 10 = 900
      expect(profit).toBe(-100); // 900 - 1000 = -100 손실
      expect(manager.getCash()).toBe(9900);
    });

    it("비활성화 후 티어가 제거되어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0);
      manager.deactivateTier(1, 110);
      expect(manager.getActiveTiers().length).toBe(0);
    });
  });

  describe("incrementDay", () => {
    it("dayCount가 1 증가해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.incrementDay();
      expect(manager.getDayCount()).toBe(1);
    });

    it("여러 번 호출 시 누적되어야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      for (let i = 0; i < 5; i++) {
        manager.incrementDay();
      }
      expect(manager.getDayCount()).toBe(5);
    });
  });

  describe("getActiveTiers", () => {
    it("활성화된 티어만 반환해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0);
      manager.activateTier(2, 95, 15, "2025-01-03", 1);
      const activeTiers = manager.getActiveTiers();
      expect(activeTiers.length).toBe(2);
      expect(activeTiers.map((t) => t.tier)).toEqual([1, 2]);
    });
  });

  describe("getTotalAsset", () => {
    it("현재 가격으로 총 자산을 계산해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0); // 1000 투자, 9000 예수금
      // 현재가 110일 때: 9000 + (10 * 110) = 9000 + 1100 = 10100
      expect(manager.getTotalAsset(110)).toBe(10100);
    });

    it("여러 티어의 총 자산을 계산해야 한다", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0); // 1000 투자
      manager.activateTier(2, 95, 20, "2025-01-03", 1); // 1900 투자
      // 예수금: 10000 - 1000 - 1900 = 7100
      // 현재가 100일 때: 7100 + (10 * 100) + (20 * 100) = 7100 + 1000 + 2000 = 10100
      expect(manager.getTotalAsset(100)).toBe(10100);
    });

    it("보유 주식이 없으면 예수금만 반환", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.getTotalAsset(100)).toBe(10000);
    });
  });

  describe("REQ-007: 사이클 종료 및 풀복리", () => {
    it("isCycleComplete는 모든 티어가 매도되면 true", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      // 티어 1 매수 후 매도
      manager.activateTier(1, 100, 10, "2025-01-02", 0);
      expect(manager.isCycleComplete()).toBe(false);
      manager.deactivateTier(1, 110);
      expect(manager.isCycleComplete()).toBe(true);
    });

    it("endCycle 후 startNewCycle로 풀복리 적용", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0); // 1000 투자
      manager.deactivateTier(1, 110); // 1100 회수 -> 수익 100
      // 현재 예수금: 10100
      manager.endCycle();
      manager.startNewCycle("2025-01-10");
      // 새 사이클의 초기자본 = 이전 사이클 종료 시 총 자산 = 10100
      expect(manager.getCycleNumber()).toBe(2);
      expect(manager.getCash()).toBe(10100);
      expect(manager.getDayCount()).toBe(0);
    });

    it("새 사이클에서 티어 금액이 새 초기자본 기준으로 계산", () => {
      const manager = new CycleManager(10000, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0);
      manager.deactivateTier(1, 110);
      manager.endCycle();
      manager.startNewCycle("2025-01-10");
      // 새 초기자본 = 10100, 티어 1 = 10% = 1010
      expect(manager.getTierAmount(1)).toBe(1010);
    });
  });

  describe("hasTradedThisCycle", () => {
    it("거래가 없으면 false", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      expect(manager.hasTradedThisCycle()).toBe(false);
    });

    it("티어 활성화 후 true", () => {
      const manager = new CycleManager(initialCapital, strategy, "2025-01-02");
      manager.activateTier(1, 100, 10, "2025-01-02", 0);
      expect(manager.hasTradedThisCycle()).toBe(true);
    });
  });
});
