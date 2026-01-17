# SPEC-METRICS-001: 기술적 지표 차트 데이터 추가

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-METRICS-001 |
| **제목** | 백테스트 결과에 기술적 지표 차트 데이터 추가 |
| **상태** | Completed |
| **우선순위** | High |
| **생성일** | 2026-01-17 |
| **라이프사이클** | spec-anchored |
| **의존성** | SPEC-BACKTEST-001 |

---

## 1. 환경 (Environment)

### 1.1 기술 스택

| 구성요소 | 기술 | 버전 |
|----------|------|------|
| 런타임 | Node.js | 20.x LTS |
| 언어 | TypeScript | 5.7.3 |
| 프레임워크 | Next.js | 15.x (App Router) |
| 테스트 | Vitest | 최신 안정 버전 |
| 정밀 연산 | decimal.js | 현재 사용 버전 |

### 1.2 기존 인터페이스

```typescript
// 현재 DailySnapshot (src/backtest/types.ts:161-188)
interface DailySnapshot {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  cash: number;
  holdingsValue: number;
  totalAsset: number;
  trades: TradeAction[];
  orders: OrderAction[];
  activeTiers: number;
  cycleNumber: number;
}

// 현재 BacktestResult (src/backtest/types.ts:131-156)
interface BacktestResult {
  strategy: StrategyName;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalAsset: number;
  returnRate: number;
  mdd: number;
  totalCycles: number;
  winRate: number;
  dailyHistory: DailySnapshot[];
  remainingTiers: RemainingTier[];
  completedCycles: { profit: number }[];
}
```

### 1.3 기존 metrics.ts 함수

```typescript
// 현재 구현된 함수들
function calculateReturn(initial: number, final: number): number;
function calculateMDD(history: DailySnapshot[]): number;
function calculateWinRate(cycles: { profit: number }[]): number;
```

---

## 2. 가정 (Assumptions)

### 2.1 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 |
|----|------|--------|------|
| A1 | 이동평균(MA)은 단순이동평균(SMA)을 사용한다 | High | 일반적인 기술적 분석 표준 |
| A2 | RSI 계산에는 Wilder의 지수이동평균(EMA) 방식을 사용한다 | High | RSI 표준 계산법 |
| A3 | 변동성은 연율화된 값으로 표시한다 | High | 금융 업계 표준 (연간 252거래일) |
| A4 | 모든 계산에 수정종가(adjClose)를 사용한다 | High | 배당/분할 반영된 정확한 분석 |

### 2.2 기술 가정

| ID | 가정 | 신뢰도 | 근거 |
|----|------|--------|------|
| T1 | 충분한 히스토리 데이터가 있을 때만 지표를 계산한다 | High | 데이터 부족 시 null 반환 |
| T2 | decimal.js를 사용하여 부동소수점 오차를 최소화한다 | High | 기존 엔진에서 사용 중 |
| T3 | 지표 계산은 백테스트 성능에 영향을 최소화해야 한다 | Medium | 기존 5초 이내 제약 유지 |

---

## 3. 요구사항 (Requirements)

### 3.1 기능적 요구사항

#### REQ-001: DailySnapshot 이동평균 확장

**[Ubiquitous]** 시스템은 **항상** DailySnapshot에 다음 이동평균 필드를 포함해야 한다:

| 필드 | 타입 | 설명 |
|------|------|------|
| `ma20` | `number \| null` | 20일 단순이동평균, 데이터 부족 시 null |
| `ma60` | `number \| null` | 60일 단순이동평균, 데이터 부족 시 null |

#### REQ-002: TechnicalMetrics 인터페이스

**[Ubiquitous]** 시스템은 **항상** 다음 기술적 지표를 계산해야 한다:

| 지표 | 필드명 | 공식 | 단위 |
|------|--------|------|------|
| 정배열 | `goldenCross` | `(MA20 - MA60) / MA60 × 100` | % |
| MA 기울기 | `maSlope` | `(MA20[t] - MA20[t-10]) / MA20[t-10] × 100` | % |
| 이격도 | `disparity` | `(adjClose - MA20) / MA20 × 100` | % |
| RSI | `rsi14` | `100 - (100 / (1 + RS))` | 0-100 |
| ROC | `roc12` | `(adjClose[t] - adjClose[t-12]) / adjClose[t-12] × 100` | % |
| 변동성 | `volatility20` | `stddev(daily_returns, 20, n-1) × sqrt(20)` | 소수 |

#### REQ-003: BacktestResult 확장

**[Event-Driven]** **WHEN** 백테스트가 완료되면 **THEN** BacktestResult에 종료일 기준 `technicalMetrics` 필드가 포함되어야 한다.

```typescript
interface BacktestResult {
  // ... 기존 필드들
  technicalMetrics: TechnicalMetrics | null;  // 데이터 부족 시 null
}
```

#### REQ-004: MA20 계산

**[State-Driven]** **IF** 현재 인덱스가 19 이상 (20일 이상의 데이터 존재) **THEN** MA20을 계산한다:

```
MA20 = sum(adjClose[i-19..i]) / 20
```

