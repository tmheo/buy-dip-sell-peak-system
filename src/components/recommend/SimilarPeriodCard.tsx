"use client";

/**
 * 유사 구간 카드 컴포넌트
 * 유사 구간의 정보와 백테스트 결과를 표시
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

import type { SimilarPeriod } from "@/recommend/types";

export interface SimilarPeriodCardProps {
  period: SimilarPeriod;
  rank: 1 | 2 | 3;
}

// 순위별 색상 (금/은/동)
const RANK_COLORS: Record<1 | 2 | 3, { primary: string; secondary: string }> = {
  1: { primary: "#ffc107", secondary: "#d4a106" },
  2: { primary: "#adb5bd", secondary: "#6c757d" },
  3: { primary: "#cd7f32", secondary: "#a66628" },
};

// 전략별 배지 색상
const STRATEGY_COLORS: Record<string, string> = {
  Pro1: "#268bd2",
  Pro2: "#2aa198",
  Pro3: "#6c71c4",
};

export default function SimilarPeriodCard({ period, rank }: SimilarPeriodCardProps): React.ReactElement {
  const cardColor = RANK_COLORS[rank];
  const similarityPercent = (period.similarity * 100).toFixed(2);
  const endDateShort = period.endDate.slice(5);
  const perfEndDateShort = period.performanceEndDate.slice(5);

  return (
    <div className="col-12 col-lg-4 mb-3">
      <div className="card bg-dark h-100" style={{ borderColor: cardColor.primary }}>
        {/* 헤더 */}
        <div
          className="card-header text-white d-flex justify-content-between align-items-center"
          style={{ backgroundColor: cardColor.secondary }}
        >
          <strong>#{rank} 유사 구간</strong>
          <span className="badge bg-light text-dark">유사도 {similarityPercent}%</span>
        </div>

        <div className="card-body">
          {/* 차트 */}
          {period.chartData && period.chartData.length > 0 && (
            <div style={{ width: "100%", height: 180, marginBottom: "0.75rem" }}>
              <ResponsiveContainer>
                <LineChart
                  data={period.chartData.map((d) => ({
                    ...d,
                    date: d.date.slice(5), // MM-DD 형식
                    fullDate: d.date,
                  }))}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#073642" />
                  <XAxis
                    dataKey="date"
                    stroke="#839496"
                    fontSize={9}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#839496"
                    fontSize={9}
                    tickLine={false}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => v.toFixed(0)}
                    scale="log"
                    width={35}
                  />
                  {/* 성과 확인 구간 (파란색 음영) */}
                  <ReferenceArea
                    x1={endDateShort}
                    x2={perfEndDateShort}
                    fill="#268bd2"
                    fillOpacity={0.15}
                  />
                  {/* 분석 구간 종료일(기준일) 표시 */}
                  <ReferenceLine
                    x={period.endDate.slice(5)}
                    stroke="#dc3545"
                    strokeDasharray="3 3"
                    label={{ value: "기준일", fill: "#dc3545", fontSize: 8 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#002b36",
                      border: "1px solid #073642",
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item?.fullDate || label;
                    }}
                    formatter={(value, name) => [
                      typeof value === "number" ? value.toFixed(2) : String(value),
                      name === "close" ? "종가" : name === "ma20" ? "MA20" : name === "ma60" ? "MA60" : name,
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="#839496"
                    strokeWidth={1.5}
                    dot={false}
                    name="close"
                  />
                  <Line
                    type="monotone"
                    dataKey="ma20"
                    stroke="#b58900"
                    strokeWidth={1}
                    dot={false}
                    name="ma20"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="ma60"
                    stroke="#cb4b16"
                    strokeWidth={1}
                    dot={false}
                    name="ma60"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 구간 정보 */}
          <div className="row mb-3" style={{ fontSize: "0.85rem" }}>
            <div className="col-6">
              <small className="text-muted d-block">분석 구간</small>
              <span className="text-break">{period.startDate} ~ {period.endDate}</span>
            </div>
            <div className="col-6">
              <small className="text-muted d-block">성과 확인 구간</small>
              <span className="text-break">{period.performanceStartDate} ~ {period.performanceEndDate}</span>
            </div>
          </div>

          <hr className="border-secondary" />

          {/* 기술적 지표 요약 */}
          <div className="mb-3">
            <small className="text-muted d-block mb-2">기술적 지표</small>
            <div className="row g-1" style={{ fontSize: "0.75rem" }}>
              <div className="col-4">
                <div className="p-1 rounded text-center" style={{ backgroundColor: "#073642" }}>
                  <small className="text-muted d-block">정배열</small>
                  <span style={{ color: "#2aa198" }}>
                    {period.metrics.isGoldenCross ? "✓" : "✗"} {period.metrics.goldenCross.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="col-4">
                <div className="p-1 rounded text-center" style={{ backgroundColor: "#073642" }}>
                  <small className="text-muted d-block">기울기</small>
                  <span style={{ color: "#b58900" }}>{period.metrics.maSlope.toFixed(1)}%</span>
                </div>
              </div>
              <div className="col-4">
                <div className="p-1 rounded text-center" style={{ backgroundColor: "#073642" }}>
                  <small className="text-muted d-block">이격도</small>
                  <span style={{ color: "#cb4b16" }}>{period.metrics.disparity.toFixed(1)}%</span>
                </div>
              </div>
              <div className="col-4">
                <div className="p-1 rounded text-center" style={{ backgroundColor: "#073642" }}>
                  <small className="text-muted d-block">RSI</small>
                  <span style={{ color: "#6c71c4" }}>{period.metrics.rsi14.toFixed(1)}</span>
                </div>
              </div>
              <div className="col-4">
                <div className="p-1 rounded text-center" style={{ backgroundColor: "#073642" }}>
                  <small className="text-muted d-block">ROC</small>
                  <span style={{ color: "#d33682" }}>{period.metrics.roc12.toFixed(1)}%</span>
                </div>
              </div>
              <div className="col-4">
                <div className="p-1 rounded text-center" style={{ backgroundColor: "#073642" }}>
                  <small className="text-muted d-block">변동성</small>
                  <span style={{ color: "#268bd2" }}>{period.metrics.volatility20.toFixed(3)}</span>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-secondary" />

          {/* 백테스트 결과 */}
          <div>
            <small className="text-muted d-block mb-2">성과 확인 구간 백테스트 결과</small>
            <table className="table table-dark table-sm mb-0" style={{ fontSize: "0.85rem" }}>
              <thead>
                <tr className="text-muted">
                  <th>전략</th>
                  <th className="text-end">수익률</th>
                  <th className="text-end">MDD</th>
                </tr>
              </thead>
              <tbody>
                {(["Pro1", "Pro2", "Pro3"] as const).map((strategy) => {
                  const result = period.backtestResults[strategy];
                  const returnRate = result.returnRate * 100;
                  const mdd = result.mdd * 100;

                  return (
                    <tr key={strategy}>
                      <td>
                        <span className="badge" style={{ backgroundColor: STRATEGY_COLORS[strategy] }}>
                          {strategy}
                        </span>
                      </td>
                      <td className={`text-end ${returnRate >= 0 ? "price-up" : "price-down"}`}>
                        {returnRate >= 0 ? "+" : ""}{returnRate.toFixed(1)}%
                      </td>
                      <td className="text-end price-down">{mdd.toFixed(1)}%</td>
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
