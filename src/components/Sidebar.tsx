// Sidebar 컴포넌트 - 최근 주가 사이드바
// Server Component

interface PriceData {
  date: string;
  close: number;
  change: number;
}

// 목업 데이터
const mockPriceData: PriceData[] = [
  { date: '2026-01-15', close: 28.45, change: 2.3 },
  { date: '2026-01-14', close: 27.81, change: -1.8 },
  { date: '2026-01-13', close: 28.32, change: 0.5 },
  { date: '2026-01-10', close: 28.18, change: -0.7 },
  { date: '2026-01-09', close: 28.38, change: 1.2 },
];

export default function Sidebar() {
  return (
    <aside id="fixedSidebar">
      <div className="card">
        <div className="card-header">
          <span role="img" aria-label="calendar">&#x1F4C5;</span> 최근 주가 (SOXL)
        </div>
        <div className="card-body p-0">
          <table className="table table-dark table-striped table-hover mb-0">
            <thead>
              <tr>
                <th>날짜</th>
                <th className="text-end">종가</th>
                <th className="text-end">변동</th>
              </tr>
            </thead>
            <tbody>
              {mockPriceData.map((data) => (
                <tr key={data.date}>
                  <td>{data.date}</td>
                  <td className="text-end">${data.close.toFixed(2)}</td>
                  <td
                    className={`text-end ${
                      data.change >= 0 ? 'price-up' : 'price-down'
                    }`}
                  >
                    {data.change >= 0 ? '+' : ''}
                    {data.change.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}
