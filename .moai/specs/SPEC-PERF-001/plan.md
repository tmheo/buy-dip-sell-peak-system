---
spec_id: SPEC-PERF-001
version: "1.0.0"
created: 2026-01-30
updated: 2026-01-30
---

# SPEC-PERF-001 구현 계획

## 1. 마일스톤

### 1.1 Primary Goal: 핵심 인프라 구축

**목표**: similarity.ts 수정 및 기본 타입 정의

| 태스크 | 설명 | 파일 |
|--------|------|------|
| T1.1 | SimilarityOptions 인터페이스 정의 | `src/optimize/types.ts` |
| T1.2 | calculateExponentialSimilarity 함수 시그니처 확장 | `src/recommend/similarity.ts` |
| T1.3 | 하위 호환성 테스트 작성 | `src/recommend/__tests__/similarity.test.ts` |

**완료 기준**:
- 기존 테스트가 모두 통과
- 선택적 파라미터 전달 시 정상 동작

### 1.2 Secondary Goal: 파라미터 생성 모듈

**목표**: 랜덤 탐색 및 변형 탐색 로직 구현

| 태스크 | 설명 | 파일 |
|--------|------|------|
| T2.1 | 최적화 관련 타입 정의 | `src/optimize/types.ts` |
| T2.2 | 랜덤 파라미터 생성기 구현 | `src/optimize/param-generator.ts` |
| T2.3 | 변형 파라미터 생성기 구현 | `src/optimize/param-generator.ts` |
| T2.4 | 파라미터 유효성 검증 로직 | `src/optimize/param-generator.ts` |

**완료 기준**:
- 가중치 합이 항상 1.0
- 허용오차가 지정 범위 내

### 1.3 Tertiary Goal: 백테스트 러너

**목표**: 커스텀 파라미터로 백테스트 실행

| 태스크 | 설명 | 파일 |
|--------|------|------|
| T3.1 | RecommendBacktestEngine 통합 | `src/optimize/backtest-runner.ts` |
| T3.2 | 커스텀 유사도 함수 주입 패턴 | `src/optimize/backtest-runner.ts` |
| T3.3 | 병렬 실행 최적화 (선택) | `src/optimize/backtest-runner.ts` |

**완료 기준**:
- 단일 파라미터 조합으로 백테스트 실행 가능
- 결과에 수익률, MDD, 전략 점수 포함

### 1.4 Final Goal: 분석 및 CLI

**목표**: 결과 분석 및 CLI 인터페이스

| 태스크 | 설명 | 파일 |
|--------|------|------|
| T4.1 | 베이스라인 대비 분석 로직 | `src/optimize/analyzer.ts` |
| T4.2 | 순위 결정 및 정렬 | `src/optimize/analyzer.ts` |
| T4.3 | CLI 진입점 구현 | `src/optimize/cli.ts` |
| T4.4 | 결과 출력 포맷팅 | `src/optimize/cli.ts` |
| T4.5 | 모듈 인덱스 파일 | `src/optimize/index.ts` |

**완료 기준**:
- CLI로 전체 최적화 프로세스 실행 가능
- 콘솔 및 JSON 출력 지원

---

## 2. 기술적 접근

### 2.1 아키텍처 설계

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI (cli.ts)                           │
│  - 명령줄 인자 파싱                                         │
│  - 설정 로딩                                                │
│  - 결과 출력                                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Orchestrator (cli.ts 내부)                     │
│  1. 베이스라인 백테스트 실행                                │
│  2. 랜덤 파라미터 생성                                      │
│  3. 랜덤 조합 백테스트                                      │
│  4. Top N 선정 및 변형 생성                                 │
│  5. 변형 조합 백테스트                                      │
│  6. 최종 분석 및 결과 출력                                  │
└────┬──────────────────┬──────────────────┬──────────────────┘
     │                  │                  │
     ▼                  ▼                  ▼
┌──────────┐     ┌──────────────┐    ┌────────────┐
│  Param   │     │   Backtest   │    │  Analyzer  │
│Generator │     │   Runner     │    │            │
└──────────┘     └──────────────┘    └────────────┘
```

### 2.2 주요 설계 결정

#### 2.2.1 의존성 주입 패턴

similarity 함수를 직접 수정하지 않고, 옵션 파라미터로 주입하여 기존 코드 영향 최소화:

```typescript
// 기존 (변경 없음)
calculateExponentialSimilarity(vectorA, vectorB)

