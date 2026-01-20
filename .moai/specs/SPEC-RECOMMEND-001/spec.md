# SPEC-RECOMMEND-001: 전략 추천 시스템

## 메타데이터

| 항목 | 값 |
|------|-----|
| SPEC ID | SPEC-RECOMMEND-001 |
| 제목 | 전략 추천 시스템 (Strategy Recommendation System) |
| 생성일 | 2026-01-20 |
| 상태 | Completed |
| 우선순위 | High |
| 담당 | manager-ddd |
| 관련 SPEC | SPEC-BACKTEST-001, SPEC-METRICS-001 |
| 라이프사이클 | spec-anchored |

---

## 1. Environment (환경)

### 1.1 시스템 컨텍스트

- **플랫폼**: Next.js 15 웹 애플리케이션
- **런타임**: Node.js (ESM 모듈)
- **데이터베이스**: SQLite (better-sqlite3)
- **UI 프레임워크**: React 19 + Bootstrap 5.3.3 + Bootswatch Solar 테마
- **기존 모듈**: `src/backtest/` 백테스트 엔진 재사용

### 1.2 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 15, React 19, Bootstrap 5.3.3 |
| Backend | Next.js API Routes, TypeScript |
| 데이터 | SQLite, yahoo-finance2 |
| 계산 | decimal.js (정밀 계산) |
| 차트 | Recharts 또는 Chart.js |

### 1.3 의존성

- **재사용 모듈**:
  - `src/backtest/metrics.ts`: 기술적 지표 계산 (SMA, RSI, ROC, 변동성)
  - `src/backtest/engine.ts`: 백테스트 엔진
  - `src/backtest/types.ts`: 타입 정의
  - `src/database/index.ts`: 데이터베이스 연결

---

## 2. Assumptions (가정)

### 2.1 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 | 실패 시 위험 | 검증 방법 |
|----|------|--------|------|-------------|----------|
| ASM-001 | 과거 유사 구간의 성과가 미래 성과를 예측하는 데 참고가 된다 | Medium | 기술적 분석 이론 | 추천 정확도 저하 | 백테스트 검증 |
| ASM-002 | 6개 기술적 지표가 시장 상황을 충분히 대표한다 | High | 원본 사이트 방식 검증됨 | 유사도 정확도 저하 | 지표 상관관계 분석 |
| ASM-003 | 코사인 유사도가 기술적 지표 비교에 적합하다 | High | 벡터 비교 표준 방식 | 유사 구간 품질 저하 | 다른 거리 측정법 비교 |

### 2.2 기술 가정

| ID | 가정 | 신뢰도 | 근거 | 실패 시 위험 | 검증 방법 |
|----|------|--------|------|-------------|----------|
| ASM-004 | 기존 백테스트 엔진이 안정적으로 동작한다 | High | SPEC-BACKTEST-001 검증 완료 | 점수 계산 불가 | 단위 테스트 |
| ASM-005 | 20일 분석 구간이 충분한 패턴 인식을 제공한다 | Medium | 원본 사이트 방식 | 유사 구간 품질 저하 | 기간 비교 실험 |
| ASM-006 | SQLite가 유사도 계산 쿼리 성능을 감당한다 | High | 인덱스 최적화 적용됨 | 응답 지연 | 성능 테스트 |

### 2.3 사용자 가정

| ID | 가정 | 신뢰도 | 근거 | 실패 시 위험 | 검증 방법 |
|----|------|--------|------|-------------|----------|
| ASM-007 | 사용자가 기술적 지표 개념을 이해한다 | Medium | 타겟 사용자 분석 | UX 혼란 | 사용성 테스트 |
| ASM-008 | 사용자가 추천을 투자 참고용으로 사용한다 | High | 면책조항 제공 | 법적 리스크 | 면책조항 표시 |

---

## 3. Requirements (요구사항)

### 3.1 기능 요구사항 - 입력 섹션

#### REQ-INPUT-001: 기준일 선택 (라디오 버튼)
**WHEN** 사용자가 "오늘 기준" 라디오 버튼을 선택하면 **THEN** 시스템은 오늘 날짜를 기준일로 설정하고 날짜 입력 필드를 읽기 전용으로 표시해야 한다.

#### REQ-INPUT-002: 특정일 선택 (캘린더)
**WHEN** 사용자가 "특정일 기준" 라디오 버튼을 선택하면 **THEN** 시스템은 캘린더 선택기를 활성화하여 사용자가 날짜를 선택할 수 있게 해야 한다.

