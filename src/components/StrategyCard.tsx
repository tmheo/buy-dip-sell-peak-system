// StrategyCard 컴포넌트 - 전략 카드
// Server Component

interface StrategyCardProps {
  title: string;
  subtitle: string;
  tierRatios: string[];
  splits: number;
  stopLossDays: number;
  buyThreshold: string;
  sellThreshold: string;
  feature: string;
}

export default function StrategyCard({
  title,
  subtitle,
  tierRatios,
  splits,
  stopLossDays,
  buyThreshold,
  sellThreshold,
  feature,
}: StrategyCardProps) {
  return (
    <div className="card strategy-card bg-dark h-100">
      <div className="card-header bg-secondary text-white text-center">
        <strong>{title}</strong>
        <div className="small text-light">{subtitle}</div>
      </div>
      <div className="card-body">
        {/* 티어별 분할 비율 */}
        <div className="mb-3">
          <div className="small text-muted mb-1">분할 비율</div>
          <div className="tier-ratios">
            {tierRatios.map((ratio, index) => (
              <span key={index} className="badge bg-primary me-1 mb-1">
                {index + 1}티어: {ratio}
              </span>
            ))}
          </div>
        </div>

        {/* 설정값 */}
        <div className="strategy-settings">
          <div className="setting-item d-flex justify-content-between">
            <span className="text-muted">분할 수</span>
            <span>{splits}분할</span>
          </div>
          <div className="setting-item d-flex justify-content-between">
            <span className="text-muted">손절일</span>
            <span>{stopLossDays}일</span>
          </div>
          <div className="setting-item d-flex justify-content-between">
            <span className="text-muted">매수 기준</span>
            <span className="text-danger">{buyThreshold}</span>
          </div>
          <div className="setting-item d-flex justify-content-between">
            <span className="text-muted">매도 기준</span>
            <span className="text-success">{sellThreshold}</span>
          </div>
        </div>

        {/* 특징 */}
        <div className="mt-3 pt-3 border-top border-secondary">
          <div className="small text-info text-center">💡 {feature}</div>
        </div>
      </div>
    </div>
  );
}