**[State-Driven]** **IF** 현재 인덱스가 19 미만 **THEN** MA20은 null을 반환한다.

#### REQ-005: MA60 계산

**[State-Driven]** **IF** 현재 인덱스가 59 이상 (60일 이상의 데이터 존재) **THEN** MA60을 계산한다:

```
MA60 = sum(adjClose[i-59..i]) / 60
```

**[State-Driven]** **IF** 현재 인덱스가 59 미만 **THEN** MA60은 null을 반환한다.

#### REQ-006: 정배열 (Golden Cross) 계산

**[State-Driven]** **IF** MA20과 MA60이 모두 유효 **THEN** 정배열 지표를 계산한다:

```
goldenCross = (MA20 - MA60) / MA60 × 100
```

- 양수: MA20 > MA60 (정배열, 상승 추세)
- 음수: MA20 < MA60 (역배열, 하락 추세)

#### REQ-007: MA 기울기 계산

**[State-Driven]** **IF** 현재 인덱스가 29 이상 (MA20 + 10일 필요) **THEN** 기울기를 계산한다:

```
maSlope = (MA20[today] - MA20[10일전]) / MA20[10일전] × 100
```

- 양수: 상승 기울기
- 음수: 하락 기울기

#### REQ-008: 이격도 (Disparity) 계산

**[State-Driven]** **IF** MA20이 유효 **THEN** 이격도를 계산한다:

```
disparity = (adjClose - MA20) / MA20 × 100
```

- 양수: 주가가 MA20 위에 위치 (과매수 가능성)
- 음수: 주가가 MA20 아래에 위치 (과매도 가능성)

#### REQ-009: RSI(14) 계산

**[State-Driven]** **IF** 현재 인덱스가 14 이상 **THEN** RSI를 Wilder의 EMA 방식으로 계산한다:

```
1. 일별 가격 변화 = adjClose[i] - adjClose[i-1]
2. 상승폭 = max(변화, 0)
3. 하락폭 = max(-변화, 0)
4. 평균 상승 = EMA(상승폭, 14)
5. 평균 하락 = EMA(하락폭, 14)
6. RS = 평균 상승 / 평균 하락
7. RSI = 100 - (100 / (1 + RS))
```

Wilder EMA 가중치: `alpha = 1/14`

- RSI > 70: 과매수 구간
- RSI < 30: 과매도 구간

#### REQ-010: ROC(12) 계산

**[State-Driven]** **IF** 현재 인덱스가 12 이상 **THEN** ROC를 계산한다:

```
ROC = (adjClose[today] - adjClose[12일전]) / adjClose[12일전] × 100
```

- 양수: 12일 전 대비 상승
- 음수: 12일 전 대비 하락

#### REQ-011: 변동성 (Volatility) 계산

**[State-Driven]** **IF** 현재 인덱스가 20 이상 **THEN** 연율화 변동성을 계산한다:

```
1. 일별 수익률 = (adjClose[i] - adjClose[i-1]) / adjClose[i-1]
2. 표본 표준편차 = stddev(최근 20일 일별 수익률, n-1)
3. 변동성 = 표본 표준편차 × sqrt(20)
```

### 3.2 비기능적 요구사항

#### REQ-012: 성능

**[Ubiquitous]** 시스템은 **항상** 기술적 지표 계산을 포함하여 1년치 데이터 백테스트를 5초 이내에 완료해야 한다.

#### REQ-013: 정밀도

**[Ubiquitous]** 시스템은 **항상** 모든 기술적 지표를 소수점 4자리까지 정밀하게 계산해야 한다.

### 3.3 제약사항

#### CON-001: Null 처리

**[Unwanted]** 시스템은 데이터 부족 시 0 또는 임의의 값을 반환**하지 않아야 한다**. 항상 null을 반환한다.

#### CON-002: Division by Zero 방지

**[Unwanted]** 시스템은 0으로 나누기 오류를 발생**시키지 않아야 한다**. 분모가 0인 경우 null을 반환한다.

#### CON-003: 기존 호환성

**[Unwanted]** 시스템은 기존 BacktestResult 구조를 변경**하지 않아야 한다**. 새 필드는 추가만 한다.

---

## 4. 명세 (Specifications)

### 4.1 타입 정의

