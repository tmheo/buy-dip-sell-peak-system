"use client";

/**
 * 전략 점수 테이블 컴포넌트
 * 전략별 종합 점수 표시
 */
import type { StrategyScore } from "@/recommend/types";

export interface StrategyScoreTableProps {
  strategyScores: StrategyScore[];
}

const STRATEGY_COLORS: Record<string, string> = {
  Pro1: "#268bd2",
  Pro2: "#2aa198",
  Pro3: "#6c71c4",
};

export default function StrategyScoreTable({ strategyScores }: StrategyScoreTableProps): React.ReactElement {
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
                        <small className="text-warning">
                          ({score.excludeReason})
                        </small>
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
        </div>
        </div>
      </div>
    </div>
  );
}
