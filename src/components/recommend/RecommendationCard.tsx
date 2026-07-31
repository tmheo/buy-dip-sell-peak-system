"use client";

/**
 * 추천 전략 카드 컴포넌트
 * 녹색 카드에 추천 전략과 티어 비율 표시
 */
import type { RecommendationDetail } from "@/recommend/types";
import { STRATEGY_COLORS } from "@/backtest";
import { getStrategyParams } from "@/strategy";
import { formatThresholdPercent } from "@/lib/strategy-format";

export interface RecommendationCardProps {
  recommendation: RecommendationDetail;
  referenceDate: string;
  isGoldenCross?: boolean;
  /** 다이버전스 조건 발동으로 정배열 Pro1 제외 규칙이 무시되었는지 여부 */
  skipPro1Exclusion?: boolean;
}

export default function RecommendationCard({
  recommendation,
  referenceDate,
  isGoldenCross,
  skipPro1Exclusion,
}: RecommendationCardProps): React.ReactElement {
  const strategyColor = STRATEGY_COLORS[recommendation.strategy];
  const tierRatioString = recommendation.tierRatios
    .map((r) => `${(r * 100).toFixed(1)}%`)
    .join(" | ");
  // 매수/매도 조건과 손절일은 src/strategy의 전략 파라미터 표에서 파생한다 (#43)
  const params = getStrategyParams(recommendation.strategy);

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
            {/* 정배열 경고 (다이버전스 조건 발동 시 표시하지 않음) */}
            {isGoldenCross && !skipPro1Exclusion && (
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
                {params.tierRatios.length}분할 {params.stopLossDays}일 손절
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
                전일 종가 대비 {formatThresholdPercent(params.buyThreshold)}
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
                매수가 대비 {formatThresholdPercent(params.sellThreshold)}
              </button>
            </div>

            {/* 하단 버튼 */}
            <div className="d-flex justify-content-center gap-2 mt-3">
              <button type="button" className="btn btn-outline-secondary btn-sm">
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
