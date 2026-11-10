/**
 * 트레이딩 API Zod 검증 스키마 테스트 (PRD-TRADING-001)
 *
 * 테스트 대상:
 * - CreateTradingAccountSchema: 계좌 생성 검증
 * - UpdateTradingAccountSchema: 계좌 수정 검증
 *
 * 검증 항목:
 * - 유효한 입력 통과
 * - 잘못된 ticker 거부
 * - 잘못된 strategy 거부
 * - seedCapital 최소값/최대값/센트 단위 검증 (계좌 생성과 시드 변경이 같은 기준을 쓴다)
 * - 필수 필드 누락 검증
 * - 날짜 형식 검증
 */

import { describe, it, expect } from "vitest";
import {
  ChangeSeedCapitalSchema,
  CreateTradingAccountSchema,
  UpdateTradingAccountSchema,
} from "../trading";

describe("CreateTradingAccountSchema", () => {
  describe("유효한 입력", () => {
    it("모든 필드가 유효할 때 통과해야 한다", () => {
      const validInput = {
        name: "테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro2",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("테스트 계좌");
        expect(result.data.ticker).toBe("SOXL");
        expect(result.data.seedCapital).toBe(10000);
        expect(result.data.strategy).toBe("Pro2");
        expect(result.data.cycleStartDate).toBe("2025-01-02");
      }
    });

    it("SOXL 티커로 계좌를 생성할 수 있어야 한다", () => {
      const input = {
        name: "SOXL 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("TQQQ 티커로 계좌를 생성할 수 있어야 한다", () => {
      const input = {
        name: "TQQQ 계좌",
        ticker: "TQQQ",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("Pro1, Pro2, Pro3 전략 모두 허용되어야 한다", () => {
      const strategies = ["Pro1", "Pro2", "Pro3"];

      strategies.forEach((strategy) => {
        const input = {
          name: `${strategy} 계좌`,
          ticker: "SOXL",
          seedCapital: 10000,
          strategy,
          cycleStartDate: "2025-01-02",
        };

        const result = CreateTradingAccountSchema.safeParse(input);

        expect(result.success).toBe(true);
      });
    });

    it("최소 시드 자본($2,000)이 허용되어야 한다", () => {
      const input = {
        name: "최소 자본 계좌",
        ticker: "SOXL",
        seedCapital: 2000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("최대 시드 자본(10억)이 허용되어야 한다", () => {
      const input = {
        name: "최대 자본 계좌",
        ticker: "SOXL",
        seedCapital: 1000000000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe("name 필드 검증", () => {
    it("빈 이름은 거부되어야 한다", () => {
      const input = {
        name: "",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten();
        expect(errors.fieldErrors.name).toBeDefined();
        expect(errors.fieldErrors.name![0]).toContain("필수");
      }
    });

    it("50자 초과 이름은 거부되어야 한다", () => {
      const input = {
        name: "가".repeat(51),
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten();
        expect(errors.fieldErrors.name).toBeDefined();
        expect(errors.fieldErrors.name![0]).toContain("50자");
      }
    });

    it("50자 이름은 허용되어야 한다", () => {
      const input = {
        name: "가".repeat(50),
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("name 필드 누락 시 거부되어야 한다", () => {
      const input = {
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("ticker 필드 검증", () => {
    it("SOXL, TQQQ 외의 티커는 거부되어야 한다", () => {
      const invalidTickers = ["SPY", "QQQ", "AAPL", "soxl", "tqqq", ""];

      invalidTickers.forEach((ticker) => {
        const input = {
          name: "테스트 계좌",
          ticker,
          seedCapital: 10000,
          strategy: "Pro1",
          cycleStartDate: "2025-01-02",
        };

        const result = CreateTradingAccountSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          const errors = result.error.flatten();
          expect(errors.fieldErrors.ticker).toBeDefined();
        }
      });
    });

    it("ticker 필드 누락 시 거부되어야 한다", () => {
      const input = {
        name: "테스트 계좌",
        seedCapital: 10000,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("seedCapital 필드 검증", () => {
    it("최소 $2,000보다 작은 시드 자본은 거부되어야 한다 - 화면만 검사하면 다른 경로로 들어온 작은 시드가 저장된다", () => {
      const invalidCapitals = [1999.99, 0.01, 0, -1, -1000];

      invalidCapitals.forEach((seedCapital) => {
        const input = {
          name: "테스트 계좌",
          ticker: "SOXL",
          seedCapital,
          strategy: "Pro1",
          cycleStartDate: "2025-01-02",
        };

        const result = CreateTradingAccountSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          const errors = result.error.flatten();
          expect(errors.fieldErrors.seedCapital).toBeDefined();
          expect(errors.fieldErrors.seedCapital).toEqual([
            "시드 금액은 최소 $2,000 이상이어야 합니다",
          ]);
        }
      });
    });

    it("10억 초과 시드 자본은 거부되어야 한다", () => {
      const input = {
        name: "테스트 계좌",
        ticker: "SOXL",
        seedCapital: 1000000001,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten();
        expect(errors.fieldErrors.seedCapital).toBeDefined();
        expect(errors.fieldErrors.seedCapital![0]).toContain("10억");
      }
    });

    it("센트보다 작은 단위가 있는 시드 자본은 반올림하지 않고 거부되어야 한다", () => {
      const input = {
        name: "테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000.001,
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.seedCapital).toEqual([
          "시드 금액은 센트(소수 둘째 자리)까지만 입력할 수 있습니다",
        ]);
      }
    });

    it("문자열 시드 자본은 거부되어야 한다", () => {
      const input = {
        name: "테스트 계좌",
        ticker: "SOXL",
        seedCapital: "10000",
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("seedCapital 필드 누락 시 거부되어야 한다", () => {
      const input = {
        name: "테스트 계좌",
        ticker: "SOXL",
        strategy: "Pro1",
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("strategy 필드 검증", () => {
    it("Pro1, Pro2, Pro3 외의 전략은 거부되어야 한다", () => {
      const invalidStrategies = ["Pro4", "pro1", "PRO1", "Basic", ""];

      invalidStrategies.forEach((strategy) => {
        const input = {
          name: "테스트 계좌",
          ticker: "SOXL",
          seedCapital: 10000,
          strategy,
          cycleStartDate: "2025-01-02",
        };

        const result = CreateTradingAccountSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          const errors = result.error.flatten();
          expect(errors.fieldErrors.strategy).toBeDefined();
        }
      });
    });

    it("strategy 필드 누락 시 거부되어야 한다", () => {
      const input = {
        name: "테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        cycleStartDate: "2025-01-02",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("cycleStartDate 필드 검증", () => {
    it("YYYY-MM-DD 형식의 날짜가 허용되어야 한다", () => {
      const validDates = ["2025-01-02", "2025-12-31", "2024-02-29"];

      validDates.forEach((cycleStartDate) => {
        const input = {
          name: "테스트 계좌",
          ticker: "SOXL",
          seedCapital: 10000,
          strategy: "Pro1",
          cycleStartDate,
        };

        const result = CreateTradingAccountSchema.safeParse(input);

        expect(result.success).toBe(true);
      });
    });

    it("잘못된 날짜 형식은 거부되어야 한다", () => {
      // 참고: 정규식 검증만 수행하므로 형식(YYYY-MM-DD)만 검사
      // 논리적 유효성(예: 2025-13-01)은 검사하지 않음
      const invalidDates = ["2025/01/02", "01-02-2025", "2025-1-2", "20250102", "", "invalid"];

      invalidDates.forEach((cycleStartDate) => {
        const input = {
          name: "테스트 계좌",
          ticker: "SOXL",
          seedCapital: 10000,
          strategy: "Pro1",
          cycleStartDate,
        };

        const result = CreateTradingAccountSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          const errors = result.error.flatten();
          expect(errors.fieldErrors.cycleStartDate).toBeDefined();
          expect(errors.fieldErrors.cycleStartDate![0]).toContain("YYYY-MM-DD");
        }
      });
    });

    it("cycleStartDate 필드 누락 시 거부되어야 한다", () => {
      const input = {
        name: "테스트 계좌",
        ticker: "SOXL",
        seedCapital: 10000,
        strategy: "Pro1",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("복합 에러 케이스", () => {
    it("여러 필드가 잘못되면 모든 에러를 반환해야 한다", () => {
      const input = {
        name: "",
        ticker: "SPY",
        seedCapital: -1000,
        strategy: "Pro4",
        cycleStartDate: "invalid",
      };

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten();
        expect(errors.fieldErrors.name).toBeDefined();
        expect(errors.fieldErrors.ticker).toBeDefined();
        expect(errors.fieldErrors.seedCapital).toBeDefined();
        expect(errors.fieldErrors.strategy).toBeDefined();
        expect(errors.fieldErrors.cycleStartDate).toBeDefined();
      }
    });

    it("빈 객체는 모든 필수 필드 에러를 반환해야 한다", () => {
      const input = {};

      const result = CreateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten();
        expect(Object.keys(errors.fieldErrors).length).toBeGreaterThanOrEqual(5);
      }
    });
  });
});

describe("UpdateTradingAccountSchema", () => {
  describe("유효한 입력", () => {
    it("모든 필드가 선택적이어야 한다 (빈 객체 허용)", () => {
      const input = {};

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("name만 수정할 수 있어야 한다", () => {
      const input = {
        name: "새로운 계좌 이름",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("새로운 계좌 이름");
      }
    });

    it("strategy만 수정할 수 있어야 한다", () => {
      const input = {
        strategy: "Pro3",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("cycleStartDate만 수정할 수 있어야 한다", () => {
      const input = {
        cycleStartDate: "2025-02-01",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("여러 필드를 동시에 수정할 수 있어야 한다", () => {
      const input = {
        name: "수정된 계좌",
        strategy: "Pro2",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("수정된 계좌");
        expect(result.data.strategy).toBe("Pro2");
      }
    });
  });

  describe("name 필드 검증", () => {
    it("빈 이름은 거부되어야 한다", () => {
      const input = {
        name: "",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("50자 초과 이름은 거부되어야 한다", () => {
      const input = {
        name: "가".repeat(51),
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("ticker 필드 검증 (종목 고정, #112)", () => {
    it("종목은 계좌를 만든 뒤 바꿀 수 없으므로 ticker가 있으면 거부되어야 한다", () => {
      const result = UpdateTradingAccountSchema.safeParse({ ticker: "TQQQ" });

      expect(result.success).toBe(false);
    });

    it("지금 종목과 같은 값이어도 조용히 무시하지 않고 거부되어야 한다", () => {
      const result = UpdateTradingAccountSchema.safeParse({ ticker: "SOXL", strategy: "Pro2" });

      expect(result.success).toBe(false);
    });
  });

  describe("seedCapital 필드 검증 (시드 이력, ADR-0005)", () => {
    it("시드는 적용일이 붙은 이력으로 따로 바꾸므로 seedCapital이 있으면 거부되어야 한다", () => {
      const result = UpdateTradingAccountSchema.safeParse({ seedCapital: 20000, strategy: "Pro2" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.seedCapital).toEqual([
          "시드는 PUT /api/trading/accounts/[id]/seed로 바꿉니다",
        ]);
      }
    });
  });

  describe("strategy 필드 검증", () => {
    it("유효하지 않은 전략은 거부되어야 한다", () => {
      const input = {
        strategy: "Pro4",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("cycleStartDate 필드 검증", () => {
    it("잘못된 날짜 형식은 거부되어야 한다", () => {
      const input = {
        cycleStartDate: "2025/01/02",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("복합 에러 케이스", () => {
    it("유효한 필드와 유효하지 않은 필드가 섞여 있으면 에러를 반환해야 한다", () => {
      const input = {
        name: "유효한 이름",
        ticker: "INVALID",
        strategy: "Pro1",
      };

      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten();
        expect(errors.fieldErrors.ticker).toBeDefined();
        expect(errors.fieldErrors.name).toBeUndefined();
        expect(errors.fieldErrors.strategy).toBeUndefined();
      }
    });

    it("알 수 없는 필드는 무시되어야 한다", () => {
      const input = {
        name: "테스트",
        unknownField: "값",
      };

      // Zod는 기본적으로 알 수 없는 필드를 무시 (strip)
      const result = UpdateTradingAccountSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).unknownField).toBeUndefined();
      }
    });
  });
});

describe("ChangeSeedCapitalSchema (ADR-0005)", () => {
  it("최소 $2,000부터 10억까지, 센트 단위까지의 시드를 받아야 한다", () => {
    for (const seedCapital of [2000, 2_000.3, 65_303.83, 999_999_999.99, 1_000_000_000]) {
      expect(ChangeSeedCapitalSchema.safeParse({ seedCapital }).success).toBe(true);
    }
  });

  it.each([
    [1999.99, "시드 금액은 최소 $2,000 이상이어야 합니다"],
    [1_000_000_000.01, "시드 금액은 10억 이하여야 합니다"],
    // 반올림해 받으면 지금 시드 10000과 같은 값이 적용 전 변경으로 남는다
    [10_000.001, "시드 금액은 센트(소수 둘째 자리)까지만 입력할 수 있습니다"],
    [3_000.555, "시드 금액은 센트(소수 둘째 자리)까지만 입력할 수 있습니다"],
  ])("%s는 거부되어야 한다", (seedCapital, message) => {
    const result = ChangeSeedCapitalSchema.safeParse({ seedCapital });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.seedCapital).toEqual([message]);
    }
  });

  it("숫자가 아니거나 없으면 거부되어야 한다", () => {
    expect(ChangeSeedCapitalSchema.safeParse({ seedCapital: "3000" }).success).toBe(false);
    expect(ChangeSeedCapitalSchema.safeParse({}).success).toBe(false);
  });

  it("확인한 분류는 오늘 매수에 달림(depends)이나 사이클 끝(ends)으로만 받아야 한다 (ADR-0006)", () => {
    for (const confirmedClassification of ["depends", "ends", undefined]) {
      expect(
        ChangeSeedCapitalSchema.safeParse({ seedCapital: 3_000, confirmedClassification }).success
      ).toBe(true);
    }
    for (const confirmedClassification of ["keep", "increase", true]) {
      expect(
        ChangeSeedCapitalSchema.safeParse({ seedCapital: 3_000, confirmedClassification }).success
      ).toBe(false);
    }
  });
});
