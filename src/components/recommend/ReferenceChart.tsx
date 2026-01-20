"use client";

/**
 * 기준일 차트 및 기술적 지표 컴포넌트
 * 분석 구간의 차트와 기술적 지표 6개를 표시
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

import type { TechnicalMetrics, ChartDataPoint } from "@/recommend/types";

export interface ReferenceChartProps {
  metrics: TechnicalMetrics;
  ticker: string;
  analysisPeriod: {
    startDate: string;
    endDate: string;
  };
  chartData?: ChartDataPoint[];
  referenceDate?: string;
}

interface MetricDisplayProps {
  title: string;
  value: number | null | undefined;
  unit?: string;
  color: string;
  isBoolean?: boolean;
  booleanValue?: boolean;
  decimalPlaces?: number;
}

/** 숫자 값을 포맷팅 (null/undefined/NaN 처리) */
function formatValue(value: number | null | undefined, decimalPlaces: number, unit: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value.toFixed(decimalPlaces)}${unit}`;
}

/** 개별 지표 표시 컴포넌트 */
function MetricDisplay({ title, value, unit = "", color, isBoolean = false, booleanValue, decimalPlaces = 2 }: MetricDisplayProps): React.ReactElement {
  let displayValue: string;
  if (isBoolean) {
    const prefix = booleanValue ? "✓ " : "✗ ";
    displayValue = prefix + formatValue(value, decimalPlaces, unit);
  } else {
    displayValue = formatValue(value, decimalPlaces, unit);
  }

  return (
    <div className="col-6 col-lg-4 col-xl-2 mb-3">
      <div className="card h-100" style={{ backgroundColor: "#073642" }}>
        <div className="card-header bg-secondary text-white py-2" style={{ fontSize: "0.85rem" }}>
          {title}
        </div>
        <div className="card-body d-flex align-items-center justify-content-center" style={{ minHeight: "60px" }}>
          <span className="fw-bold" style={{ fontSize: "1.3rem", color }}>
            {displayValue}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ReferenceChart({ metrics, ticker, analysisPeriod, chartData, referenceDate }: ReferenceChartProps): React.ReactElement {
  const formattedChartData = chartData?.map((d) => ({
    ...d,
    date: d.date.slice(5),
    fullDate: d.date,
  }));

  const lastDate = formattedChartData?.[formattedChartData.length - 1]?.date;
  const refDateShort = referenceDate?.slice(5);
  const hasPerformancePeriod = refDateShort && lastDate && refDateShort !== lastDate;

  return (
    <div className="card bg-dark mb-4">
      <div className="card-header bg-secondary text-white">
        <div>
          <span style={{ color: "#ffc107" }}>🔥</span>
          <strong> 추천 기준일: {referenceDate}</strong>
        </div>
        <small style={{ color: "#6c757d" }}>
          📌 분석 구간: {analysisPeriod.startDate} ~ {analysisPeriod.endDate}
        </small>
      </div>
      <div className="card-body">
        {/* 차트 */}
        {formattedChartData && formattedChartData.length > 0 && (
          <div style={{ width: "100%", height: 300, marginBottom: "1rem" }}>
            <ResponsiveContainer>
              <LineChart
                data={formattedChartData}
                margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#073642" />
                <XAxis
                  dataKey="date"
                  stroke="#839496"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#839496"
                  fontSize={11}
                  tickLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => v.toFixed(0)}
                  scale="log"
                  label={{
                    value: `${ticker} (logscale)`,
                    angle: -90,
                    position: "insideLeft",
                    fill: "#839496",
                    fontSize: 11,
                    dx: -5,
                  }}
                />
                {/* 성과 확인 구간 (파란색 음영) */}
                {hasPerformancePeriod && (
                  <ReferenceArea
                    x1={refDateShort}
                    x2={lastDate}
                    fill="#268bd2"
                    fillOpacity={0.15}
                  />
                )}
                {/* 기준일 표시 */}
                {referenceDate && (
                  <ReferenceLine
                    x={referenceDate.slice(5)}
                    stroke="#dc3545"
                    strokeDasharray="5 5"
                    label={{ value: "기준일", fill: "#dc3545", fontSize: 10 }}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#002b36",
                    border: "1px solid #073642",
                    borderRadius: "4px",
                  }}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.fullDate || label;
                  }}
                  formatter={(value, name) => [
                    typeof value === "number" ? value.toFixed(2) : String(value),
                    name === "close" ? "종가" : name,
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  align="left"
                  wrapperStyle={{
                    fontSize: "11px",
                    paddingLeft: "50px",
                    paddingTop: "5px",
                  }}
                  formatter={(value) => {
                    const names: Record<string, string> = {
                      close: "종가",
                      ma20: "MA20",
                      ma60: "MA60",
                    };
                    return names[value] || value;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#839496"
                  strokeWidth={2}
                  dot={false}
                  name="close"
                />
                <Line
                  type="monotone"
                  dataKey="ma20"
                  stroke="#b58900"
                  strokeWidth={1.5}
                  dot={false}
                  name="ma20"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="ma60"
                  stroke="#cb4b16"
                  strokeWidth={1.5}
                  dot={false}
                  name="ma60"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 기술적 지표 */}
        <div className="row">
          <MetricDisplay
            title="정배열(20ma-60ma)"
            value={metrics.goldenCross}
            unit="%"
            color="#2aa198"
            isBoolean={true}
            booleanValue={metrics.isGoldenCross}
          />
          <MetricDisplay
            title="기울기(20ma 10일)"
            value={metrics.maSlope}
            unit="%"
            color="#b58900"
          />
          <MetricDisplay
            title="이격도(주가/20ma)"
            value={metrics.disparity}
            unit="%"
            color="#cb4b16"
          />
          <MetricDisplay
            title="RSI(14)"
            value={metrics.rsi14}
            color="#6c71c4"
          />
          <MetricDisplay
            title="ROC(12)"
            value={metrics.roc12}
            unit="%"
            color="#d33682"
          />
          <MetricDisplay
            title="변동성(20day)"
            value={metrics.volatility20}
            color="#268bd2"
            decimalPlaces={4}
          />
        </div>
      </div>
    </div>
  );
}
