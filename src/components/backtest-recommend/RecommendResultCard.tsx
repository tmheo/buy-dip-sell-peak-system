"use client";

/**
 * 추천 백테스트 결과 요약 카드
 * 전체 백테스트 성과 요약 정보를 표시
 */
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { RecommendBacktestResult } from "@/backtest-recommend";

interface RecommendResultCardProps {
  result: RecommendBacktestResult;
}

export default function RecommendResultCard({ result }: RecommendResultCardProps) {
  // MDD 차트 데이터 계산
  let peak = result.initialCapital;
  const chartData = result.dailyHistory.map((d, index) => {
    if (d.totalAsset > peak) {
      peak = d.totalAsset;
    }
    const mdd = peak > 0 ? ((d.totalAsset - peak) / peak) * 100 : 0;

    return {
      index,
      date: d.date.slice(5), // MM-DD
      fullDate: d.date,
      자산: d.totalAsset,
      MDD: mdd,
    };
  });

  return (
    <section className="info-section">
      <div className="row g-4">
        {/* 왼쪽: 투자 성과 요약 */}
        <div className="col-12 col-lg-4">
          <div className="card bg-dark h-100" style={{ borderColor: "#859900" }}>
            <div
              className="card-header text-white text-center"
              style={{ backgroundColor: "#586e75" }}
            >
              <strong>📊 투자 상황</strong>
            </div>
            <div className="card-body">
              {/* 기본 정보 */}
              <div className="row g-2 mb-3">
                <div className="col-6">
                  <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                    <small className="text-muted d-block">💰 초기 투자금</small>
                    <strong>${result.initialCapital.toLocaleString()}</strong>
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                    <small className="text-muted d-block">💵 최종 자산</small>
                    <strong>${result.finalAsset.toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              {/* 수익 정보 */}
              <div className="row g-2 mb-3">
                <div className="col-6">
                  <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                    <small className="text-muted d-block">📈 총 수익률</small>
                    <strong className={result.returnRate >= 0 ? "price-up" : "price-down"}>
                      {result.returnRate >= 0 ? "+" : ""}
                      {(result.returnRate * 100).toFixed(2)}%
                    </strong>
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                    <small className="text-muted d-block">📊 CAGR</small>
                    <strong className={result.cagr >= 0 ? "price-up" : "price-down"}>
                      {result.cagr >= 0 ? "+" : ""}
                      {(result.cagr * 100).toFixed(2)}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* MDD 및 사이클 */}
              <div className="row g-2 mb-3">
                <div className="col-6">
                  <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                    <small className="text-muted d-block">📉 최대 낙폭(MDD)</small>
                    <strong className="price-down">{(result.mdd * 100).toFixed(1)}%</strong>
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                    <small className="text-muted d-block">🔄 총 사이클</small>
                    <strong>{result.totalCycles}회</strong>
                  </div>
                </div>
              </div>

              {/* 승률 */}
              <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                <small className="text-muted d-block">🎯 승률</small>
                <strong className={result.winRate >= 0.5 ? "price-up" : "price-down"}>
                  {(result.winRate * 100).toFixed(1)}%
                </strong>
                <small className="text-muted ms-2">
                  (완료 사이클 {result.completedCycles.length}개 기준)
                </small>
              </div>

              {/* 잔여 티어 정보 */}
              {result.remainingTiers.length > 0 && (
                <>
                  <hr className="border-secondary" />
                  <div>
                    <small className="text-muted d-block mb-2">잔여 티어 (보유 주식)</small>
                    <div
                      className="p-2 rounded"
                      style={{ backgroundColor: "#073642", fontSize: "0.85rem" }}
                    >
                      <div className="row g-1">
                        <div className="col-6">
                          <small className="text-muted">보유 티어</small>
                          <div>{result.remainingTiers.map((t) => t.tier).join(", ")}</div>
                        </div>
                        <div className="col-6">
                          <small className="text-muted">전체 수량</small>
                          <div>
                            {result.remainingTiers.reduce((sum, t) => sum + t.shares, 0)}주
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 자산 및 MDD 차트 */}
        <div className="col-12 col-lg-8">
          <div className="card bg-dark h-100" style={{ borderColor: "#268bd2" }}>
            <div
              className="card-header text-white text-center"
              style={{ backgroundColor: "#586e75" }}
            >
              <strong>📈 자산 및 MDD 차트</strong>
            </div>
            <div className="card-body">
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#073642" />
                    <XAxis
                      dataKey="index"
                      tick={{ fontSize: 10, fill: "#93a1a1" }}
                      tickFormatter={(value) => {
                        const item = chartData[value];
                        return item ? item.date : "";
                      }}
                      interval={Math.floor(chartData.length / 10)}
                    />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      stroke="#93a1a1"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#ff5370"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${v.toFixed(0)}%`}
                      domain={["auto", 0]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#002b36",
                        border: "1px solid #073642",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                      }}
                      formatter={(value, name) => {
                        if (value === undefined) return ["N/A", String(name)];
                        if (name === "MDD") return [`${Number(value).toFixed(1)}%`, String(name)];
                        return [`$${Number(value).toLocaleString()}`, String(name)];
                      }}
                      labelFormatter={(label, payload) => {
                        if (payload && payload[0]) {
                          return payload[0].payload.fullDate;
                        }
                        return label;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="MDD"
                      fill="rgba(255, 83, 112, 0.3)"
                      stroke="#ff5370"
                      strokeWidth={1}
                      name="MDD"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="자산"
                      stroke="#859900"
                      strokeWidth={2}
                      dot={false}
                      name="자산"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
