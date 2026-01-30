---
id: SPEC-PERF-001
version: "1.0.0"
status: Planned
created: 2026-01-30
updated: 2026-01-30
author: MoAI Workflow Spec Agent
priority: High
related_specs: []
labels: [optimization, similarity, backtest, parameter-tuning]
lifecycle: spec-first
---

# SPEC-PERF-001: 유사도 파라미터 최적화 시스템

## 1. 환경 (Environment)

### 1.1 현재 시스템 상태

- **파일 위치**: `src/recommend/similarity.ts`
- **현재 파라미터 (하드코딩됨)**:
  - `METRIC_WEIGHTS`: `[0.35, 0.4, 0.05, 0.07, 0.13]` (기울기, 이격도, RSI, ROC, 변동성)
  - `METRIC_TOLERANCES`: `[36, 90, 4.5, 40, 28]`
- **유사도 공식**: `sum(weight_i * 100 * exp(-diff_i / tolerance_i))`

### 1.2 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| TypeScript | 5.7.3 | 정적 타입 검사 |
| Node.js | ESM | 모듈 시스템 |
| Decimal.js | - | 정밀 수학 연산 |
| better-sqlite3 | 11.7.0 | 결과 저장 |

### 1.3 디렉토리 구조 (신규)

```
src/
├── optimize/           # 신규 모듈
│   ├── types.ts       # 타입 정의
│   ├── param-generator.ts  # 파라미터 생성
│   ├── backtest-runner.ts  # 백테스트 실행
│   ├── analyzer.ts    # 결과 분석
│   ├── cli.ts         # CLI 진입점
│   └── index.ts       # 모듈 진입점
└── recommend/
    └── similarity.ts  # 수정 대상 (선택적 파라미터 추가)
```

---

## 2. 가정 (Assumptions)

### 2.1 기술적 가정

| ID | 가정 | 신뢰도 | 근거 | 위험 | 검증 방법 |
|----|------|--------|------|------|----------|
| A1 | 현재 파라미터가 최적이 아닐 수 있음 | High | 초기 설정값이며 체계적 검증 없음 | 최적화가 개선 없이 끝날 수 있음 | 베이스라인 대비 비교 |
| A2 | 50개 랜덤 조합으로 충분한 탐색 가능 | Medium | 5개 지표 × 2개 파라미터 = 10차원 공간 | 지역 최적에 빠질 수 있음 | 변형 탐색으로 보완 |
| A3 | 2025년 데이터가 대표성을 가짐 | Medium | 1년간 다양한 시장 상황 포함 | 과적합 위험 | 다년도 검증 권장 |

### 2.2 비즈니스 가정

- 최적화 결과는 실제 투자에 즉시 반영하지 않고 참고용으로만 사용
- 백테스트 기간(2025.01.01-2025.12.31)의 결과가 미래 성과를 보장하지 않음

---

## 3. 요구사항 (Requirements)

### 3.1 기능 요구사항

#### REQ-F01: 유사도 함수 파라미터화 [Ubiquitous]

> 시스템은 **항상** `calculateExponentialSimilarity` 함수에서 선택적 weights/tolerances 파라미터를 지원해야 한다.

**상세**:
- 기존 호출은 하위 호환성 유지 (기본값 사용)
- 새 시그니처: `calculateExponentialSimilarity(vectorA, vectorB, options?)`
- options 인터페이스:
  ```typescript
  interface SimilarityOptions {
    weights?: [number, number, number, number, number];
    tolerances?: [number, number, number, number, number];
  }
  ```

#### REQ-F02: 랜덤 파라미터 생성 [Event-Driven]

> **WHEN** 최적화 실행이 시작되면 **THEN** 시스템은 50개의 랜덤 파라미터 조합을 생성해야 한다.

**상세**:
- 가중치(weights) 생성 규칙:
  - 5개 값의 합이 1.0이 되도록 정규화
  - 각 가중치 범위: 0.01 ~ 0.5
- 허용오차(tolerances) 생성 규칙:
  - maSlope: 10 ~ 100
  - disparity: 30 ~ 200
  - RSI: 1 ~ 20
  - ROC: 10 ~ 100
  - volatility: 10 ~ 80

#### REQ-F03: 변형 탐색 [Event-Driven]

> **WHEN** 초기 랜덤 탐색이 완료되면 **THEN** 시스템은 상위 3개 조합에 대해 각각 10개의 변형을 생성해야 한다.

**상세**:
- 변형 방식: 기존 값의 +/-10% 범위 내 무작위 조정
- 총 추가 탐색: 3 × 10 = 30개 조합

#### REQ-F04: 백테스트 실행 [Event-Driven]

> **WHEN** 파라미터 조합이 생성되면 **THEN** 시스템은 각 조합에 대해 백테스트를 실행해야 한다.

**상세**:
- 백테스트 기간: 2025.01.01 ~ 2025.12.31
- 티커: SOXL (기본)
- 초기 자본: $10,000
- 측정 지표: 수익률(%), MDD(%), 전략 점수

