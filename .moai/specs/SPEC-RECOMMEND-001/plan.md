# SPEC-RECOMMEND-001: 구현 계획

## 메타데이터

| 항목 | 값 |
|------|-----|
| SPEC ID | SPEC-RECOMMEND-001 |
| 관련 문서 | spec.md, acceptance.md |
| 생성일 | 2026-01-20 |
| 마지막 업데이트 | 2026-01-20 |

---

## 1. 마일스톤 개요

### 1.1 우선순위별 마일스톤

| 순위 | 마일스톤 | 목표 | 상태 |
|------|----------|------|------|
| Primary | M1: 핵심 로직 구현 | 유사도 계산, 점수 계산 | Planned |
| Primary | M2: API 엔드포인트 | REST API 완성 | Planned |
| Secondary | M3: UI 컴포넌트 | 입력, 차트, 결과 표시 | Planned |
| Secondary | M4: 통합 및 최적화 | 전체 플로우, 성능 | Planned |
| Optional | M5: 고급 기능 | 캐싱, 사용자 설정 | Planned |

---

## 2. M1: 핵심 로직 구현 (Primary)

### 2.1 목표
- 유사도 계산 알고리즘 구현
- 전략 점수 계산 로직 구현
- 기존 백테스트 엔진과 통합

### 2.2 작업 목록

#### Task 1.1: 타입 정의 (src/recommend/types.ts)
```
- [ ] RecommendRequest 인터페이스
- [ ] MetricsVector 인터페이스
- [ ] SimilarPeriod 인터페이스
- [ ] StrategyScore 인터페이스
- [ ] RecommendResult 인터페이스
```

#### Task 1.2: 유사도 계산 모듈 (src/recommend/similarity.ts)
```
- [ ] normalizeVector(): 벡터 정규화 함수
- [ ] calculateCosineSimilarity(): 코사인 유사도 계산
- [ ] metricsToVector(): 기술적 지표를 벡터로 변환
- [ ] findSimilarPeriods(): 유사 구간 Top 3 검색
```

#### Task 1.3: 점수 계산 모듈 (src/recommend/score.ts)
```
- [ ] calculateStrategyScore(): 전략 점수 계산
- [ ] calculateAverageScores(): 평균 점수 계산
- [ ] determineRecommendation(): 추천 전략 결정
- [ ] isGoldenCrossExcluded(): Pro1 제외 조건 확인
```

### 2.3 기술적 접근

#### 유사도 계산 알고리즘
```typescript
// 1. 기술적 지표를 숫자 벡터로 변환
const vector = [
  isGoldenCross ? 1 : 0,  // boolean을 숫자로
  maSlope,
  disparity,
  rsi14 / 100,            // 0-1 범위로 정규화
  roc12 / 100,
  volatility20
];

// 2. 각 지표별 표준화 (z-score)
const normalized = standardize(vector);

// 3. 코사인 유사도 계산
const similarity = cosineSimilarity(refVector, compVector);
```

#### 점수 계산 알고리즘
```typescript
// 점수 = 수익률(%) × e^(MDD(%) × 0.01)
function calculateScore(returnRate: number, mdd: number): number {
  const returnPct = returnRate * 100;   // 15% -> 15
  const mddPct = mdd * 100;             // -25% -> -25
  return returnPct * Math.exp(mddPct * 0.01);
}

// 예시: 수익률 15%, MDD -25%
// 점수 = 15 × e^(-25 × 0.01) = 15 × e^(-0.25) ≈ 11.68
```

### 2.4 의존성
- `src/backtest/metrics.ts`: calculateTechnicalMetrics()
- `src/backtest/engine.ts`: BacktestEngine
- `decimal.js`: 정밀 계산

---

## 3. M2: API 엔드포인트 (Primary)

### 3.1 목표
- 추천 분석 REST API 구현
- 에러 처리 및 검증
- 응답 최적화

### 3.2 작업 목록

#### Task 2.1: 추천 서비스 (src/recommend/service.ts)
```
- [ ] getReferencePriceData(): 기준일 20일 가격 데이터 조회
- [ ] calculateReferenceMetrics(): 기준일 기술적 지표 계산
- [ ] runBacktestForPeriod(): 특정 구간 백테스트 실행
- [ ] generateRecommendation(): 전체 추천 로직 조합
```

#### Task 2.2: API 라우트 (src/app/api/recommend/route.ts)
```
- [ ] POST 핸들러 구현
- [ ] 요청 검증 (Zod 스키마)
- [ ] 에러 응답 처리
- [ ] 성공 응답 형식
```

### 3.3 API 명세

