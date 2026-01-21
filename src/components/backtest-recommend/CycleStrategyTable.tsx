"use client";

/**
 * 사이클별 전략 테이블
 * 각 사이클에서 사용된 전략과 성과를 표시
 */
import type { CycleStrategyInfo } from "@/backtest-recommend";
import { STRATEGY_COLORS } from "@/backtest";

interface CycleStrategyTableProps {
  cycleStrategies: CycleStrategyInfo[];
}

export default function CycleStrategyTable({ cycleStrategies }: CycleStrategyTableProps) {
  return (
    <section className="info-section">
      <h5 className="mb-3">🔄 사이클별 전략 사용 이력</h5>
      <div className="table-responsive">
        <table className="table table-sm table-dark table-hover" style={{ fontSize: "0.85rem" }}>
          <thead style={{ backgroundColor: "#073642" }}>
            <tr>
              <th className="text-center">사이클</th>
              <th className="text-center">전략</th>
              <th>시작일</th>
              <th>종료일</th>
              <th className="text-end">초기자본</th>
              <th className="text-end">최종자산</th>
              <th className="text-end">수익률</th>
              <th>추천 사유</th>
            </tr>
          </thead>
          <tbody>
            {cycleStrategies.map((cycle) => {
              const strategyColor = STRATEGY_COLORS[cycle.strategy];
              const returnRate = cycle.returnRate !== null ? cycle.returnRate * 100 : null;

              return (
                <tr key={cycle.cycleNumber}>
                  <td className="text-center">
                    <span className="badge bg-secondary">{cycle.cycleNumber}</span>
                  </td>
                  <td className="text-center">
                    <span
                      className="badge"
                      style={{
                        backgroundColor: strategyColor,
                        fontSize: "0.75rem",
                      }}
                    >
                      {cycle.strategy}
                    </span>
                  </td>
                  <td>{cycle.startDate}</td>
                  <td>{cycle.endDate ?? <span className="text-warning">진행 중</span>}</td>
                  <td className="text-end">${cycle.initialCapital.toLocaleString()}</td>
                  <td className="text-end">
                    {cycle.finalAsset !== null ? (
                      `$${cycle.finalAsset.toLocaleString()}`
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className={`text-end ${returnRate !== null ? (returnRate >= 0 ? "price-up" : "price-down") : ""}`}>
                    {returnRate !== null ? (
                      <>
                        {returnRate >= 0 ? "+" : ""}
                        {returnRate.toFixed(2)}%
                      </>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td>
                    <small className="text-muted">{cycle.recommendReason}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