#### REQ-INPUT-003: 종목 선택 (드롭다운)
시스템은 **항상** SOXL, TQQQ 종목을 드롭다운으로 선택할 수 있게 제공해야 한다.

#### REQ-INPUT-004: 기본값 설정
시스템은 **항상** 페이지 로드 시 "오늘 기준"과 "SOXL"을 기본값으로 설정해야 한다.

### 3.2 기능 요구사항 - 기준일 분석 차트

#### REQ-CHART-001: 메인 차트 표시
**WHEN** 사용자가 분석 요청을 제출하면 **THEN** 시스템은 기준일 기준 20일 가격 데이터를 차트로 표시해야 한다.

#### REQ-CHART-002: 미래 영역 표시
**WHEN** 메인 차트가 렌더링되면 **THEN** 시스템은 기준일 이후 20일 영역을 회색으로 비어있게 표시해야 한다.

#### REQ-CHART-003: 기술적 지표 표시
**WHEN** 메인 차트가 렌더링되면 **THEN** 시스템은 다음 6개 기술적 지표를 표시해야 한다:
- 정배열 (MA20 > MA60 여부)
- 기울기20 (MA20 기울기)
- 이격도20 (종가 대비 MA20 이격도)
- RSI14 (14일 RSI)
- ROC12 (12일 변화율)
- 변동성 (20일 변동성)

### 3.3 기능 요구사항 - 유사 구간 분석

#### REQ-SIMILAR-001: 유사 구간 검색
**WHEN** 분석 요청이 처리되면 **THEN** 시스템은 6개 기술적 지표를 기반으로 코사인 유사도를 계산하여 가장 유사한 과거 구간 Top 3을 찾아야 한다.

#### REQ-SIMILAR-002: 유사도 계산 공식
시스템은 **항상** 다음 공식으로 코사인 유사도를 계산해야 한다:
```
유사도 = (A · B) / (||A|| × ||B||)
A = [정배열, 기울기20, 이격도20, RSI14, ROC12, 변동성] (기준일)
B = [정배열, 기울기20, 이격도20, RSI14, ROC12, 변동성] (비교일)
```

#### REQ-SIMILAR-003: 유사 구간 차트 표시
**WHEN** 유사 구간이 검색되면 **THEN** 시스템은 각 구간에 대해:
- 20일 분석 구간 차트
- 이후 20일 성과 확인 구간 차트
- 유사도 퍼센트를 표시해야 한다.

#### REQ-SIMILAR-004: 구간별 백테스트 결과
**WHEN** 유사 구간 차트가 표시되면 **THEN** 시스템은 각 구간의 이후 20일에 대해 Pro1, Pro2, Pro3 전략의 백테스트 결과(수익률, MDD)를 표시해야 한다.

### 3.4 기능 요구사항 - 전략 점수 계산

#### REQ-SCORE-001: 전략별 점수 계산
시스템은 **항상** 다음 공식으로 전략 점수를 계산해야 한다:
```
점수 = 수익률(%) × e^(MDD(%) × 0.01)
```
여기서:
- 수익률(%)은 백테스트 수익률 (예: 15 = 15%)
- MDD(%)는 최대 낙폭 (예: -25 = -25%)
- weight = 0.01 (고정)

#### REQ-SCORE-002: 평균 점수 계산
**WHEN** 3개 유사 구간의 점수가 계산되면 **THEN** 시스템은 각 전략(Pro1, Pro2, Pro3)의 평균 점수를 계산해야 한다.

#### REQ-SCORE-003: Pro1 정배열 제외
**IF** 기준일이 정배열 상태(MA20 > MA60)이면 **THEN** 시스템은 Pro1 전략을 "정배열 시 제외"로 표시하고 점수 비교에서 제외해야 한다.

### 3.5 기능 요구사항 - 전략 추천

#### REQ-RECOMMEND-001: 최고 점수 전략 추천
**WHEN** 모든 전략 점수가 계산되면 **THEN** 시스템은 가장 높은 평균 점수를 가진 전략을 추천해야 한다.

#### REQ-RECOMMEND-002: 전략 비율 표시
**WHEN** 전략이 추천되면 **THEN** 시스템은 해당 전략의 티어별 투자 비율을 표시해야 한다.

