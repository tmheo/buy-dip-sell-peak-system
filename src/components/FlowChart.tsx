// FlowChart 컴포넌트 - 플로우차트
// Server Component

interface FlowChartStep {
  number: string;
  text: string;
}

interface FlowChartProps {
  steps: FlowChartStep[];
}

// 기본 단계들
const defaultSteps: FlowChartStep[] = [
  { number: '①', text: '추천 전략 확인' },
  { number: '②', text: '매수 시작' },
  { number: '③', text: '레이더 모니터링' },
  { number: '④', text: '매도 결정' },
  { number: '⑤', text: '사이클 종료' },
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
          {index < steps.length - 1 && (
            <span className="flowchart-arrow">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
