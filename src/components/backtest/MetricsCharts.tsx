"use client";

/**
 * 6개 기술적 지표 차트 컴포넌트
 * 정배열, 기울기, 이격도, RSI, ROC, 변동성
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
} from "recharts";
import type { DailyTechnicalMetrics, TechnicalMetrics } from "@/backtest/types";

interface MetricsChartsProps {
  dailyMetrics: DailyTechnicalMetrics[];
  finalMetrics: TechnicalMetrics | null;
}

// 개별 지표 차트 컴포넌트
function MetricChart({
  title,
  data,
  dataKey,
  color,
  finalValue,
  unit = "",
  referenceLine,
  decimalPlaces = 2,
}: {
  title: string;
  data: { date: string; value: number | null }[];
  dataKey: string;
  color: string;
  finalValue: number | null | undefined;
  unit?: string;
  referenceLine?: number;
  decimalPlaces?: number;
}) {
  const formattedValue =
    finalValue !== null && finalValue !== undefined
      ? `${finalValue.toFixed(decimalPlaces)}${unit}`
      : "N/A";

  return (
    <div className="col-6 col-lg-4 col-xl-2 mb-3">
      <div className="card bg-dark h-100">
        <div className="card-header bg-secondary text-white py-2" style={{ fontSize: "0.85rem" }}>
          <div className="d-flex justify-content-between align-items-center">
            <span>{title}</span>
            <span style={{ color }}>{formattedValue}</span>
          </div>
        </div>
        <div className="card-body p-1" style={{ height: "120px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#073642" />
              <XAxis dataKey="date" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#002b36",
                  border: "1px solid #073642",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                }}
                formatter={(value) => {
                  if (value === null || value === undefined) return ["N/A", dataKey];
                  return [`${Number(value).toFixed(decimalPlaces)}${unit}`, dataKey];
                }}
              />
              {referenceLine !== undefined && (
                <ReferenceLine y={referenceLine} stroke="#586e75" strokeDasharray="3 3" />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function MetricsCharts({ dailyMetrics, finalMetrics }: MetricsChartsProps) {
  // 각 지표별 데이터 변환
  const goldenCrossData = dailyMetrics.map((d) => ({
    date: d.date,
    value: d.goldenCross,
  }));

  const maSlopeData = dailyMetrics.map((d) => ({
    date: d.date,
    value: d.maSlope,
  }));

  const disparityData = dailyMetrics.map((d) => ({
    date: d.date,
    value: d.disparity,
  }));

  const rsi14Data = dailyMetrics.map((d) => ({
    date: d.date,
    value: d.rsi14,
  }));

  const roc12Data = dailyMetrics.map((d) => ({
    date: d.date,
    value: d.roc12,
  }));

  const volatilityData = dailyMetrics.map((d) => ({
    date: d.date,
    value: d.volatility20, // 소수점 그대로 유지
  }));

  return (
    <div className="row mb-4">
      <MetricChart
        title="정배열(20ma-60ma)"
        data={goldenCrossData}
        dataKey="goldenCross"
        color="#2aa198"
        finalValue={finalMetrics?.goldenCross}
        unit="%"
        referenceLine={0}
      />
      <MetricChart
        title="기울기(20ma 10일)"
        data={maSlopeData}
        dataKey="maSlope"
        color="#b58900"
        finalValue={finalMetrics?.maSlope}
        unit="%"
        referenceLine={0}
      />
      <MetricChart
        title="이격도(주가/20ma)"
        data={disparityData}
        dataKey="disparity"
        color="#cb4b16"
        finalValue={finalMetrics?.disparity}
        unit="%"
        referenceLine={0}
      />
      <MetricChart
        title="RSI(14)"
        data={rsi14Data}
        dataKey="rsi14"
        color="#6c71c4"
        finalValue={finalMetrics?.rsi14}
        referenceLine={50}
      />
      <MetricChart
        title="ROC(12)"
        data={roc12Data}
        dataKey="roc12"
        color="#d33682"
        finalValue={finalMetrics?.roc12}
        unit="%"
        referenceLine={0}
      />
      <MetricChart
        title="변동성(20day)"
        data={volatilityData}
        dataKey="volatility"
        color="#268bd2"
        finalValue={finalMetrics?.volatility20}
        decimalPlaces={4}
      />
    </div>
  );
}