#### REQ-RECOMMEND-003: 면책조항 표시
시스템은 **항상** 추천 결과와 함께 "본 추천은 투자 조언이 아니며 참고용입니다" 면책조항을 표시해야 한다.

### 3.6 비기능 요구사항

#### REQ-PERF-001: 응답 시간
시스템은 **항상** 분석 요청 후 5초 이내에 결과를 표시해야 한다.

#### REQ-PERF-002: 로딩 상태
**WHILE** 분석이 진행 중일 때 **THEN** 시스템은 로딩 스피너를 표시해야 한다.

#### REQ-UI-001: 반응형 디자인
시스템은 **항상** 데스크톱(1200px+), 태블릿(768px-1199px), 모바일(~767px) 화면에서 적절하게 표시되어야 한다.

#### REQ-UI-002: 다크 테마 일관성
시스템은 **항상** Bootswatch Solar 다크 테마와 일관된 스타일을 유지해야 한다.

---

## 4. Specifications (상세 명세)

### 4.1 데이터 구조

#### 4.1.1 분석 요청 타입
```typescript
interface RecommendRequest {
  ticker: "SOXL" | "TQQQ";       // 종목
  referenceDate: string;         // 기준일 (YYYY-MM-DD)
  isToday: boolean;              // 오늘 기준 여부
}
```

#### 4.1.2 기술적 지표 벡터 타입
```typescript
interface MetricsVector {
  isGoldenCross: boolean;        // 정배열 여부
  maSlope: number;               // MA20 기울기 (%)
  disparity: number;             // 이격도20 (%)
  rsi14: number;                 // RSI14 (0-100)
  roc12: number;                 // ROC12 (%)
  volatility20: number;          // 20일 변동성
}
```

#### 4.1.3 유사 구간 타입
```typescript
interface SimilarPeriod {
  startDate: string;             // 분석 구간 시작일
  endDate: string;               // 분석 구간 종료일
  performanceStartDate: string;  // 성과 구간 시작일
  performanceEndDate: string;    // 성과 구간 종료일
  similarity: number;            // 유사도 (0-1)
  metrics: MetricsVector;        // 해당 구간의 기술적 지표
  backtestResults: {
    Pro1: StrategyScore | null;  // 정배열 시 null
    Pro2: StrategyScore;
    Pro3: StrategyScore;
  };
}
```

#### 4.1.4 전략 점수 타입
```typescript
interface StrategyScore {
  strategy: "Pro1" | "Pro2" | "Pro3";
  returnRate: number;            // 수익률 (소수점, 예: 0.15 = 15%)
  mdd: number;                   // MDD (소수점, 예: -0.25 = -25%)
  score: number;                 // 계산된 점수
}
```

#### 4.1.5 추천 결과 타입
```typescript
interface RecommendResult {
  referenceDate: string;         // 기준일
  ticker: string;                // 종목
  referenceMetrics: MetricsVector;  // 기준일 기술적 지표
  similarPeriods: SimilarPeriod[];  // 유사 구간 Top 3
  strategyScores: {
    Pro1: { avgScore: number; excluded: boolean } | null;
    Pro2: { avgScore: number };
    Pro3: { avgScore: number };
  };
  recommendation: {
    strategy: "Pro1" | "Pro2" | "Pro3";
    tierRatios: number[];        // 티어별 비율
    reason: string;              // 추천 이유
  };
  priceData: {                   // 차트용 가격 데이터
    reference: DailyPrice[];     // 기준 20일
    future: null[];              // 미래 20일 (빈 배열)
  };
}
```

### 4.2 API 명세

#### 4.2.1 추천 분석 API

**Endpoint**: `POST /api/recommend`

**Request Body**:
```json
{
  "ticker": "SOXL",
  "referenceDate": "2026-01-20",
  "isToday": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "referenceDate": "2026-01-20",
    "ticker": "SOXL",
    "referenceMetrics": {
      "isGoldenCross": false,
      "maSlope": -2.35,
      "disparity": -5.42,
      "rsi14": 35.67,
      "roc12": -8.23,
      "volatility20": 0.0456
    },
    "similarPeriods": [...],
    "strategyScores": {...},
    "recommendation": {
      "strategy": "Pro2",
      "tierRatios": [0.15, 0.15, 0.15, 0.15, 0.15, 0.25],
      "reason": "평균 점수 12.34로 가장 높음"
    }
  }
}
```

### 4.3 코사인 유사도 계산 알고리즘

