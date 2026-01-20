"use client";

/**
 * 추천 전략 카드 컴포넌트
 * 녹색 카드에 추천 전략과 티어 비율 표시
 */
import type { RecommendationDetail } from "@/recommend/types";

export interface RecommendationCardProps {
  recommendation: RecommendationDetail;
  referenceDate: string;
  isGoldenCross?: boolean;
}

const STRATEGY_COLORS: Record<string, string> = {
  Pro1: "#268bd2",
  Pro2: "#2aa198",
  Pro3: "#6c71c4",
};

const STRATEGY_CONDITIONS: Record<string, { buy: string; sell: string }> = {
  Pro1: { buy: "전일 종가 대비 -0.01%", sell: "매수 가 대비 +0.01%" },
  Pro2: { buy: "전일 종가 대비 -0.01%", sell: "매수 가 대비 +1.50%" },
  Pro3: { buy: "전일 종가 대비 -0.10%", sell: "매수 가 대비 +2.00%" },
};

export default function RecommendationCard({ recommendation, referenceDate, isGoldenCross }: RecommendationCardProps): React.ReactElement {
  const strategyColor = STRATEGY_COLORS[recommendation.strategy] ?? STRATEGY_COLORS.Pro2;
  const tierRatioString = recommendation.tierRatios.map((r) => `${(r * 100).toFixed(1)}%`).join(" | ");
  const conditions = STRATEGY_CONDITIONS[recommendation.strategy] ?? STRATEGY_CONDITIONS.Pro2;

  return (
    <div className="row justify-content-center mb-4">
      <div className="col-12 col-lg-4">
        <div
          className="card"
          style={{
            backgroundColor: "#1a4a4a",
            borderColor: "#2aa198",
            borderWidth: "2px",
          }}
        >
      {/* 날짜 헤더 */}
      <div
        className="card-header text-center py-2"
        style={{
          backgroundColor: "#073642",
          borderBottom: "1px solid #2aa198",
        }}
      >
        <span style={{ color: "#839496" }}>{referenceDate}</span>
      </div>

      <div className="card-body text-center py-4">
        {/* 정배열 경고 */}
        {isGoldenCross && (
          <div
            className="alert py-2 mb-3"
            style={{
              backgroundColor: "#5c4a00",
              borderColor: "#ffc107",
              color: "#ffc107",
            }}
          >
            ⚠️ 정배열(MA20 &gt; MA60) 상태입니다. Pro1 전략은 제외됩니다.
          </div>
        )}

        {/* 추천 전략 */}
        <div className="mb-3">
          <span style={{ color: "#839496", fontSize: "1.1rem" }}>🎯 추천 전략: </span>
          <span
            style={{
              color: strategyColor,
              fontSize: "2rem",
              fontWeight: "bold",
            }}
          >
            {recommendation.strategy}
          </span>
        </div>

        {/* 티어 비율 */}
        <div className="mb-4">
          <span style={{ color: "#839496" }}>분할 비율: </span>
          <span style={{ color: "#fff", fontWeight: "500" }}>{tierRatioString}</span>
        </div>

        {/* 매수/매도 조건 버튼 */}
        <div className="d-flex justify-content-center gap-2 flex-wrap">
          <button
            type="button"
            className="btn btn-sm"
            style={{
              backgroundColor: "#073642",
              color: "#2aa198",
              border: "1px solid #2aa198",
            }}
          >
            6분할 10일 손절
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              backgroundColor: "#073642",
              color: "#dc3545",
              border: "1px solid #dc3545",
            }}
          >
            {conditions.buy}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              backgroundColor: "#073642",
              color: "#28a745",
              border: "1px solid #28a745",
            }}
          >
            {conditions.sell}
          </button>
        </div>

        {/* 하단 버튼 */}
        <div className="d-flex justify-content-center gap-2 mt-3">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
          >
            손절일도 매수 ○
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              backgroundColor: "#2aa198",
              color: "#fff",
            }}
          >
            정액 매수 ✕
          </button>
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}
