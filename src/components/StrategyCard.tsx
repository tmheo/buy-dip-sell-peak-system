// StrategyCard 컴포넌트 - 전략 카드
// Server Component

interface StrategyCardProps {
  title: string;
  splitRatio: string;
  settings: string[];
}

export default function StrategyCard({
  title,
  splitRatio,
  settings,
}: StrategyCardProps) {
  // splitRatio를 파싱 (예: "60 / 40")
  const [cash, invest] = splitRatio.split(' / ').map((s) => s.trim());

  return (
    <div className="card strategy-card bg-dark">
      <div className="card-header bg-secondary text-white">
        {title}
      </div>
      <div className="card-body">
        {/* 비율 표시 */}
        <div className="split-ratio">
          <span className="ratio-part ratio-cash">{cash}%</span>
          <span>/</span>
          <span className="ratio-part ratio-invest">{invest}%</span>
        </div>
        <p className="text-center text-muted small mb-3">
          현금 / 투자금
        </p>

        {/* 설정 그리드 */}
        <div className="strategy-settings">
          {settings.map((setting, index) => (
            <div key={index} className="setting-item">
              {setting}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
