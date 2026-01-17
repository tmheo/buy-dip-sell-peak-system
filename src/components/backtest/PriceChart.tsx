"use client";

/**
 * 가격 차트 컴포넌트
 * 수정종가 + MA20 + MA60 라인 차트
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DailySnapshot } from "@/backtest/types";

interface PriceChartProps {
  data: DailySnapshot[];
  ticker: string;
}

// 커스텀 툴팁 컴포넌트
interface ChartDataPoint {
  date: string;
  fullDate: string;
  종가: number;
  MA20: number | null;
  MA60: number | null;
  index: number;
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number | null;
  payload: ChartDataPoint;
  color: string;
  name: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // payload 배열에서 첫 번째 항목의 payload가 전체 데이터 포인트를 포함
  const data = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: "#002b36",
        border: "1px solid #073642",
        borderRadius: "4px",
        padding: "8px 12px",
      }}
    >
      <p style={{ color: "#93a1a1", margin: "0 0 4px 0" }}>{data.fullDate}</p>
      {data.MA20 !== null && (
        <p style={{ color: "#2aa198", margin: "2px 0" }}>MA20: ${data.MA20.toFixed(2)}</p>
      )}
      {data.MA60 !== null && (
        <p style={{ color: "#d33682", margin: "2px 0" }}>MA60: ${data.MA60.toFixed(2)}</p>
      )}
      <p style={{ color: "#ffc107", margin: "2px 0" }}>종가: ${data.종가.toFixed(2)}</p>
    </div>
  );
}

export default function PriceChart({ data, ticker }: PriceChartProps) {
  // 차트 데이터 변환 - 인덱스를 포함하여 고유성 확보
  const chartData: ChartDataPoint[] = data.map((d, index) => ({
    date: d.date.slice(5), // MM-DD 형식 (표시용)
    fullDate: d.date,
    종가: d.adjClose,
    MA20: d.ma20,
    MA60: d.ma60,
    index, // 고유 인덱스 추가
  }));

  // 실제 거래일 기준 시작/종료일 (데이터의 첫날/마지막날)
  const actualStartDate = data.length > 0 ? data[0].date : "";
  const actualEndDate = data.length > 0 ? data[data.length - 1].date : "";

  return (
    <div className="card bg-dark mb-4">
      <div className="card-header bg-secondary text-white">
        <strong>
          📈 {ticker} 차트 (logscale) {actualStartDate} ~ {actualEndDate}
        </strong>
      </div>
      <div className="card-body" style={{ height: "350px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#073642" />
            <XAxis
              dataKey="index"
              stroke="#93a1a1"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
              tickFormatter={(index) => {
                const point = chartData[index];
                return point ? point.date : "";
              }}
            />
            <YAxis
              stroke="#93a1a1"
              tick={{ fontSize: 11 }}
              scale="log"
              domain={["auto", "auto"]}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: "10px" }} />
            <Line
              type="monotone"
              dataKey="종가"
              stroke="#ffc107"
              strokeWidth={2}
              dot={false}
              name="종가"
            />
            <Line
              type="monotone"
              dataKey="MA20"
              stroke="#2aa198"
              strokeWidth={1.5}
              dot={false}
              name="MA20"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="MA60"
              stroke="#d33682"
              strokeWidth={1.5}
              dot={false}
              name="MA60"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
