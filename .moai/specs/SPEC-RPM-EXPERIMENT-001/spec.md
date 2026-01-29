# SPEC-RPM-EXPERIMENT-001: RPM 8개 지표 기반 유사도 실험

## 메타데이터

| 항목 | 값 |
|------|-----|
| SPEC ID | SPEC-RPM-EXPERIMENT-001 |
| 제목 | RPM 8개 지표 기반 유사도 실험 |
| 생성일 | 2026-01-29 |
| 상태 | Draft |
| 우선순위 | High |
| 담당 | manager-ddd |
| 관련 SPEC | SPEC-RECOMMEND-001, SPEC-BACKTEST-001 |
| 참조 | feature/SPEC-EXPERIMENT-001 브랜치 |

---

## 1. 개요

### 1.1 목적

RPM(Real-Time Pattern Machine) 8개 지표 기반 유사도 계산 방식이 기존 5개 지표 + 지수감쇠 방식보다 추천 전략 성과를 개선하는지 검증한다.

### 1.2 배경

- **기존 방식**: 5개 지표(MA기울기, 이격도, RSI14, ROC12, 변동성20) + 지수감쇠 유사도 (0~100점)
- **RPM 방식**: 8개 지표 + 가중합 유사도 (-500~+500점)
- **출처**: [로이킴의 경제이야기 - RPM 분석](https://blog.naver.com/therich-roy/224158442470)

### 1.3 성공 기준

- 8개 지표 계산 검증: 26.01.23 기준 블로그 값과 일치
- 실험군(RPM)이 베이스라인(기존) 대비 전략 점수 개선

---

## 2. 요구사항 (EARS 형식)

### REQ-001: RPM 지표 테이블 생성

**When** 시스템이 초기화되면,
**the system shall** `rpm_indicators` 테이블을 생성하여 8개 지표와 유사도 점수를 저장한다.

**인수 조건**:
- [ ] 테이블 스키마에 8개 지표 컬럼 포함
- [ ] ticker, date로 복합 유니크 인덱스

### REQ-002: 8개 RPM 지표 계산

**When** SOXL 가격 데이터가 주어지면,
**the system shall** 각 날짜에 대해 8개 RPM 지표를 계산한다.

| 지표 | 배점 | 비중 | 계산 방식 |
|------|------|------|----------|
| RSI 14 | 120점 | 24% | 14일 RSI (Wilder's EMA) |
| 이격도 20 | 80점 | 16% | (종가 - MA20) / MA20 × 100 |
| ROC 10 | 80점 | 16% | (현재가 - 10일전) / 10일전 × 100 |
| MACD Histogram | 50점 | 10% | MACD(12,26) - Signal(9) |
| 변동성폭 | 50점 | 10% | 볼린저밴드폭 = (상단-하단) / 중앙 |
| ATR % | 50점 | 10% | ATR(14) / 종가 × 100 |
| 이격도 60 | 20점 | 4% | (종가 - MA60) / MA60 × 100 |
| 스토캐스틱 K | 20점 | 4% | %K(14, 3) |

**인수 조건**:
- [ ] 모든 8개 지표가 정확히 계산됨
- [ ] Decimal.js로 정밀 계산

### REQ-003: RPM 유사도 점수 계산

**When** 두 날짜의 8개 지표가 주어지면,
**the system shall** 가중합 방식으로 유사도 점수를 계산한다.

**유사도 공식**:
```
각 지표별 점수 = 배점 × (1 - |기준값 - 비교값| / 허용오차)
유사도 점수 = Σ(각 지표별 점수), 범위: -500 ~ +500
```

**인수 조건**:
- [ ] 26.01.23 기준 유사도 점수 370점 검증
- [ ] 점수 범위 -500 ~ +500

### REQ-004: 계산 검증 (26.01.23)

**When** 26.01.23 데이터에 대해 8개 지표를 계산하면,
**the system shall** 블로그 값과 일치해야 한다.

| 지표 | 블로그 값 | 계산값 | 허용 오차 |
|------|----------|--------|----------|
| RSI 14 | 65.81 | ? | ±0.5 |
| 이격도 20 | 16.7% | ? | ±0.5% |
| ROC 10 | 24.1% | ? | ±0.5% |
| MACD Histogram | 0.93 | ? | ±0.1 |
| 변동성폭 | 0.53 | ? | ±0.05 |
| ATR % | 6.86% | ? | ±0.5% |
| 이격도 60 | 34.62% | ? | ±0.5% |
| 스토캐스틱 K | 71.5% | ? | ±1% |

**인수 조건**:
- [ ] 모든 지표가 허용 오차 내 일치

### REQ-005: 베이스라인 백테스트

**When** 베이스라인 측정이 요청되면,
**the system shall** 기존 `RecommendBacktestEngine`으로 25.01.01~25.12.31 백테스트를 수행한다.

**측정 지표**:
- 수익률 (%)
- MDD (%)
- 전략 점수 = 수익률(%) × e^(MDD(%) × 0.01)

**인수 조건**:
- [ ] 기존 방식으로 백테스트 완료
- [ ] 3가지 지표 기록

### REQ-006: RPM 방식 추천 백테스트

**When** RPM 실험이 요청되면,
**the system shall** RPM 유사도 기반으로 동일 기간(25.01.01~25.12.31) 백테스트를 수행한다.

**차이점**:
- 유사 구간 선택: 유사도 점수 차이가 가장 적은 Top N 선택
- 지표: 8개 RPM 지표 사용

**인수 조건**:
- [ ] RPM 유사도 기반 추천 로직 구현
- [ ] 동일 기간 백테스트 완료

### REQ-007: 성과 비교 리포트

**When** 두 백테스트가 완료되면,
**the system shall** 베이스라인과 실험군의 성과를 비교한다.

| 항목 | 베이스라인 (기존) | 실험군 (RPM) | 개선율 |
|------|------------------|--------------|--------|
| 수익률 | ? | ? | ? |
| MDD | ? | ? | ? |
| 전략 점수 | ? | ? | ? |

**인수 조건**:
- [ ] 비교표 출력
- [ ] 개선율 계산

---

## 3. 기술 설계

### 3.1 파일 구조

```
src/experiment/rpm/
├── __tests__/
│   ├── rpm-indicators.test.ts
│   ├── rpm-similarity.test.ts
│   └── rpm-experiment.test.ts
├── types.ts                    # RPM 실험 타입 정의
├── rpm-indicators.ts           # 8개 지표 계산
├── rpm-similarity.ts           # RPM 유사도 계산
├── rpm-recommend-engine.ts     # RPM 기반 추천 백테스트 엔진
├── rpm-experiment-runner.ts    # 실험 실행기
└── index.ts                    # 모듈 export
```

### 3.2 DB 스키마

```sql
CREATE TABLE IF NOT EXISTS rpm_indicators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  -- 8개 RPM 지표
  rsi14 REAL,
  disparity20 REAL,
  roc10 REAL,
  macd_histogram REAL,
  bollinger_width REAL,
  atr_percent REAL,
  disparity60 REAL,
  stochastic_k REAL,
  -- 유사도 점수
  similarity_score REAL,
  -- 메타데이터
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_rpm_indicators_ticker_date
ON rpm_indicators(ticker, date);
```

### 3.3 핵심 인터페이스

```typescript
// 8개 RPM 지표
interface RpmIndicators {
  rsi14: number;
  disparity20: number;
  roc10: number;
  macdHistogram: number;
  bollingerWidth: number;
  atrPercent: number;
  disparity60: number;
  stochasticK: number;
}

// RPM 유사도 결과
interface RpmSimilarityResult {
  date: string;
  indicators: RpmIndicators;
  similarityScore: number;
  scoreDifference: number;  // 기준일과의 점수 차이
}

// 실험 결과
interface ExperimentResult {
  baseline: BacktestMetrics;
  experimental: BacktestMetrics;
  improvement: {
    returnRate: number;
    mdd: number;
    strategyScore: number;
  };
}
```

---

## 4. 구현 계획

### Phase 1: DB 스키마 및 지표 계산
- [ ] `rpm_indicators` 테이블 생성
- [ ] 8개 지표 계산 함수 구현
- [ ] SOXL 전체 기간 지표 계산 및 저장

### Phase 2: 계산 검증 (26.01.23)
- [ ] 블로그 값과 계산 결과 비교
- [ ] 불일치 시 계산 로직 수정
- [ ] 유사도 점수 370점 검증

### Phase 3: 베이스라인 측정
- [ ] 기존 RecommendBacktestEngine으로 25.01.01~25.12.31 백테스트
- [ ] 수익률, MDD, 전략 점수 기록

### Phase 4: RPM 방식 백테스트
- [ ] RPM 유사도 기반 추천 로직 구현
- [ ] 동일 기간 백테스트 수행
- [ ] 수익률, MDD, 전략 점수 기록

### Phase 5: 성과 비교 및 분석
- [ ] 베이스라인 vs 실험군 비교표 생성
- [ ] 개선율 분석
- [ ] 결론 도출

---

## 5. 참고 자료

- **기존 실험 코드**: `feature/SPEC-EXPERIMENT-001` 브랜치
- **RPM 분석 문서**: `docs/RPM_분석_26-01-26-30.md`
- **기존 추천 시스템**: `src/recommend/similarity.ts`
- **백테스트 추천 엔진**: `src/backtest-recommend/engine.ts`
