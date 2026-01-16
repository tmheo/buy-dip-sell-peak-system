// Info 페이지 - 서비스 소개
// Server Component

import StrategyCard from '@/components/StrategyCard';
import FlowChart from '@/components/FlowChart';

// 전략 데이터
const strategies = [
  {
    title: 'Pro1',
    splitRatio: '60 / 40',
    settings: ['DIP: 6%', 'PEAK: 8%', 'BOTTOM: 40%', 'MAX BUY: 10회'],
  },
  {
    title: 'Pro2',
    splitRatio: '50 / 50',
    settings: ['DIP: 5%', 'PEAK: 10%', 'BOTTOM: 35%', 'MAX BUY: 12회'],
  },
  {
    title: 'Pro3',
    splitRatio: '40 / 60',
    settings: ['DIP: 4%', 'PEAK: 12%', 'BOTTOM: 30%', 'MAX BUY: 15회'],
  },
];

// 플로우차트 단계
const flowchartSteps = [
  { number: '①', text: '추천 전략 확인' },
  { number: '②', text: '매수 시작' },
  { number: '③', text: '레이더 모니터링' },
  { number: '④', text: '매도 결정' },
  { number: '⑤', text: '사이클 종료' },
];

export default function InfoPage() {
  return (
    <div className="info-page">
      {/* 헤더 */}
      <section className="info-section">
        <h1>
          <span role="img" aria-label="info">&#x2139;&#xFE0F;</span> 떨사오팔 Pro 레이더 Info
        </h1>
        <p className="lead">
          SOXL ETF를 활용한 &apos;떨어지면 사고, 오르면 파는&apos; 투자 전략 시스템입니다.
        </p>
      </section>

      {/* 서비스 소개 */}
      <section className="info-section">
        <h2>서비스 소개</h2>
        <p>
          떨사오팔 Pro 레이더는 SOXL(Direxion Daily Semiconductor Bull 3X Shares) ETF에 특화된
          투자 전략 도구입니다. 변동성이 큰 레버리지 ETF의 특성을 활용하여,
          체계적인 분할 매수와 목표 수익 매도 전략을 제공합니다.
        </p>
        <div className="alert alert-info">
          <strong>주요 기능:</strong>
          <ul className="mb-0 mt-2">
            <li>실시간 주가 모니터링</li>
            <li>맞춤형 투자 전략 설정</li>
            <li>백테스트를 통한 전략 검증</li>
            <li>매매 신호 알림</li>
          </ul>
        </div>
      </section>

      {/* 전략 섹션 */}
      <section className="info-section">
        <h2>추천 전략</h2>
        <p className="mb-4">
          아래는 검증된 3가지 Pro 전략입니다. 각 전략은 투자 성향에 따라 선택할 수 있습니다.
        </p>
        <div className="row g-4">
          {strategies.map((strategy) => (
            <div key={strategy.title} className="col-12 col-md-4">
              <StrategyCard
                title={strategy.title}
                splitRatio={strategy.splitRatio}
                settings={strategy.settings}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 전략 차이점 */}
      <section className="info-section">
        <h2>전략별 차이점</h2>
        <div className="table-responsive">
          <table className="table table-dark table-bordered">
            <thead>
              <tr>
                <th>항목</th>
                <th>Pro1 (보수적)</th>
                <th>Pro2 (균형)</th>
                <th>Pro3 (공격적)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>현금 비중</td>
                <td>60%</td>
                <td>50%</td>
                <td>40%</td>
              </tr>
              <tr>
                <td>DIP 기준</td>
                <td>6% 하락</td>
                <td>5% 하락</td>
                <td>4% 하락</td>
              </tr>
              <tr>
                <td>PEAK 기준</td>
                <td>8% 상승</td>
                <td>10% 상승</td>
                <td>12% 상승</td>
              </tr>
              <tr>
                <td>특징</td>
                <td>안정적, 빈번한 매매</td>
                <td>균형잡힌 전략</td>
                <td>고수익 추구, 인내 필요</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 사용 플로우 */}
      <section className="info-section">
        <h2>사용 방법</h2>
        <p className="mb-4">
          떨사오팔 Pro 레이더의 기본 사용 흐름입니다.
        </p>
        <FlowChart steps={flowchartSteps} />
      </section>

      {/* 면책 조항 */}
      <section className="info-section">
        <h2>면책 조항</h2>
        <div className="alert alert-warning">
          <p className="mb-2">
            <strong>투자 주의사항:</strong>
          </p>
          <ul className="mb-0">
            <li>본 서비스는 투자 참고용이며, 투자 결정에 대한 책임은 본인에게 있습니다.</li>
            <li>SOXL은 3배 레버리지 ETF로 높은 변동성을 가지며, 원금 손실 위험이 있습니다.</li>
            <li>과거 수익률이 미래 수익을 보장하지 않습니다.</li>
            <li>투자 전 충분한 학습과 자기 판단이 필요합니다.</li>
          </ul>
        </div>
      </section>

      {/* 연락처 */}
      <section className="info-section">
        <h2>문의하기</h2>
        <p>
          서비스 관련 문의나 피드백은 아래 이메일로 연락해 주세요.
        </p>
        <p>
          <strong>이메일:</strong>{' '}
          <a href="mailto:support@radar0458.pro" className="text-info">
            support@radar0458.pro
          </a>
        </p>
      </section>
    </div>
  );
}
