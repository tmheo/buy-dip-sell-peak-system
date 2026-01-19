// Info 페이지 - 서비스 소개
// Server Component

import StrategyCard from "@/components/StrategyCard";
import FlowChart from "@/components/FlowChart";

// 전략 데이터 (원본 사이트와 동일)
const strategies = [
  {
    title: "Pro1",
    subtitle: "보수적 접근",
    tierRatios: ["5.0%", "10.0%", "15.0%", "20.0%", "25.0%", "25.0%", "예비"],
    splits: 6,
    stopLossDays: 10,
    buyThreshold: "-0.01%",
    sellThreshold: "+0.01%",
    feature: "보수적인 mdd가 낮은 전략",
  },
  {
    title: "Pro2",
    subtitle: "균형잡힌 효율성",
    tierRatios: ["10.0%", "15.0%", "20.0%", "25.0%", "20.0%", "10.0%", "예비"],
    splits: 6,
    stopLossDays: 10,
    buyThreshold: "-0.01%",
    sellThreshold: "+1.50%",
    feature: "효율적이면서 대부분 적중하는 전략",
  },
  {
    title: "Pro3",
    subtitle: "공격적 전략",
    tierRatios: ["16.7%", "16.7%", "16.7%", "16.7%", "16.7%", "16.7%", "예비"],
    splits: 6,
    stopLossDays: 12,
    buyThreshold: "-0.10%",
    sellThreshold: "+2.00%",
    feature: "공격적인 전략",
  },
];

// 플로우차트 단계 (원본 사이트와 동일)
const flowchartSteps = [
  { number: "①", text: "추천 전략 확인" },
  { number: "②", text: "전략 선택" },
  { number: "③", text: "매일 주문표대로 주문" },
  { number: "④", text: "모든 티어 매도 시" },
  { number: "⑤", text: "다음 전략 확인" },
];

// 원론과의 차이점
const differences = [
  {
    title: "6분할 / 10일 손절",
    description: "백테스트 결과 최효율값",
  },
  {
    title: "손절일도 매수",
    description: "급격한 낙폭 대응",
  },
  {
    title: "진행 중 시드 고정",
    description: "단리 전략, 리스크 최소화",
  },
  {
    title: "정액 매수 미실시",
    description: "MDD 감소 목적",
  },
  {
    title: "예비 티어",
    description: "6티어 가득 시 남은 자금을 7티어로 활용",
  },
];

export default function InfoPage() {
  return (
    <div className="info-page">
      {/* 헤더 */}
      <section className="info-section">
        <h1>
          <span role="img" aria-label="info">
            ℹ️
          </span>{" "}
          떨사오팔 Pro 레이더 Info
        </h1>
      </section>

      {/* 떨사오팔 Pro 레이더란? */}
      <section className="info-section">
        <h2>📡 떨사오팔 Pro 레이더는?</h2>
        <p className="lead">떨사오팔을 더 강력하게 도와주는 도구입니다.</p>
      </section>

      {/* 떨사오팔이란? */}
      <section className="info-section">
        <h2>🤔 떨사오팔이란?</h2>
        <div className="alert alert-info">
          <p className="mb-2">
            <strong>&apos;떨사오팔&apos;</strong>의 최초 전략을 고안하신 분은{" "}
            <strong>[이서방v]</strong>님입니다.
          </p>
          <p className="mb-2">Pro는 &apos;떨사오팔&apos;을 변형한 전략입니다.</p>
          <p className="mb-2">
            시드를 분할하여 순차적으로 투자하며{" "}
            <strong>&quot;떨어지면 사고 오르면 파는&quot;</strong> 방식입니다.
          </p>
          <p className="mb-0">기본적으로 떨사오팔 방법에 대한 숙지가 필수입니다.</p>
        </div>
      </section>

      {/* Pro1/Pro2/Pro3 전략이란? */}
      <section className="info-section">
        <h2>⚙️ Pro1 / Pro2 / Pro3 전략이란?</h2>
        <div className="row g-4">
          {strategies.map((strategy) => (
            <div key={strategy.title} className="col-12 col-lg-4">
              <StrategyCard
                title={strategy.title}
                subtitle={strategy.subtitle}
                tierRatios={strategy.tierRatios}
                splits={strategy.splits}
                stopLossDays={strategy.stopLossDays}
                buyThreshold={strategy.buyThreshold}
                sellThreshold={strategy.sellThreshold}
                feature={strategy.feature}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 원론과의 차이점 */}
      <section className="info-section">
        <h2>📐 떨사오팔Pro가 떨사오팔(원론)과 다른 부분</h2>
        <div className="table-responsive">
          <table className="table table-dark table-bordered">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>항목</th>
                <th>설명</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((diff, index) => (
                <tr key={index}>
                  <td>
                    <strong>{diff.title}</strong>
                  </td>
                  <td>{diff.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 사용법 간단히 보기 */}
      <section className="info-section">
        <h2>📙 사용법 간단히 보기 (사이클 루틴)</h2>
        <FlowChart steps={flowchartSteps} />
      </section>

      {/* 전략 추천 기능 사용법 */}
      <section className="info-section">
        <h2>📙 전략 추천 기능 사용법</h2>
        <ul className="list-unstyled mb-0">
          <li>• 새로운 사이클을 시작할 때 <strong>추천 전략</strong>을 확인하고 선택하세요.</li>
          <li>• 반드시 추천된 전략을 따를 필요는 없지만, <strong>유사 구간의 성과를 참고</strong>하여 결정하는 것이 좋습니다.</li>
          <li>• 사이클 진행 중에는 전략을 변경하지 않습니다.</li>
          <li>• 사이클이 종료되면 <strong>다시 추천을 확인</strong>하고 새로운 전략으로 시작하세요 (예: 모든 티어 매도 시).</li>
          <li>• 티어가 비어있을 때는 항상 최신의 추천을 확인해서 적용하세요. (예: 연속 며칠간 매수가 안될 때)</li>
        </ul>
      </section>

      {/* 추가 정보 */}
      <section className="info-section">
        <h2>추가 정보</h2>
        <ul className="list-unstyled mb-0">
          <li>• 전략 추천 시 종합 점수 계산 공식 : 점수 = 수익률 × e^(MDD × 가중치)</li>
        </ul>
      </section>

      {/* 면책 조항 */}
      <section className="info-section">
        <h2>⛔ 면책 조항</h2>
        <div className="alert alert-warning">
          <p className="mb-2">
            <strong>본 프로그램은 백테스트 도구(Tool)입니다.</strong>
          </p>
          <p className="mb-2">백테스트 결과는 참고용이며 미래 결과를 보장하지 않습니다.</p>
          <p className="mb-0">
            사용자가 본 프로그램 이용으로 발생한 모든 결과에 대해{" "}
            <strong>개발자에게 법적 책임을 묻지 않음</strong>에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </section>

      {/* 문의 */}
      <section className="info-section">
        <h2>✉️ 문의</h2>
        <p>서비스 관련 문의나 피드백은 아래 이메일로 연락해 주세요.</p>
        <p>
          <strong>이메일:</strong>{" "}
          <a href="mailto:tmheo74@gmail.com" className="text-info">
            tmheo74@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
