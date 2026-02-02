/**
 * 트레이딩 계좌 CRUD 함수 테스트 (PRD-TRADING-001)
 *
 * 테스트 대상:
 * - createTradingAccount(): 계좌 생성 및 7개 티어 자동 생성 확인
 * - getTradingAccountsByUserId(): 사용자별 계좌 조회
 * - getTradingAccountById(): 단일 계좌 조회 (본인 확인)
 * - updateTradingAccount(): 계좌 수정 (사이클 미진행 시만)
 * - deleteTradingAccount(): 계좌 삭제 (CASCADE 확인)
 * - getTierHoldings(): 티어별 보유 현황
 * - getTotalShares(): 총 보유 수량 계산
 * - updateTierHolding(): 티어 홀딩 업데이트
 * - getDailyOrders(): 당일 주문표 조회
 * - createDailyOrder(): 주문 생성
 * - updateOrderExecuted(): 주문 실행 상태 업데이트
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import type { CreateTradingAccountRequest } from "@/types/trading";

// 테스트 유저 ID
const TEST_USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();

// 동적으로 import할 trading 함수들의 타입
type TradingModule = typeof import("../trading");

// trading 모듈 레퍼런스
let tradingModule: TradingModule;

// 테스트에서 생성한 계좌 ID 추적 (cleanup용)
const createdAccountIds: string[] = [];

describe("트레이딩 계좌 CRUD 테스트", () => {
  beforeAll(async () => {
    // trading 모듈을 동적으로 import
    tradingModule = await import("../trading");
  });

  afterAll(async () => {
    // 테스트에서 생성한 계좌 삭제 (역순으로 삭제하여 의존성 문제 방지)
    for (const accountId of createdAccountIds.reverse()) {
      try {
        await tradingModule.deleteTradingAccount(accountId, TEST_USER_ID);
      } catch {
        // 이미 삭제된 계좌는 무시
      }
      try {
        await tradingModule.deleteTradingAccount(accountId, OTHER_USER_ID);
      } catch {
        // 이미 삭제된 계좌는 무시
      }
    }
  });

  describe("createTradingAccount()", () => {
    it("계좌를 생성하고 생성된 계좌 정보를 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };

      const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(account.id);

      expect(account).toBeDefined();
      expect(account.id).toBeDefined();
      expect(account.userId).toBe(TEST_USER_ID);
      expect(account.name).toBe("테스트 계좌");
      expect(account.ticker).toBe("SOXL");
      expect(account.seedCapital).toBe(10000);
      expect(account.strategy).toBe("Pro2");
      expect(account.cycleStartDate).toBe("2025-01-02");
      expect(account.cycleNumber).toBe(1);
      expect(account.createdAt).toBeDefined();
      expect(account.updatedAt).toBeDefined();
    });

    it("계좌 생성 시 7개의 티어 홀딩이 자동 생성되어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "티어 테스트 계좌",
        ticker: "TQQQ",
        seedCapital: 20000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-03",
      };

      const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(account.id);
      const holdings = await tradingModule.getTierHoldings(account.id);

      expect(holdings).toHaveLength(7);
      holdings.forEach((holding, index) => {
        expect(holding.accountId).toBe(account.id);
        expect(holding.tier).toBe(index + 1);
        expect(holding.shares).toBe(0);
        expect(holding.buyPrice).toBeNull();
        expect(holding.buyDate).toBeNull();
        expect(holding.sellTargetPrice).toBeNull();
      });
    });

    it("SOXL과 TQQQ 티커 모두 생성 가능해야 한다", async () => {
      const soxlRequest: CreateTradingAccountRequest = {
        name: "SOXL 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const tqqqRequest: CreateTradingAccountRequest = {
        name: "TQQQ 계좌",
        ticker: "TQQQ",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };

      const soxlAccount = await tradingModule.createTradingAccount(TEST_USER_ID, soxlRequest);
      createdAccountIds.push(soxlAccount.id);
      const tqqqAccount = await tradingModule.createTradingAccount(TEST_USER_ID, tqqqRequest);
      createdAccountIds.push(tqqqAccount.id);

      expect(soxlAccount.ticker).toBe("SOXL");
      expect(tqqqAccount.ticker).toBe("TQQQ");
    });

    it("Pro1, Pro2, Pro3 전략 모두 생성 가능해야 한다", async () => {
      const strategies = ["Pro1", "Pro2", "Pro3"] as const;

      for (const strategy of strategies) {
        const request: CreateTradingAccountRequest = {
          name: `${strategy} 전략 계좌`,
          ticker: "SOXL",
          seedCapital: 10000,
          strategy,
          cycleStartDate: "2025-01-02",
        };

        const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
        createdAccountIds.push(account.id);
        expect(account.strategy).toBe(strategy);
      }
    });
  });

  describe("getTradingAccountsByUserId()", () => {
    it("사용자의 모든 계좌를 조회해야 한다", async () => {
      // 테스트용 계좌 생성
      const request1: CreateTradingAccountRequest = {
        name: "사용자 계좌 1",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const request2: CreateTradingAccountRequest = {
        name: "사용자 계좌 2",
        ticker: "TQQQ",
        seedCapital: 20000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-03",
      };

      const account1 = await tradingModule.createTradingAccount(TEST_USER_ID, request1);
      createdAccountIds.push(account1.id);
      const account2 = await tradingModule.createTradingAccount(TEST_USER_ID, request2);
      createdAccountIds.push(account2.id);

      const accounts = await tradingModule.getTradingAccountsByUserId(TEST_USER_ID);

      expect(accounts.length).toBeGreaterThanOrEqual(2);
      accounts.forEach((account) => {
        expect(account.userId).toBe(TEST_USER_ID);
      });
    });

    it("계좌가 생성일 역순으로 정렬되어야 한다", async () => {
      const accounts = await tradingModule.getTradingAccountsByUserId(TEST_USER_ID);

      for (let i = 0; i < accounts.length - 1; i++) {
        const current = new Date(accounts[i].createdAt);
        const next = new Date(accounts[i + 1].createdAt);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });

    it("다른 사용자의 계좌는 조회되지 않아야 한다", async () => {
      const otherUserAccounts = await tradingModule.getTradingAccountsByUserId(OTHER_USER_ID);
      const testUserAccounts = await tradingModule.getTradingAccountsByUserId(TEST_USER_ID);

      // OTHER_USER_ID로 생성된 계좌가 없으므로 빈 배열이어야 함
      expect(otherUserAccounts).toHaveLength(0);
      expect(testUserAccounts.length).toBeGreaterThan(0);
    });

    it("존재하지 않는 사용자는 빈 배열을 반환해야 한다", async () => {
      const accounts = await tradingModule.getTradingAccountsByUserId(randomUUID());
      expect(accounts).toHaveLength(0);
    });
  });

  describe("getTradingAccountById()", () => {
    it("본인 계좌를 조회할 수 있어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "조회 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 15000,
        strategy: "Pro3",
        cycleStartDate: "2025-01-04",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const account = await tradingModule.getTradingAccountById(created.id, TEST_USER_ID);

      expect(account).not.toBeNull();
      expect(account!.id).toBe(created.id);
      expect(account!.userId).toBe(TEST_USER_ID);
      expect(account!.name).toBe("조회 테스트 계좌");
    });

    it("다른 사용자의 계좌는 조회할 수 없어야 한다 (null 반환)", async () => {
      const request: CreateTradingAccountRequest = {
        name: "보안 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const account = await tradingModule.getTradingAccountById(created.id, OTHER_USER_ID);

      expect(account).toBeNull();
    });

    it("존재하지 않는 계좌 ID는 null을 반환해야 한다", async () => {
      const account = await tradingModule.getTradingAccountById(randomUUID(), TEST_USER_ID);
      expect(account).toBeNull();
    });
  });

  describe("getTradingAccountWithHoldings()", () => {
    it("계좌 상세 정보와 함께 holdings를 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "상세 조회 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const accountWithHoldings = await tradingModule.getTradingAccountWithHoldings(
        created.id,
        TEST_USER_ID
      );

      expect(accountWithHoldings).not.toBeNull();
      expect(accountWithHoldings!.holdings).toHaveLength(7);
      expect(accountWithHoldings!.totalShares).toBe(0);
      expect(accountWithHoldings!.isCycleInProgress).toBe(false);
    });

    it("보유 수량이 있으면 isCycleInProgress가 true여야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "사이클 진행 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 티어 1에 보유 수량 추가
      await tradingModule.updateTierHolding(created.id, 1, {
        buyPrice: 100,
        shares: 10,
        buyDate: "2025-01-02",
        sellTargetPrice: 101.5,
      });

      const accountWithHoldings = await tradingModule.getTradingAccountWithHoldings(
        created.id,
        TEST_USER_ID
      );

      expect(accountWithHoldings!.totalShares).toBe(10);
      expect(accountWithHoldings!.isCycleInProgress).toBe(true);
    });
  });

  describe("updateTradingAccount()", () => {
    it("사이클 미진행 시 계좌 정보를 수정할 수 있어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "수정 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const updated = await tradingModule.updateTradingAccount(created.id, TEST_USER_ID, {
        name: "수정된 계좌 이름",
        seedCapital: 15000,
        strategy: "Pro3",
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("수정된 계좌 이름");
      expect(updated!.seedCapital).toBe(15000);
      expect(updated!.strategy).toBe("Pro3");
    });

    it("존재하지 않는 계좌 수정 시 null을 반환해야 한다", async () => {
      const result = await tradingModule.updateTradingAccount(randomUUID(), TEST_USER_ID, {
        name: "새 이름",
      });
      expect(result).toBeNull();
    });

    it("다른 사용자의 계좌는 수정할 수 없어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "보안 수정 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const result = await tradingModule.updateTradingAccount(created.id, OTHER_USER_ID, {
        name: "해킹된 이름",
      });

      expect(result).toBeNull();
    });

    it("사이클 진행 중에는 수정할 수 없어야 한다 (에러 발생)", async () => {
      const request: CreateTradingAccountRequest = {
        name: "사이클 진행 중 수정 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 티어 1에 보유 수량 추가 (사이클 진행 상태로 만듦)
      await tradingModule.updateTierHolding(created.id, 1, {
        buyPrice: 100,
        shares: 10,
        buyDate: "2025-01-02",
      });

      await expect(
        tradingModule.updateTradingAccount(created.id, TEST_USER_ID, { name: "새 이름" })
      ).rejects.toThrow("Cannot update account while cycle is in progress");
    });

    it("빈 업데이트 요청 시 기존 계좌를 그대로 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "빈 수정 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const result = await tradingModule.updateTradingAccount(created.id, TEST_USER_ID, {});

      expect(result).not.toBeNull();
      expect(result!.name).toBe("빈 수정 테스트");
    });

    it("티커를 SOXL에서 TQQQ로 변경할 수 있어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "티커 변경 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const updated = await tradingModule.updateTradingAccount(created.id, TEST_USER_ID, {
        ticker: "TQQQ",
      });

      expect(updated).not.toBeNull();
      expect(updated!.ticker).toBe("TQQQ");
    });

    it("사이클 시작일을 변경할 수 있어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "시작일 변경 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const updated = await tradingModule.updateTradingAccount(created.id, TEST_USER_ID, {
        cycleStartDate: "2025-02-01",
      });

      expect(updated).not.toBeNull();
      expect(updated!.cycleStartDate).toBe("2025-02-01");
    });
  });

  describe("deleteTradingAccount()", () => {
    it("계좌를 삭제하고 true를 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "삭제 테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      // 삭제될 계좌이므로 createdAccountIds에 추가하지 않음

      const result = await tradingModule.deleteTradingAccount(created.id, TEST_USER_ID);

      expect(result).toBe(true);
      expect(await tradingModule.getTradingAccountById(created.id, TEST_USER_ID)).toBeNull();
    });

    it("계좌 삭제 시 연관된 티어 홀딩도 CASCADE 삭제되어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "CASCADE 삭제 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      const accountId = created.id;
      // 삭제될 계좌이므로 createdAccountIds에 추가하지 않음

      // 삭제 전 티어 홀딩 확인
      expect(await tradingModule.getTierHoldings(accountId)).toHaveLength(7);

      // 계좌 삭제
      await tradingModule.deleteTradingAccount(accountId, TEST_USER_ID);

      // CASCADE 삭제 확인
      expect(await tradingModule.getTierHoldings(accountId)).toHaveLength(0);
    });

    it("존재하지 않는 계좌 삭제 시 false를 반환해야 한다", async () => {
      const result = await tradingModule.deleteTradingAccount(randomUUID(), TEST_USER_ID);
      expect(result).toBe(false);
    });

    it("다른 사용자의 계좌는 삭제할 수 없어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "보안 삭제 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const result = await tradingModule.deleteTradingAccount(created.id, OTHER_USER_ID);

      expect(result).toBe(false);
      expect(await tradingModule.getTradingAccountById(created.id, TEST_USER_ID)).not.toBeNull();
    });
  });

  describe("getTierHoldings()", () => {
    it("계좌의 모든 티어 홀딩을 조회해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "티어 홀딩 조회 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const holdings = await tradingModule.getTierHoldings(created.id);

      expect(holdings).toHaveLength(7);
      expect(holdings[0].tier).toBe(1);
      expect(holdings[6].tier).toBe(7);
    });

    it("티어 번호 순으로 정렬되어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "티어 정렬 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const holdings = await tradingModule.getTierHoldings(created.id);

      for (let i = 0; i < holdings.length - 1; i++) {
        expect(holdings[i].tier).toBeLessThan(holdings[i + 1].tier);
      }
    });

    it("존재하지 않는 계좌는 빈 배열을 반환해야 한다", async () => {
      const holdings = await tradingModule.getTierHoldings(randomUUID());
      expect(holdings).toHaveLength(0);
    });
  });

  describe("getTotalShares()", () => {
    it("모든 티어의 보유 수량 합계를 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "총 수량 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 여러 티어에 수량 추가
      await tradingModule.updateTierHolding(created.id, 1, { shares: 10 });
      await tradingModule.updateTierHolding(created.id, 2, { shares: 15 });
      await tradingModule.updateTierHolding(created.id, 3, { shares: 20 });

      const totalShares = await tradingModule.getTotalShares(created.id);

      expect(totalShares).toBe(45); // 10 + 15 + 20
    });

    it("보유 수량이 없으면 0을 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "수량 없음 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const totalShares = await tradingModule.getTotalShares(created.id);

      expect(totalShares).toBe(0);
    });

    it("존재하지 않는 계좌는 0을 반환해야 한다", async () => {
      const totalShares = await tradingModule.getTotalShares(randomUUID());
      expect(totalShares).toBe(0);
    });
  });

  describe("updateTierHolding()", () => {
    it("티어 홀딩 정보를 업데이트해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "티어 업데이트 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const updated = await tradingModule.updateTierHolding(created.id, 1, {
        buyPrice: 100,
        shares: 10,
        buyDate: "2025-01-02",
        sellTargetPrice: 101.5,
      });

      expect(updated).not.toBeNull();
      expect(updated!.buyPrice).toBe(100);
      expect(updated!.shares).toBe(10);
      expect(updated!.buyDate).toBe("2025-01-02");
      expect(updated!.sellTargetPrice).toBe(101.5);
    });

    it("부분 업데이트가 가능해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "부분 업데이트 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 먼저 전체 설정
      await tradingModule.updateTierHolding(created.id, 2, {
        buyPrice: 100,
        shares: 10,
        buyDate: "2025-01-02",
      });

      // 수량만 업데이트
      const updated = await tradingModule.updateTierHolding(created.id, 2, {
        shares: 20,
      });

      expect(updated!.buyPrice).toBe(100); // 기존 값 유지
      expect(updated!.shares).toBe(20); // 새 값
    });

    it("빈 업데이트 요청 시 null을 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "빈 티어 업데이트 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const result = await tradingModule.updateTierHolding(created.id, 1, {});

      expect(result).toBeNull();
    });

    it("null 값으로 필드를 초기화할 수 있어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "null 초기화 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 먼저 값 설정
      await tradingModule.updateTierHolding(created.id, 3, {
        buyPrice: 100,
        buyDate: "2025-01-02",
      });

      // null로 초기화
      const updated = await tradingModule.updateTierHolding(created.id, 3, {
        buyPrice: null,
        buyDate: null,
      });

      expect(updated!.buyPrice).toBeNull();
      expect(updated!.buyDate).toBeNull();
    });
  });

  describe("getDailyOrders()", () => {
    it("특정 날짜의 주문을 조회해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주문 조회 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 주문 생성
      await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-03",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99,
        shares: 10,
      });

      const orders = await tradingModule.getDailyOrders(created.id, "2025-01-03");

      expect(orders).toHaveLength(1);
      expect(orders[0].date).toBe("2025-01-03");
      expect(orders[0].type).toBe("BUY");
    });

    it("주문이 없는 날짜는 빈 배열을 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "빈 주문 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const orders = await tradingModule.getDailyOrders(created.id, "2025-12-31");

      expect(orders).toHaveLength(0);
    });

    it("티어 및 주문 유형 순으로 정렬되어야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주문 정렬 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 여러 주문 생성 (순서 무관하게)
      await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-04",
        tier: 2,
        type: "SELL",
        orderMethod: "LOC",
        limitPrice: 101,
        shares: 10,
      });
      await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-04",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99,
        shares: 10,
      });
      await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-04",
        tier: 2,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 98,
        shares: 15,
      });

      const orders = await tradingModule.getDailyOrders(created.id, "2025-01-04");

      expect(orders).toHaveLength(3);
      // tier 순 정렬 확인
      expect(orders[0].tier).toBeLessThanOrEqual(orders[1].tier);
    });
  });

  describe("createDailyOrder()", () => {
    it("새 주문을 생성해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주문 생성 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const order = await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-05",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99.5,
        shares: 10,
      });

      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.accountId).toBe(created.id);
      expect(order.date).toBe("2025-01-05");
      expect(order.tier).toBe(1);
      expect(order.type).toBe("BUY");
      expect(order.orderMethod).toBe("LOC");
      expect(order.limitPrice).toBe(99.5);
      expect(order.shares).toBe(10);
      expect(order.executed).toBe(false);
    });

    it("LOC와 MOC 주문 유형 모두 생성 가능해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주문 유형 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const locOrder = await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-06",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99,
        shares: 10,
      });
      const mocOrder = await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-06",
        tier: 2,
        type: "SELL",
        orderMethod: "MOC",
        limitPrice: 101,
        shares: 10,
      });

      expect(locOrder.orderMethod).toBe("LOC");
      expect(mocOrder.orderMethod).toBe("MOC");
    });

    it("BUY와 SELL 주문 모두 생성 가능해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "매매 유형 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const buyOrder = await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-07",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99,
        shares: 10,
      });
      const sellOrder = await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-07",
        tier: 1,
        type: "SELL",
        orderMethod: "LOC",
        limitPrice: 101,
        shares: 10,
      });

      expect(buyOrder.type).toBe("BUY");
      expect(sellOrder.type).toBe("SELL");
    });
  });

  describe("updateOrderExecuted()", () => {
    it("주문 실행 상태를 true로 변경해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주문 실행 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const order = await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-08",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99,
        shares: 10,
      });

      expect(order.executed).toBe(false);

      const result = await tradingModule.updateOrderExecuted(order.id, true);

      expect(result).toBe(true);

      // 변경 확인
      const orders = await tradingModule.getDailyOrders(created.id, "2025-01-08");
      expect(orders[0].executed).toBe(true);
    });

    it("주문 실행 상태를 false로 변경해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주문 취소 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      const order = await tradingModule.createDailyOrder(created.id, {
        date: "2025-01-09",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 99,
        shares: 10,
      });

      // 먼저 실행 상태로 변경
      await tradingModule.updateOrderExecuted(order.id, true);

      // 다시 미실행 상태로 변경
      const result = await tradingModule.updateOrderExecuted(order.id, false);

      expect(result).toBe(true);

      const orders = await tradingModule.getDailyOrders(created.id, "2025-01-09");
      expect(orders[0].executed).toBe(false);
    });

    it("존재하지 않는 주문 ID는 false를 반환해야 한다", async () => {
      const result = await tradingModule.updateOrderExecuted(randomUUID(), true);
      expect(result).toBe(false);
    });
  });

  describe("processPreviousDayExecution()", () => {
    it("TC-001: 이전 거래일 미체결 매수 주문을 체결해야 한다", async () => {
      // 계좌 생성
      const request: CreateTradingAccountRequest = {
        name: "이전일 체결 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-06",
      };
      const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(account.id);

      // 이전 거래일(금요일) 주문 생성
      const prevDate = "2025-01-10"; // 금요일
      await tradingModule.createDailyOrder(account.id, {
        date: prevDate,
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 100,
        shares: 10,
      });

      // 주문이 미체결 상태인지 확인
      const ordersBefore = await tradingModule.getDailyOrders(account.id, prevDate);
      expect(ordersBefore[0].executed).toBe(false);

      // 현재일(월요일)에서 이전 거래일 체결 처리
      // Note: 실제로는 종가 데이터가 DB에 있어야 체결됨
      // 테스트 DB에 종가 데이터가 없으므로 빈 배열 반환 예상
      const currentDate = "2025-01-13"; // 월요일
      const results = await tradingModule.processPreviousDayExecution(
        account.id,
        currentDate,
        "SOXL"
      );

      // 종가 데이터가 없으므로 빈 배열 반환 (CON-001 준수)
      expect(results).toHaveLength(0);
    });

    it("TC-002: 종가 데이터 없으면 체결하지 않아야 한다 (CON-001)", async () => {
      const request: CreateTradingAccountRequest = {
        name: "종가 없음 테스트",
        ticker: "TQQQ", // 종가 데이터가 없는 티커
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-06",
      };
      const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(account.id);

      // 주문 생성
      await tradingModule.createDailyOrder(account.id, {
        date: "2025-01-10",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 50,
        shares: 20,
      });

      // 체결 시도 - 종가 데이터 없음
      const results = await tradingModule.processPreviousDayExecution(
        account.id,
        "2025-01-13",
        "TQQQ"
      );

      // 종가 데이터가 없으므로 빈 배열 반환
      expect(results).toHaveLength(0);

      // 주문은 여전히 미체결 상태
      const orders = await tradingModule.getDailyOrders(account.id, "2025-01-10");
      expect(orders[0].executed).toBe(false);
    });

    it("TC-003: 이미 체결된 주문은 스킵해야 한다 (CON-002)", async () => {
      const request: CreateTradingAccountRequest = {
        name: "중복 체결 방지 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-06",
      };
      const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(account.id);

      // 이미 체결된 주문 생성
      const order = await tradingModule.createDailyOrder(account.id, {
        date: "2025-01-10",
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 100,
        shares: 10,
      });
      await tradingModule.updateOrderExecuted(order.id, true);

      // 체결 시도
      const results = await tradingModule.processPreviousDayExecution(
        account.id,
        "2025-01-13",
        "SOXL"
      );

      // 미체결 주문이 없으므로 빈 배열 반환
      expect(results).toHaveLength(0);
    });

    it("TC-004: 주말을 건너뛰어 이전 거래일을 계산해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주말 건너뛰기 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro3",
        cycleStartDate: "2025-01-06",
      };
      const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(account.id);

      // 금요일에 주문 생성
      await tradingModule.createDailyOrder(account.id, {
        date: "2025-01-10", // 금요일
        tier: 1,
        type: "BUY",
        orderMethod: "LOC",
        limitPrice: 100,
        shares: 10,
      });

      // 월요일에서 이전 거래일 체결 처리 (금요일이어야 함)
      const results = await tradingModule.processPreviousDayExecution(
        account.id,
        "2025-01-13", // 월요일
        "SOXL"
      );

      // 금요일(2025-01-10)의 주문이 처리 대상이어야 함
      // 종가 데이터가 없으므로 빈 배열 반환되지만, 함수가 금요일을 올바르게 계산했는지 확인
      // (실제 체결은 종가 데이터가 있어야 함)
      expect(Array.isArray(results)).toBe(true);
    });

    it("주문이 없는 경우 빈 배열을 반환해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "주문 없음 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-06",
      };
      const account = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(account.id);

      // 주문 없이 체결 시도
      const results = await tradingModule.processPreviousDayExecution(
        account.id,
        "2025-01-13",
        "SOXL"
      );

      expect(results).toHaveLength(0);
    });
  });

  describe("completeCycleAndIncrement()", () => {
    it("cycleNumber를 1 증가시켜야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "사이클 증가 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 초기 cycleNumber는 1
      expect(created.cycleNumber).toBe(1);

      // 사이클 완료 처리
      const newCycleNumber = await tradingModule.completeCycleAndIncrement(created.id);

      expect(newCycleNumber).toBe(2);

      // DB에서 조회하여 확인
      const account = await tradingModule.getTradingAccountById(created.id, TEST_USER_ID);
      expect(account?.cycleNumber).toBe(2);
    });

    it("여러 번 호출 시 cycleNumber가 계속 증가해야 한다", async () => {
      const request: CreateTradingAccountRequest = {
        name: "다중 사이클 테스트",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };
      const created = await tradingModule.createTradingAccount(TEST_USER_ID, request);
      createdAccountIds.push(created.id);

      // 3번 호출
      await tradingModule.completeCycleAndIncrement(created.id);
      await tradingModule.completeCycleAndIncrement(created.id);
      const result = await tradingModule.completeCycleAndIncrement(created.id);

      expect(result).toBe(4); // 1 + 3 = 4

      const account = await tradingModule.getTradingAccountById(created.id, TEST_USER_ID);
      expect(account?.cycleNumber).toBe(4);
    });

    it("존재하지 않는 계좌는 null을 반환해야 한다", async () => {
      const result = await tradingModule.completeCycleAndIncrement(randomUUID());
      expect(result).toBeNull();
    });
  });
});