```typescript
// POST /api/recommend
// Request
{
  "ticker": "SOXL" | "TQQQ",
  "referenceDate": "YYYY-MM-DD",
  "isToday": boolean
}

// Response (Success)
{
  "success": true,
  "data": RecommendResult
}

// Response (Error)
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_DATA" | "INVALID_DATE" | "SERVER_ERROR",
    "message": "설명 메시지"
  }
}
```

### 3.4 에러 처리

| 에러 코드 | 조건 | HTTP 상태 |
|----------|------|-----------|
| INVALID_TICKER | 지원하지 않는 종목 | 400 |
| INVALID_DATE | 잘못된 날짜 형식 | 400 |
| FUTURE_DATE | 미래 날짜 요청 | 400 |
| INSUFFICIENT_DATA | 60일 미만 데이터 | 422 |
| SERVER_ERROR | 내부 오류 | 500 |

---

## 4. M3: UI 컴포넌트 (Secondary)

### 4.1 목표
- 입력 폼 컴포넌트 구현
- 차트 컴포넌트 구현
- 결과 표시 컴포넌트 구현

### 4.2 작업 목록

#### Task 3.1: 입력 섹션 (InputSection.tsx)
```
- [ ] 기준일 선택 라디오 버튼
- [ ] 날짜 선택 캘린더 (react-datepicker)
- [ ] 종목 선택 드롭다운
- [ ] 분석 버튼
- [ ] 상태 관리 (useState)
```

#### Task 3.2: 기준일 분석 차트 (ReferenceChart.tsx)
```
- [ ] 가격 라인 차트 (20일)
- [ ] MA20, MA60 오버레이
- [ ] 미래 20일 회색 영역
- [ ] 기술적 지표 메트릭 카드 (6개)
```

#### Task 3.3: 유사 구간 카드 (SimilarPeriodCard.tsx)
```
- [ ] 구간 정보 헤더
- [ ] 분석 구간 미니 차트
- [ ] 성과 구간 미니 차트
- [ ] 유사도 퍼센트 배지
- [ ] Pro1/Pro2/Pro3 결과 테이블
```

#### Task 3.4: 전략 점수 테이블 (StrategyScoreTable.tsx)
```
- [ ] 전략별 점수 행
- [ ] 구간별 점수 열
- [ ] 평균 점수 열
- [ ] Pro1 제외 표시 (정배열 시)
- [ ] 최고 점수 하이라이트
```

#### Task 3.5: 추천 결과 카드 (RecommendationCard.tsx)
```
- [ ] 추천 전략 배지 (크게 표시)
- [ ] 티어별 비율 시각화
- [ ] 추천 이유 텍스트
- [ ] 면책조항 표시
```

### 4.3 UI 와이어프레임

```
┌────────────────────────────────────────────────────────────┐
│                      전략 추천                               │
├────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 입력 섹션                                                ││
│ │ ○ 오늘 기준  ○ 특정일 기준  [2026-01-20]                 ││
│ │ 종목: [SOXL ▼]              [분석하기]                   ││
│ └─────────────────────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 기준일 분석 차트                                          ││
│ │ ┌──────────────────────────┬────────────────────────┐   ││
│ │ │    [20일 가격 차트]       │  [회색: 미래 20일]      │   ││
│ │ └──────────────────────────┴────────────────────────┘   ││
│ │ 정배열: ✗  기울기: -2.3%  이격도: -5.4%                  ││
│ │ RSI14: 35.7  ROC12: -8.2%  변동성: 4.6%                 ││
│ └─────────────────────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────┤
│ ┌───────────────────┐ ┌───────────────────┐ ┌─────────────┐│
│ │ 유사 구간 #1       │ │ 유사 구간 #2       │ │ 유사 구간 #3 ││
│ │ 유사도: 94.5%      │ │ 유사도: 91.2%      │ │ 유사도: 88.7%││
│ │ [미니차트]         │ │ [미니차트]         │ │ [미니차트]   ││
│ │ Pro1: +12%, -8%   │ │ Pro1: +15%, -10%  │ │ ...         ││
│ │ Pro2: +18%, -12%  │ │ Pro2: +20%, -15%  │ │             ││
│ │ Pro3: +25%, -20%  │ │ Pro3: +28%, -22%  │ │             ││
│ └───────────────────┘ └───────────────────┘ └─────────────┘│
├────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 전략별 종합 점수                                          ││
│ │ ┌─────────┬─────────┬─────────┬─────────┬──────────┐   ││
│ │ │ 전략    │ 구간 1   │ 구간 2   │ 구간 3   │ 평균 점수 │   ││
│ │ ├─────────┼─────────┼─────────┼─────────┼──────────┤   ││
│ │ │ Pro1    │ 제외     │ 제외     │ 제외     │ -        │   ││
│ │ │ Pro2    │ 14.2    │ 15.8    │ 13.5    │ 14.5     │   ││
│ │ │ Pro3    │ 18.5    │ 20.1    │ 17.2    │ 18.6 ★   │   ││
│ │ └─────────┴─────────┴─────────┴─────────┴──────────┘   ││
│ └─────────────────────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 🎯 추천 전략: Pro3                                       ││
│ │ 비율: 10% | 10% | 10% | 10% | 10% | 50%                 ││
│ │ 이유: 평균 점수 18.6으로 가장 높음                        ││
│ │ ⚠️ 본 추천은 투자 조언이 아니며 참고용입니다              ││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

### 4.4 스타일 가이드

```css
/* Bootswatch Solar 테마 색상 */
--bs-body-bg: #002b36;      /* 메인 배경 */
--bs-dark: #073642;         /* 카드 배경 */
--bs-info: #2aa198;         /* 강조 텍스트 */
--bs-primary: #268bd2;      /* 버튼 */
--price-up: #ff5370;        /* 상승 */
--price-down: #26c6da;      /* 하락 */

