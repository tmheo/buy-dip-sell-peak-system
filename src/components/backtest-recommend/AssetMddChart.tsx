"use client";

/**
 * 자산 및 MDD 차트 컴포넌트
 * 원본 UI와 동일한 스타일로 구현
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
import type { DailySnapshotWithStrategy } from "@/backtest-recommend";

interface AssetMddChartProps {
  dailyHistory: DailySnapshotWithStrategy[];
  initialCapital: number;
}

export default function AssetMddChart({ dailyHistory, initialCapital }: AssetMddChartProps) {
  // MDD 차트 데이터 계산
  let peak = initialCapital;
  const chartData = dailyHistory.map((d, index) => {
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

  // X축 레이블 표시 간격 계산
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8));

  return (
    <div style={{ height: "220px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#073642" />
          <XAxis
            dataKey="index"
            tick={{ fontSize: 10, fill: "#93a1a1" }}
            interval={tickInterval}
            axisLine={{ stroke: "#073642" }}
            tickLine={{ stroke: "#073642" }}
            tickFormatter={(index) => {
              const point = chartData[index];
              return point ? point.date : "";
            }}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            stroke="#93a1a1"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            axisLine={{ stroke: "#073642" }}
            tickLine={{ stroke: "#073642" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#ff5370"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            domain={["auto", 0]}
            axisLine={{ stroke: "#073642" }}
            tickLine={{ stroke: "#073642" }}
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
              if (name === "MDD") return [`${Number(value).toFixed(2)}%`, String(name)];
              return [`$${Number(value).toLocaleString()}`, String(name)];
            }}
            labelFormatter={(label, payload) => {
              if (payload && payload[0]) {
                return payload[0].payload.fullDate;
              }
              return label;
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "0.75rem" }}
            iconSize={10}
          />
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
  );
}