#### REQ-F05: 결과 분석 및 비교 [State-Driven]

> **IF** 모든 백테스트가 완료되면 **THEN** 시스템은 베이스라인 대비 결과를 분석해야 한다.

**상세**:
- 베이스라인: 현재 하드코딩된 파라미터 (METRIC_WEIGHTS, METRIC_TOLERANCES)
- 비교 지표:
  - 전략 점수: `returnRate * exp(MDD * 0.01)`
  - 수익률 변화
  - MDD 변화
- 순위 결정: 전략 점수 내림차순

### 3.2 비기능 요구사항

#### REQ-NF01: 성능 [Ubiquitous]

> 시스템은 **항상** 80개 조합(50 랜덤 + 30 변형)의 백테스트를 10분 이내에 완료해야 한다.

#### REQ-NF02: 데이터 무결성 [Ubiquitous]

> 시스템은 **항상** Decimal.js를 사용하여 파라미터 및 점수 계산의 정밀도를 보장해야 한다.

#### REQ-NF03: 확장성 [Optional]

> **가능하면** 시스템은 다른 티커(TQQQ) 및 다른 기간에 대한 최적화를 지원해야 한다.

### 3.3 제약 조건

#### CON-01: 하위 호환성 [Unwanted]

> 시스템은 기존 `calculateExponentialSimilarity(vectorA, vectorB)` 호출 시그니처를 **변경하지 않아야 한다**.

#### CON-02: 파라미터 유효성 [Unwanted]

> 시스템은 가중치 합이 1.0이 아닌 파라미터 조합을 **생성하지 않아야 한다**.

---

## 4. 명세 (Specifications)

### 4.1 인터페이스 명세

#### 4.1.1 SimilarityOptions

```typescript
interface SimilarityOptions {
  weights?: MetricWeights;
  tolerances?: MetricTolerances;
}

type MetricWeights = [number, number, number, number, number];
type MetricTolerances = [number, number, number, number, number];
```

#### 4.1.2 OptimizationConfig

```typescript
interface OptimizationConfig {
  ticker: "SOXL" | "TQQQ";
  startDate: string;  // YYYY-MM-DD
  endDate: string;
  initialCapital: number;
  randomCombinations: number;  // 기본 50
  variationsPerTop: number;    // 기본 10
  topCandidates: number;       // 기본 3
}
```

#### 4.1.3 OptimizationResult

```typescript
interface OptimizationResult {
  baseline: BacktestMetrics;
  candidates: RankedCandidate[];
  bestCandidate: RankedCandidate;
  summary: OptimizationSummary;
}

interface RankedCandidate {
  rank: number;
  params: {
    weights: MetricWeights;
    tolerances: MetricTolerances;
  };
  metrics: BacktestMetrics;
  improvement: {
    returnRate: number;   // 베이스라인 대비 차이
    mdd: number;
    strategyScore: number;
  };
}

interface BacktestMetrics {
  returnRate: number;
  mdd: number;
  strategyScore: number;
  totalCycles: number;
  winRate: number;
}

interface OptimizationSummary {
  totalCombinations: number;
  executionTimeMs: number;
  baselineScore: number;
  bestScore: number;
  improvementPercent: number;
}
```

### 4.2 CLI 명세

```bash
# 기본 실행
npx tsx src/optimize/cli.ts

# 옵션 지정
npx tsx src/optimize/cli.ts \
  --ticker SOXL \
  --start 2025-01-01 \
  --end 2025-12-31 \
  --random 50 \
  --variations 10 \
  --output results/optimization-results.json
```

### 4.3 출력 형식

```
=== 유사도 파라미터 최적화 결과 ===

[베이스라인]
  가중치: [0.35, 0.4, 0.05, 0.07, 0.13]
  허용오차: [36, 90, 4.5, 40, 28]
  수익률: 45.23%
  MDD: -18.5%
  전략 점수: 38.72

[Top 3 후보]
  #1: 전략 점수 42.15 (+8.9%)
      가중치: [0.30, 0.45, 0.08, 0.05, 0.12]
      허용오차: [42, 85, 5.2, 35, 32]
      수익률: 52.18%, MDD: -16.2%

  #2: 전략 점수 40.88 (+5.6%)
      ...

[요약]
  총 탐색 조합: 80개
  실행 시간: 245초
  최고 개선율: +8.9%
```

---

## 5. 추적성 (Traceability)

| 요구사항 | 구현 파일 | 테스트 |
|----------|----------|--------|
| REQ-F01 | src/recommend/similarity.ts | TC-01 |
| REQ-F02 | src/optimize/param-generator.ts | TC-02 |
| REQ-F03 | src/optimize/param-generator.ts | TC-03 |
| REQ-F04 | src/optimize/backtest-runner.ts | TC-04 |
| REQ-F05 | src/optimize/analyzer.ts | TC-05 |
| CON-01 | src/recommend/similarity.ts | TC-06 |
| CON-02 | src/optimize/param-generator.ts | TC-07 |
