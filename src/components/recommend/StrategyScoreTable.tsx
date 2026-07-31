"use client";

/**
 * 전략 점수 테이블 컴포넌트
 * 전략별 종합 점수 표시
 */
import type { StrategyScore, DowngradeInfo } from "@/recommend/types";
import { STRATEGY_COLORS } from "@/backtest";

export interface StrategyScoreTableProps {
  strategyScores: StrategyScore[];
  downgradeInfo?: DowngradeInfo;
}

export default function StrategyScoreTable({
  strategyScores,
  downgradeInfo,
}: StrategyScoreTableProps): React.ReactElement {
  const validScores = strategyScores.filter((s) => !s.excluded);
  const maxScore = validScores.length > 0 ? Math.max(...validScores.map((s) => s.averageScore)) : 0;

  return (
    <div className="row justify-content-center mb-4">
      <div className="col-12 col-lg-4">
        <div className="card bg-dark">
          <div className="card-header bg-secondary text-white">
            <strong>📊 전략별 종합 점수</strong>
          </div>
          <div className="card-body p-0">
            <table className="table table-dark mb-0">
              <tbody>
                {strategyScores.map((score) => {
                  const isExcluded = score.excluded;
                  const isBest = !isExcluded && score.averageScore === maxScore;

                  return (
                    <tr
                      key={score.strategy}
                      style={{
                        opacity: isExcluded ? 0.5 : 1,
                      }}
                    >
                      <td className="py-3" style={{ width: "60%" }}>
                        <span
                          className="badge me-2"
                          style={{
                            backgroundColor: STRATEGY_COLORS[score.strategy],
                            fontSize: "0.9rem",
                            padding: "0.4rem 0.6rem",
                          }}
                        >
                          🏢 떨사 {score.strategy}
                        </span>
                        {isExcluded && (
                          <small className="text-warning">({score.excludeReason})</small>
                        )}
                      </td>
                      <td
                        className="py-3 text-end"
                        style={{
                          fontSize: "1.2rem",
                          fontWeight: "bold",
                          color: isBest ? "#28a745" : isExcluded ? "#6c757d" : "#fff",
                          textDecoration: isExcluded ? "line-through" : "none",
                        }}
                      >
                        {score.averageScore.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* SOXL 전용: 하향 적용 경고 */}
            {downgradeInfo?.applied && (
              <div
                style={{
                  backgroundColor: "rgba(220, 53, 69, 0.15)",
                  borderTop: "1px solid rgba(220, 53, 69, 0.3)",
                  padding: "0.75rem 1rem",
                }}
              >
                <div style={{ color: "#f8d7da", marginBottom: "0.5rem" }}>
                  <strong>⚠ 주의:</strong> 리스크 탐지로 하향 적용(사유{" "}
                  {downgradeInfo.reasons.length}개)
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  {downgradeInfo.reasons.map((reason, idx) => (
                    <span
                      key={idx}
                      className="badge me-1"
                      style={{
                        backgroundColor: "#dc3545",
                        color: "#fff",
                        fontSize: "0.8rem",
                        padding: "0.3rem 0.5rem",
                      }}
                    >
                      {reason}
                    </span>
                  ))}
                </div>
                <small style={{ color: "#adb5bd" }}>* SOXL 전용 옵션</small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
