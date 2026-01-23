/**
 * 트레이딩 API Zod 검증 스키마 (PRD-TRADING-001)
 */

import { z } from "zod";

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
 */
export const UpdateTradingAccountSchema = z.object({
  name: z
    .string()
    .min(1, "계좌 이름은 필수입니다")
    .max(50, "계좌 이름은 50자 이하여야 합니다")
    .optional(),
  ticker: z.enum(["SOXL", "TQQQ"]).optional(),
  seedCapital: z
    .number()
    .positive("시드 자본은 양수여야 합니다")
    .max(1000000000, "시드 자본은 10억 이하여야 합니다")
    .optional(),
  strategy: z.enum(["Pro1", "Pro2", "Pro3"]).optional(),
  cycleStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다")
    .optional(),
});

export type CreateTradingAccountInput = z.infer<typeof CreateTradingAccountSchema>;
export type UpdateTradingAccountInput = z.infer<typeof UpdateTradingAccountSchema>;
