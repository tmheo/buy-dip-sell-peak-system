// FlowChart 컴포넌트 - 플로우차트
// Server Component

interface FlowChartStep {
  number: string;
  text: string;
}

interface FlowChartProps {
  steps: FlowChartStep[];
}

// 기본 단계들 (원본 사이트와 동일)
const defaultSteps: FlowChartStep[] = [
  { number: "①", text: "추천 전략 확인" },
  { number: "②", text: "전략 선택" },
  { number: "③", text: "매일 주문표대로 주문" },
  { number: "④", text: "모든 티어 매도 시" },
  { number: "⑤", text: "다음 전략 확인" },
];

export default function FlowChart({ steps = defaultSteps }: FlowChartProps) {
  return (
    <div className="flowchart-container">
      {steps.map((step, index) => (
        <div key={index} className="d-flex align-items-center">
          <div className="flowchart-step">
            <span className="step-number">{step.number}</span>
            <span className="step-text">{step.text}</span>
          </div>
          {/* 마지막 단계가 아니면 화살표 추가 */}
          {index < steps.length - 1 && <span className="flowchart-arrow">→</span>}
        </div>
      ))}
    </div>
  );
}
