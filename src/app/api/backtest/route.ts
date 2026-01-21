/**
 * 백테스트 API 엔드포인트
 * SPEC-BACKTEST-001 REQ-012
 *
 * POST /api/backtest
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPricesByDateRange } from "@/database";
import { BacktestEngine } from "@/backtest";
import type { BacktestRequest, StrategyName } from "@/backtest";
import { requireAuth, isUnauthorized } from "@/lib/auth/api-auth";

// 요청 스키마 정의
const BacktestRequestSchema = z
  .object({
    ticker: z.string().min(1, "ticker is required"),
    strategy: z.enum(["Pro1", "Pro2", "Pro3"], {
      message: "strategy must be Pro1, Pro2, or Pro3",
    }),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be in YYYY-MM-DD format"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be in YYYY-MM-DD format"),
    initialCapital: z.number().positive("initialCapital must be positive"),
  })
  .refine(
    (data) => {
      return new Date(data.startDate) <= new Date(data.endDate);
    },
    {
      message: "endDate must be after startDate",
      path: ["endDate"],
    }
  );

/**
 * POST /api/backtest
 *
 * 백테스트 실행 API
 */
export async function POST(request: Request) {
  try {
    // 인증 체크
    const authResult = await requireAuth();
    if (isUnauthorized(authResult)) {
      return authResult;
    }

    // 요청 본문 파싱
    const body = await request.json();

    // 스키마 유효성 검사
    const parseResult = BacktestRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const validatedRequest = parseResult.data;

    // 과거 데이터 조회 기간 계산 (90일 전) - 기술적 지표 계산용
    const lookbackDate = new Date(`${validatedRequest.startDate}T00:00:00Z`);
    lookbackDate.setUTCDate(lookbackDate.getUTCDate() - 90);
    const lookbackDateStr = lookbackDate.toISOString().slice(0, 10);

    // 전체 데이터 조회 (과거 데이터 + 백테스트 기간)
    const allPrices = getPricesByDateRange(
      {
        startDate: lookbackDateStr,
        endDate: validatedRequest.endDate,
      },
      validatedRequest.ticker
    );

    // 백테스트 시작일 인덱스 찾기
    const backtestStartIndex = allPrices.findIndex((p) => p.date >= validatedRequest.startDate);

    // 백테스트 기간 데이터 부족 체크
    const backtestPricesCount = backtestStartIndex >= 0 ? allPrices.length - backtestStartIndex : 0;
    if (backtestPricesCount < 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient price data",
          message: "At least 2 days of price data required for backtest",
        },
        { status: 400 }
      );
    }

    // 백테스트 엔진 실행
    const engine = new BacktestEngine(validatedRequest.strategy as StrategyName);
    const backtestRequest: BacktestRequest = {
      ticker: validatedRequest.ticker,
      strategy: validatedRequest.strategy as StrategyName,
      startDate: validatedRequest.startDate,
      endDate: validatedRequest.endDate,
      initialCapital: validatedRequest.initialCapital,
    };

    const result = engine.run(backtestRequest, allPrices, backtestStartIndex);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Backtest API error:", error);

    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        ...(isDev && { message: error instanceof Error ? error.message : "Unknown error" }),
      },
      { status: 500 }
    );
  }
}