// 신규 (옵션 추가)
calculateExponentialSimilarity(vectorA, vectorB, {
  weights: [0.3, 0.4, 0.1, 0.1, 0.1],
  tolerances: [40, 80, 5, 35, 25]
})
```

#### 2.2.2 유사도 함수 주입

`RecommendBacktestEngine`에 커스텀 유사도 함수를 전달하는 대신, 전역 설정을 통해 파라미터 주입:

```typescript
// 방식 1: 모듈 레벨 설정 (단순)
setGlobalSimilarityParams(weights, tolerances);

// 방식 2: 함수 래퍼 (권장)
const customSimilarity = createSimilarityFunction(weights, tolerances);
```

**권장**: 방식 2 - 함수 래퍼를 사용하여 테스트 격리 및 병렬 실행 안전성 확보

#### 2.2.3 결과 캐싱

- 동일 파라미터 조합의 중복 실행 방지
- Map 기반 인메모리 캐시 사용
- 키: `JSON.stringify(params)`

### 2.3 데이터 흐름

```
[Config] → [ParamGenerator] → [BacktestRunner] → [Analyzer] → [Output]
    │             │                   │               │
    │             ▼                   ▼               ▼
    │      [Param Set 1..N]    [Metrics 1..N]   [Ranked Results]
    │             │                   │
    ▼             ▼                   │
[Baseline] ───────────────────────────┘
```

---

## 3. 리스크 분석

### 3.1 기술적 리스크

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| 백테스트 실행 시간 초과 | High | Medium | 병렬 처리 도입, 조합 수 감소 옵션 |
| 지역 최적에 수렴 | Medium | Medium | 변형 탐색으로 주변 공간 탐색 |
| 과적합 | High | High | 다년도 교차 검증 권장 (문서화) |

### 3.2 의존성 리스크

| 의존성 | 버전 | 리스크 |
|--------|------|--------|
| RecommendBacktestEngine | 현재 | 내부 구조 변경 시 통합 수정 필요 |
| similarity.ts | 현재 | 시그니처 변경으로 인한 영향 범위 테스트 필요 |
| better-sqlite3 | 11.7.0 | 낮음 (읽기 전용) |

---

## 4. 테스트 전략

### 4.1 단위 테스트

| 대상 | 테스트 케이스 | 커버리지 목표 |
|------|--------------|---------------|
| param-generator | 가중치 정규화, 범위 검증 | 100% |
| similarity (수정) | 하위 호환성, 커스텀 파라미터 | 100% |
| analyzer | 점수 계산, 순위 결정 | 90% |

### 4.2 통합 테스트

| 시나리오 | 검증 내용 |
|----------|----------|
| 전체 파이프라인 | CLI → 결과 출력 정상 동작 |
| 베이스라인 일치 | 기본 파라미터로 기존 백테스트 결과와 동일 |

---

## 5. 구현 순서

```
Day 1: [T1.1, T1.2, T1.3] - 핵심 인프라
Day 2: [T2.1, T2.2, T2.3, T2.4] - 파라미터 생성
Day 3: [T3.1, T3.2] - 백테스트 러너
Day 4: [T4.1, T4.2, T4.3, T4.4, T4.5] - 분석 및 CLI
Day 5: 통합 테스트 및 문서화
```

---

## 6. 참고 자료

### 6.1 관련 파일

- `src/recommend/similarity.ts` - 현재 유사도 계산 로직
- `src/recommend/types.ts` - 기존 타입 정의
- `src/backtest-recommend/engine.ts` - 추천 백테스트 엔진
- `src/backtest/types.ts` - 백테스트 관련 타입

### 6.2 현재 하드코딩된 값 (참조)

```typescript
// 가중치: [기울기, 이격도, RSI, ROC, 변동성]
const METRIC_WEIGHTS = [0.35, 0.4, 0.05, 0.07, 0.13];

// 허용오차: [기울기, 이격도, RSI, ROC, 변동성]
const METRIC_TOLERANCES = [36, 90, 4.5, 40, 28];
```
