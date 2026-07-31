"use client";

/**
 * 전략별 사용 통계 요약 카드
 * 각 전략이 몇 사이클, 몇 일 사용되었는지 표시
 */
import type { StrategyUsageStats } from "@/backtest-recommend";
import type { Strategy } from "@/types/trading";
import { STRATEGY_COLORS } from "@/backtest";
import { getStrategyParams } from "@/strategy";
import { formatThresholdPercent } from "@/lib/strategy-format";

interface StrategySummaryCardsProps {
  strategyStats: {
    Pro1: StrategyUsageStats;
    Pro2: StrategyUsageStats;
    Pro3: StrategyUsageStats;
  };
  totalCycles: number;
  totalDays: number;
}

// 전략별 설정 (색상은 공유 상수, 임계값 수치는 src/strategy 파라미터 표에서 파생 - #43)
const STRATEGY_CONFIG: Record<Strategy, { bgColor: string; label: string }> = {
  Pro1: { bgColor: "rgba(38, 139, 210, 0.15)", label: "적극적" },
  Pro2: { bgColor: "rgba(42, 161, 152, 0.15)", label: "균형형" },
  Pro3: { bgColor: "rgba(108, 113, 196, 0.15)", label: "보수적" },
};

function strategyDescription(strategy: Strategy): string {
  const params = getStrategyParams(strategy);
  const buy = formatThresholdPercent(params.buyThreshold);
  const sell = formatThresholdPercent(params.sellThreshold);
  return `${STRATEGY_CONFIG[strategy].label} (매수 ${buy}, 매도 ${sell})`;
}

export default function StrategySummaryCards({
  strategyStats,
  totalCycles,
  totalDays,
}: StrategySummaryCardsProps) {
  const strategies: Strategy[] = ["Pro1", "Pro2", "Pro3"];

  return (
    <section className="info-section">
      <h5 className="mb-3">📊 전략별 사용 통계</h5>
      <div className="row g-3">
        {strategies.map((strategy) => {
          const stats = strategyStats[strategy];
          const config = STRATEGY_CONFIG[strategy];
          const color = STRATEGY_COLORS[strategy];
          const cyclePercent = totalCycles > 0 ? (stats.cycles / totalCycles) * 100 : 0;
          const dayPercent = totalDays > 0 ? (stats.totalDays / totalDays) * 100 : 0;

          return (
            <div key={strategy} className="col-12 col-md-4">
              <div
                className="card h-100"
                style={{
                  backgroundColor: config.bgColor,
                  borderColor: color,
                  borderWidth: "2px",
                }}
              >
                <div className="card-body">
                  {/* 전략 이름 */}
                  <div className="d-flex align-items-center mb-2">
                    <span
                      className="badge me-2"
                      style={{
                        backgroundColor: color,
                        fontSize: "0.9rem",
                        padding: "0.4em 0.8em",
                      }}
                    >
                      {strategy}
                    </span>
                    <small className="text-muted">{strategyDescription(strategy)}</small>
                  </div>

                  {/* 통계 */}
                  <div className="row g-2 mt-2">
                    <div className="col-6">
                      <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                        <small className="text-muted d-block">사용 사이클</small>
                        <strong style={{ color }}>{stats.cycles}회</strong>
                        <small className="text-muted ms-1">({cyclePercent.toFixed(1)}%)</small>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                        <small className="text-muted d-block">사용 일수</small>
                        <strong style={{ color }}>{stats.totalDays}일</strong>
                        <small className="text-muted ms-1">({dayPercent.toFixed(1)}%)</small>
                      </div>
                    </div>
                  </div>

                  {/* 비율 바 */}
                  <div className="mt-3">
                    <div className="progress" style={{ height: "8px", backgroundColor: "#073642" }}>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        style={{
                          width: `${dayPercent}%`,
                          backgroundColor: color,
                        }}
                        aria-valuenow={dayPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