/* 추천 배지 */
.recommendation-badge {
  font-size: 1.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #268bd2, #2aa198);
}

/* 유사도 배지 */
.similarity-badge {
  font-size: 0.9rem;
  color: #2aa198;
}
```

---

## 5. M4: 통합 및 최적화 (Secondary)

### 5.1 목표
- 전체 플로우 통합 테스트
- 성능 최적화
- 에러 처리 강화

### 5.2 작업 목록

#### Task 4.1: 페이지 통합 (src/app/recommend/page.tsx)
```
- [ ] 컴포넌트 조합
- [ ] 상태 관리 (React Query 또는 useState)
- [ ] API 호출 통합
- [ ] 로딩/에러 상태 처리
```

#### Task 4.2: 성능 최적화
```
- [ ] 유사 구간 검색 인덱싱
- [ ] 백테스트 결과 캐싱
- [ ] 이미지/차트 지연 로딩
- [ ] API 응답 압축
```

#### Task 4.3: 에러 처리
```
- [ ] 네트워크 에러 재시도
- [ ] 사용자 친화적 에러 메시지
- [ ] 에러 경계 (Error Boundary)
```

### 5.3 성능 목표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| API 응답 시간 | < 3초 | 서버 로그 |
| 페이지 로드 | < 2초 | Lighthouse |
| 차트 렌더링 | < 500ms | Performance API |

---

## 6. M5: 고급 기능 (Optional)

### 6.1 목표
- 사용자 경험 개선
- 추가 기능 구현

### 6.2 작업 목록

```
- [ ] 결과 캐싱 (Redis 또는 메모리)
- [ ] 분석 이력 저장
- [ ] 결과 공유 (URL 파라미터)
- [ ] PDF 리포트 생성
- [ ] 알림 설정 (특정 조건 시)
```

---

## 7. 리스크 및 대응

### 7.1 기술적 리스크

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| 유사 구간 검색 성능 저하 | 높음 | 중간 | 인덱싱, 캐싱 |
| 백테스트 계산 시간 초과 | 중간 | 낮음 | 병렬 처리, 타임아웃 |
| 차트 라이브러리 호환성 | 낮음 | 낮음 | 대안 라이브러리 확보 |

### 7.2 비즈니스 리스크

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| 추천 정확도 불만 | 중간 | 중간 | 명확한 면책조항 |
| 법적 이슈 | 높음 | 낮음 | 투자 조언 아님 명시 |

---

## 8. 아키텍처 설계

### 8.1 시퀀스 다이어그램

```
사용자 -> UI: 분석 요청
UI -> API: POST /api/recommend
API -> Service: generateRecommendation()
Service -> DB: 가격 데이터 조회
Service -> Metrics: 기술적 지표 계산
Service -> Similarity: 유사 구간 검색
Similarity -> Metrics: 구간별 지표 계산
Service -> Engine: 백테스트 실행 (x3 구간 x3 전략)
Service -> Score: 점수 계산
Score -> Service: 추천 결정
Service -> API: RecommendResult
API -> UI: JSON 응답
UI -> 사용자: 결과 표시
```

### 8.2 모듈 의존성

```
recommend/
├── types.ts          # 타입 정의 (의존성 없음)
├── similarity.ts     # ← backtest/metrics.ts
├── score.ts          # ← backtest/engine.ts
└── service.ts        # ← similarity.ts, score.ts, database/

components/recommend/
├── InputSection.tsx      # UI only
├── ReferenceChart.tsx    # ← recharts
├── SimilarPeriodCard.tsx # ← recharts
├── StrategyScoreTable.tsx# UI only
└── RecommendationCard.tsx# UI only

app/
├── recommend/page.tsx    # ← components/recommend/*
└── api/recommend/route.ts# ← recommend/service.ts
```

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0.0 | 2026-01-20 | manager-spec | 초기 계획 작성 |
