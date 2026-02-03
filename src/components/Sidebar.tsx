// Sidebar 컴포넌트 - 최근 주가 사이드바
// Server Component (async)

import { getLatestPrices } from "@/database/prices";

interface PriceData {
  date: string;
  adjClose: number;
  change: number;
}

// 원본 데이터를 변동률 포함 PriceData 배열로 변환
function calculatePriceData(rawData: { date: string; adjClose: number }[]): PriceData[] {
  const priceData: PriceData[] = [];

  for (let i = 0; i < rawData.length - 1 && i < 10; i++) {
    const current = rawData[i];
    const previous = rawData[i + 1];

    // 변동률 계산: ((현재 - 이전) / 이전) * 100
    const change = ((current.adjClose - previous.adjClose) / previous.adjClose) * 100;

    priceData.push({
      date: current.date,
      adjClose: current.adjClose,
      change: change,
    });
  }

  return priceData;
}

// 주가 테이블 렌더링 컴포넌트
function PriceTable({ ticker, priceData }: { ticker: string; priceData: PriceData[] }) {
  if (priceData.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span role="img" aria-label="calendar">
            &#x1F4C5;
          </span>{" "}
          최근 주가 ({ticker})
        </div>
        <div className="card-body">
          <p className="text-muted mb-0">데이터가 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span role="img" aria-label="calendar">
          &#x1F4C5;
        </span>{" "}
        최근 주가 ({ticker})
      </div>
      <div className="card-body p-0">
        <table className="table table-dark table-striped table-hover mb-0">
          <thead>
            <tr>
              <th className="text-center">날짜</th>
              <th className="text-center">종가</th>
            </tr>
          </thead>
          <tbody>
            {priceData.map((data) => (
              <tr key={data.date}>
                <td>{data.date}</td>
                <td className={`text-end ${data.change >= 0 ? "price-up" : "price-down"}`}>
                  {data.adjClose.toFixed(2)} ({data.change >= 0 ? "▲" : "▼"}
                  {Math.abs(data.change).toFixed(2)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function Sidebar() {
  // 11일 데이터 조회 (10일 표시 + 변동률 계산용 1일)
  // PostgreSQL 버전: getLatestPrices(ticker, limit)
  const soxlRawData = await getLatestPrices("SOXL", 11);
  const tqqqRawData = await getLatestPrices("TQQQ", 11);

  // 변동률 계산하여 PriceData 배열 생성 (최근 10일만)
  const soxlPriceData = calculatePriceData(soxlRawData);
  const tqqqPriceData = calculatePriceData(tqqqRawData);

  return (
    <aside id="fixedSidebar">
      <PriceTable ticker="SOXL" priceData={soxlPriceData} />
      <PriceTable ticker="TQQQ" priceData={tqqqPriceData} />
    </aside>
  );
}