```typescript
function calculateCosineSimilarity(a: number[], b: number[]): number {
  // 정규화 (표준화)
  const normalizedA = normalizeVector(a);
  const normalizedB = normalizeVector(b);

  // 내적 계산
  const dotProduct = normalizedA.reduce((sum, val, i) => sum + val * normalizedB[i], 0);

  // 벡터 크기 계산
  const magnitudeA = Math.sqrt(normalizedA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(normalizedB.reduce((sum, val) => sum + val * val, 0));

  // 코사인 유사도
  return dotProduct / (magnitudeA * magnitudeB);
}
```

### 4.4 전략 점수 계산 알고리즘

```typescript
function calculateStrategyScore(returnRate: number, mdd: number): number {
  // returnRate: 소수점 (예: 0.15 = 15%)
  // mdd: 소수점 (예: -0.25 = -25%)
  const returnPercent = returnRate * 100;  // 15
  const mddPercent = mdd * 100;            // -25
  const weight = 0.01;                      // 고정

  // 점수 = 수익률(%) × e^(MDD(%) × weight)
  return returnPercent * Math.exp(mddPercent * weight);
}
```

### 4.5 파일 구조

```
src/
├── app/
│   ├── recommend/
│   │   └── page.tsx              # 추천 페이지 메인
│   └── api/
│       └── recommend/
│           └── route.ts          # 추천 API 엔드포인트
├── recommend/
│   ├── types.ts                  # 타입 정의
│   ├── similarity.ts             # 유사도 계산 모듈
│   ├── score.ts                  # 점수 계산 모듈
│   └── service.ts                # 추천 서비스 로직
└── components/
    └── recommend/
        ├── InputSection.tsx      # 입력 섹션 컴포넌트
        ├── ReferenceChart.tsx    # 기준일 분석 차트
        ├── SimilarPeriodCard.tsx # 유사 구간 카드
        ├── StrategyScoreTable.tsx# 전략 점수 테이블
        └── RecommendationCard.tsx# 추천 결과 카드
```

---

## 5. Constraints (제약사항)

### 5.1 기술적 제약

| ID | 제약사항 | 이유 | 영향 |
|----|----------|------|------|
| CON-001 | 기준일 이전 최소 60일 데이터 필요 | MA60 계산 요구사항 | 초기 기간 분석 불가 |
| CON-002 | 유사 구간은 기준일로부터 최소 40일 이전 | 성과 검증 기간 필요 | 최근 40일 구간 제외 |
| CON-003 | weight 값 0.01 고정 | 원본 사이트 방식 유지 | 설정 변경 불가 |

### 5.2 비즈니스 제약

| ID | 제약사항 | 이유 | 영향 |
|----|----------|------|------|
| CON-004 | 정배열 시 Pro1 제외 | Pro1 전략 특성 (역배열 최적화) | 추천 전략 제한 |
| CON-005 | 면책조항 필수 표시 | 법적 보호 | UI 필수 요소 |

### 5.3 성능 제약

| ID | 제약사항 | 이유 | 영향 |
|----|----------|------|------|
| CON-006 | 응답 시간 5초 이내 | 사용자 경험 | 최적화 필요 |
| CON-007 | 동시 사용자 10명 지원 | SQLite 제한 | 스케일링 제한 |

---

## 6. Traceability (추적성)

### 6.1 요구사항-파일 매핑

| 요구사항 | 구현 파일 |
|----------|----------|
| REQ-INPUT-* | `src/components/recommend/InputSection.tsx` |
| REQ-CHART-* | `src/components/recommend/ReferenceChart.tsx` |
| REQ-SIMILAR-* | `src/recommend/similarity.ts`, `SimilarPeriodCard.tsx` |
| REQ-SCORE-* | `src/recommend/score.ts`, `StrategyScoreTable.tsx` |
| REQ-RECOMMEND-* | `src/recommend/service.ts`, `RecommendationCard.tsx` |

### 6.2 의존성 매핑

| 신규 모듈 | 재사용 모듈 |
|----------|------------|
| `similarity.ts` | `src/backtest/metrics.ts` (기술적 지표 계산) |
| `score.ts` | `src/backtest/engine.ts` (백테스트 실행) |
| `service.ts` | `src/database/index.ts` (가격 데이터 조회) |

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0.0 | 2026-01-20 | manager-spec | 초기 SPEC 작성 |
