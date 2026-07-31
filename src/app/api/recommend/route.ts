/**
 * 전략 추천 API 엔드포인트
 * POST /api/recommend
 *
 * 추천 파이프라인은 RecommendationService(src/recommend)가 단일 소유한다.
 * route는 recommend() 호출 + InsufficientData → HTTP 400 매핑 + 차트 표시 헬퍼
 * 호출로 축소됐다 (이슈 #57).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth, isUnauthorized } from "@/lib/auth/api-auth";
import { getPriceRange, getLatestDate } from "@/database/prices";
import { recommend, PRICE_HISTORY_START } from "@/recommend";

import { buildRecommendResult } from "./chart";

const RecommendRequestSchema = z
  .object({
    ticker: z.enum(["SOXL", "TQQQ"], {
      message: "ticker must be SOXL or TQQQ",
    }),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must be in YYYY-MM-DD format"),
    baseType: z.enum(["today", "specific"], {
      message: "baseType must be today or specific",
    }),
  })
  .refine(
    (data) => {
      // 'today' 기준일 때는 referenceDate 유효성 검사 건너뛰기 (서버에서 오늘 날짜로 대체)
      if (data.baseType === "today") return true;
      // 'specific' 기준일 때는 유효한 날짜인지 확인
      const date = new Date(data.referenceDate);
      return !isNaN(date.getTime());
    },
    {
      message: "Invalid referenceDate",
      path: ["referenceDate"],
    }
  );

/** POST /api/recommend - 전략 추천 API */
export async function POST(request: Request): Promise<Response> {
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
    const parseResult = RecommendRequestSchema.safeParse(body);
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

    const { ticker, baseType } = parseResult.data;

    // 기준일 결정 (today인 경우 DB의 최신 날짜 사용)
    const latestDate = await getLatestDate(ticker);
    if (!latestDate) {
      return NextResponse.json(
        {
          success: false,
          error: "No price data available",
          message: `No price data found for ${ticker}`,
        },
        { status: 400 }
      );
    }
    const referenceDate = baseType === "today" ? latestDate : parseResult.data.referenceDate;

    // 전체 가격 데이터는 차트 표시에도 필요하므로 route가 한 번 로드해 서비스에 전달한다
    const allPrices = await getPriceRange(ticker, PRICE_HISTORY_START, latestDate);

    // 추천 계산 (화면은 유사 구간·점수 상세가 필요하므로 requireDetail)
    const outcome = await recommend(ticker, referenceDate, {
      prices: allPrices,
      requireDetail: true,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        {
          success: false,
          error: outcome.reason.code,
          message: outcome.reason.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: buildRecommendResult(outcome.value, allPrices),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Recommend API error:", error);

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
