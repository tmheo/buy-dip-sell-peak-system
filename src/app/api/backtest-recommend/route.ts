/**
 * 추천 전략 백테스트 API 엔드포인트
 *
 * POST /api/backtest-recommend
 * 사이클 경계마다 추천 전략을 동적으로 변경하며 백테스트 실행
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPricesByDateRange } from "@/database/prices";
import { RecommendBacktestEngine } from "@/backtest-recommend";
import type { RecommendBacktestRequest } from "@/backtest-recommend";
import { requireAuth, isUnauthorized } from "@/lib/auth/api-auth";

// 추천 백테스트용 lookback 시작일 (충분한 과거 데이터 확보)
const RECOMMEND_LOOKBACK_START = "2010-01-01";

// 엄격한 달력 날짜 검증 함수
const isValidDateString = (value: string) => {
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

// 요청 스키마 정의
const RecommendBacktestRequestSchema = z
  .object({
    ticker: z.enum(["SOXL", "TQQQ"], {
      message: "ticker must be SOXL or TQQQ",
    }),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be in YYYY-MM-DD format")
      .refine(isValidDateString, "startDate must be a valid calendar date"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be in YYYY-MM-DD format")
      .refine(isValidDateString, "endDate must be a valid calendar date"),
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
 * POST /api/backtest-recommend
 *
 * 추천 전략 백테스트 실행 API
 * 각 사이클 시작 시점에 추천 전략을 조회하여 동적으로 전략을 변경
 */
export async function POST(request: Request) {
  try {
    // 인증 체크
    const authResult = await requireAuth();
    if (isUnauthorized(authResult)) {
      return authResult;
    }

    // 요청 본문 파싱
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    // 스키마 유효성 검사
    const parseResult = RecommendBacktestRequestSchema.safeParse(body);
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

    // 전체 데이터 조회 (추천 lookback + 백테스트 기간)
    // 추천 시스템이 과거 유사 구간을 검색하기 위해 2010년부터 데이터 필요
    const allPrices = await getPricesByDateRange(
      {
        startDate: RECOMMEND_LOOKBACK_START,
        endDate: validatedRequest.endDate,
      },
      validatedRequest.ticker
    );

    if (allPrices.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No price data found",
          message: `No price data available for ${validatedRequest.ticker}`,
        },
        { status: 400 }
      );
    }

    // 날짜-인덱스 맵 생성 (O(1) 조회용)
    const dateToIndexMap = new Map<string, number>();
    allPrices.forEach((price, index) => {
      dateToIndexMap.set(price.date, index);
    });

    // 백테스트 시작일 인덱스 찾기
    const backtestStartIndex = allPrices.findIndex((p) => p.date >= validatedRequest.startDate);
    if (backtestStartIndex < 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid start date",
          message: `No price data found for start date ${validatedRequest.startDate}`,
        },
        { status: 400 }
      );
    }

    // 백테스트 기간 데이터 부족 체크
    const backtestPricesCount = allPrices.length - backtestStartIndex;
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

    // 추천 백테스트 엔진 실행
    const engine = new RecommendBacktestEngine(validatedRequest.ticker, allPrices, dateToIndexMap);

    const backtestRequest: RecommendBacktestRequest = {
      ticker: validatedRequest.ticker,
      startDate: validatedRequest.startDate,
      endDate: validatedRequest.endDate,
      initialCapital: validatedRequest.initialCapital,
    };

    const result = await engine.run(backtestRequest, backtestStartIndex);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Recommend Backtest API error:", error);

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