```typescript
/**
 * 기술적 지표 인터페이스
 * 백테스트 종료일 기준 6개 핵심 지표
 */
interface TechnicalMetrics {
  /** 정배열: (MA20 - MA60) / MA60 × 100 */
  goldenCross: number;
  /** MA 기울기: (MA20[today] - MA20[10일전]) / MA20[10일전] × 100 */
  maSlope: number;
  /** 이격도: (adjClose - MA20) / MA20 × 100 */
  disparity: number;
  /** RSI(14): Wilder의 EMA 방식 */
  rsi14: number;
  /** ROC(12): 12일간 변화율 */
  roc12: number;
  /** 변동성: 20일 일별수익률 표본 표준편차 × sqrt(20) */
  volatility20: number;
}

/**
 * 확장된 DailySnapshot 인터페이스
 */
interface DailySnapshot {
  // 기존 필드들...
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  cash: number;
  holdingsValue: number;
  totalAsset: number;
  trades: TradeAction[];
  orders: OrderAction[];
  activeTiers: number;
  cycleNumber: number;
  // 새로운 필드들
  ma20: number | null;
  ma60: number | null;
}

/**
 * 확장된 BacktestResult 인터페이스
 */
interface BacktestResult {
  // 기존 필드들...
  strategy: StrategyName;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalAsset: number;
  returnRate: number;
  mdd: number;
  totalCycles: number;
  winRate: number;
  dailyHistory: DailySnapshot[];
  remainingTiers: RemainingTier[];
  completedCycles: { profit: number }[];
  // 새로운 필드
  technicalMetrics: TechnicalMetrics | null;
}
```

### 4.2 수정 대상 파일

```
src/backtest/
├── types.ts          # TechnicalMetrics 추가, DailySnapshot/BacktestResult 확장
├── metrics.ts        # 6개 기술적 지표 계산 함수 추가
├── engine.ts         # MA 계산 통합, technicalMetrics 생성
└── __tests__/
    └── metrics.test.ts  # 새 함수들 단위 테스트
```

### 4.3 새로운 함수 명세

#### metrics.ts 추가 함수

```typescript
/**
 * 단순이동평균(SMA) 계산
 * @param prices - 가격 배열 (adjClose)
 * @param period - 이동평균 기간
 * @param index - 현재 인덱스
 * @returns SMA 값 또는 null (데이터 부족 시)
 */
function calculateSMA(
  prices: number[],
  period: number,
  index: number
): number | null;

/**
 * RSI(14) 계산 - Wilder의 EMA 방식
 * @param prices - 가격 배열 (adjClose)
 * @param index - 현재 인덱스
 * @returns RSI 값 (0-100) 또는 null
 */
function calculateRSI(
  prices: number[],
  index: number
): number | null;

/**
 * ROC(12) 계산 - 12일 변화율
 * @param prices - 가격 배열 (adjClose)
 * @param index - 현재 인덱스
 * @returns ROC 값 (%) 또는 null
 */
function calculateROC(
  prices: number[],
  index: number
): number | null;

/**
 * 변동성 계산 - 20일 연율화 변동성
 * @param prices - 가격 배열 (adjClose)
 * @param index - 현재 인덱스
 * @returns 연율화 변동성 (%) 또는 null
 */
function calculateVolatility(
  prices: number[],
  index: number
): number | null;

/**
 * 종합 기술적 지표 계산
 * @param prices - 가격 배열 (adjClose)
 * @param index - 현재 인덱스
 * @returns TechnicalMetrics 또는 null (일부 지표 계산 불가 시)
 */
function calculateTechnicalMetrics(
  prices: number[],
  index: number
): TechnicalMetrics | null;
```

### 4.4 알고리즘 상세

#### RSI Wilder EMA 알고리즘

```typescript
// 첫 14일: 단순 평균으로 초기값 계산
let avgGain = sum(gains[0..13]) / 14;
let avgLoss = sum(losses[0..13]) / 14;

// 15일째부터: Wilder의 Smoothed EMA
for (i = 14; i <= currentIndex; i++) {
  avgGain = (avgGain * 13 + gains[i]) / 14;
  avgLoss = (avgLoss * 13 + losses[i]) / 14;
}

// RS와 RSI 계산
const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
const rsi = 100 - (100 / (1 + rs));
```

#### 표본 표준편차 알고리즘 (변동성용)

```typescript
// 20일 일별 수익률 계산
const returns: number[] = [];
for (i = index - 19; i <= index; i++) {
  returns.push((prices[i] - prices[i-1]) / prices[i-1]);
}

// 표본 표준편차 계산 (n-1)
const mean = sum(returns) / 20;
const variance = sum((r - mean)^2 for r in returns) / (20 - 1);
const stddev = sqrt(variance);

// √20 스케일링 (원본 사이트 방식)
const volatility = stddev * sqrt(20);
```

---

## 5. 추적성 (Traceability)

### 5.1 관련 문서

| 문서 | 경로 | 관계 |
|------|------|------|
| 백테스트 엔진 SPEC | `.moai/specs/SPEC-BACKTEST-001/` | 의존 |
| 기술 스택 | `.moai/project/tech.md` | 참조 |
| 프로젝트 로드맵 | `.moai/project/product.md` | 상위 |

### 5.2 요구사항 매핑

| 사용자 요구 | SPEC 요구사항 |
|-------------|--------------|
| DailySnapshot에 MA20/MA60 추가 | REQ-001, REQ-004, REQ-005 |
| 정배열(20ma-60ma) | REQ-006 |
| 기울기(20ma 10일) | REQ-007 |
| 이격도(주가/20ma) | REQ-008 |
| RSI(14) | REQ-009 |
| ROC(12) | REQ-010 |
| 변동성(20day) | REQ-011 |

---

## 6. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-17 | manager-spec | 초기 SPEC 작성 |
