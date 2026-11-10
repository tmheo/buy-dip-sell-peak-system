/**
 * 트레이딩 API Zod 검증 스키마 (PRD-TRADING-001)
 */

import { z } from "zod";

/** 시드 금액의 최소값 ($) - 화면의 입력 검사와 같다 */
export const MIN_SEED_CAPITAL = 2000;
/** 시드 금액의 최대값 ($) */
const MAX_SEED_CAPITAL = 1_000_000_000;

/**
 * 트레이딩 계좌 생성 스키마
 */
export const CreateTradingAccountSchema = z.object({
  name: z.string().min(1, "계좌 이름은 필수입니다").max(50, "계좌 이름은 50자 이하여야 합니다"),
  ticker: z.enum(["SOXL", "TQQQ"], {
    message: "티커는 SOXL 또는 TQQQ만 가능합니다",
  }),
  seedCapital: z
    .number()
    .positive("시드 자본은 양수여야 합니다")
    .max(1000000000, "시드 자본은 10억 이하여야 합니다"),
  strategy: z.enum(["Pro1", "Pro2", "Pro3"], {
    message: "전략은 Pro1, Pro2, Pro3 중 하나여야 합니다",
  }),
  cycleStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다"),
});

/**
 * 트레이딩 계좌 수정 스키마
 *
 * 종목은 계좌를 만들 때 정하고 바꿀 수 없다(#112). 다른 필드처럼 모르는 키로 걸러 내면
 * 요청한 쪽은 종목이 바뀐 줄 알게 되므로, ticker가 들어 있으면 검증 오류로 거절한다.
 * 시드는 적용일이 붙은 이력으로 따로 바꾸므로(ADR-0005) 같은 이유로 seedCapital도 거절한다.
 */
export const UpdateTradingAccountSchema = z.object({
  name: z
    .string()
    .min(1, "계좌 이름은 필수입니다")
    .max(50, "계좌 이름은 50자 이하여야 합니다")
    .optional(),
  ticker: z.never({ error: "종목은 계좌를 만든 뒤 바꿀 수 없습니다" }).optional(),
  seedCapital: z
    .never({ error: "시드는 PUT /api/trading/accounts/[id]/seed로 바꿉니다" })
    .optional(),
  strategy: z.enum(["Pro1", "Pro2", "Pro3"]).optional(),
  // 운용 시작일(첫 사이클의 시작일). 첫 일일 마감 뒤에는 updateTradingAccount()가 다른 날짜로의 변경을 거절한다.
  cycleStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다")
    .optional(),
});

/**
 * 시드 변경 스키마 (PUT /api/trading/accounts/[id]/seed, ADR-0005)
 * 최소 금액은 화면과 같다 - 화면만 검사하면 다른 경로로 들어온 작은 시드가 그대로 저장된다.
 */
export const ChangeSeedCapitalSchema = z.object({
  seedCapital: z
    .number({ error: "시드 금액은 숫자여야 합니다" })
    .min(MIN_SEED_CAPITAL, "시드 금액은 최소 $2,000 이상이어야 합니다")
    .max(MAX_SEED_CAPITAL, "시드 금액은 10억 이하여야 합니다"),
});

export type CreateTradingAccountInput = z.infer<typeof CreateTradingAccountSchema>;
export type UpdateTradingAccountInput = z.infer<typeof UpdateTradingAccountSchema>;
export type ChangeSeedCapitalInput = z.infer<typeof ChangeSeedCapitalSchema>;
