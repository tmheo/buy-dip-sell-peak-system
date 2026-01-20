# SPEC-RECOMMEND-001: 인수 테스트 기준

## 메타데이터

| 항목 | 값 |
|------|-----|
| SPEC ID | SPEC-RECOMMEND-001 |
| 관련 문서 | spec.md, plan.md |
| 생성일 | 2026-01-20 |
| 테스트 형식 | Given-When-Then (Gherkin) |

---

## 1. 입력 섹션 테스트

### 1.1 기준일 선택 테스트

#### TC-INPUT-001: 오늘 기준 선택
```gherkin
Feature: 기준일 선택

  Scenario: 오늘 기준 라디오 버튼 선택
    Given 사용자가 추천 페이지에 접속했다
    When 사용자가 "오늘 기준" 라디오 버튼을 클릭한다
    Then 날짜 입력 필드가 읽기 전용으로 변경된다
    And 날짜 입력 필드에 오늘 날짜가 표시된다
    And 캘린더 아이콘이 비활성화된다
```

#### TC-INPUT-002: 특정일 기준 선택
```gherkin
  Scenario: 특정일 기준 라디오 버튼 선택
    Given 사용자가 추천 페이지에 접속했다
    When 사용자가 "특정일 기준" 라디오 버튼을 클릭한다
    Then 날짜 입력 필드가 편집 가능하게 변경된다
    And 캘린더 아이콘이 활성화된다
    And 캘린더 아이콘 클릭 시 날짜 선택기가 표시된다
```

#### TC-INPUT-003: 캘린더 날짜 선택
```gherkin
  Scenario: 캘린더에서 날짜 선택
    Given 사용자가 "특정일 기준"을 선택했다
    And 캘린더가 표시되어 있다
    When 사용자가 "2026-01-15"를 클릭한다
    Then 날짜 입력 필드에 "2026-01-15"가 표시된다
    And 캘린더가 닫힌다
```

### 1.2 종목 선택 테스트

#### TC-INPUT-004: 종목 드롭다운 표시
```gherkin
  Scenario: 종목 드롭다운 옵션 확인
    Given 사용자가 추천 페이지에 접속했다
    When 사용자가 종목 드롭다운을 클릭한다
    Then "SOXL"과 "TQQQ" 옵션이 표시된다
    And "SOXL"이 기본값으로 선택되어 있다
```

#### TC-INPUT-005: 종목 변경
```gherkin
  Scenario: 종목 선택 변경
    Given 사용자가 추천 페이지에 접속했다
    And "SOXL"이 선택되어 있다
    When 사용자가 "TQQQ"를 선택한다
    Then 종목 드롭다운에 "TQQQ"가 표시된다
```

### 1.3 기본값 테스트

#### TC-INPUT-006: 페이지 로드 시 기본값
```gherkin
  Scenario: 페이지 초기 상태 확인
    Given 사용자가 추천 페이지에 처음 접속했다
    Then "오늘 기준" 라디오 버튼이 선택되어 있다
    And 날짜 입력 필드에 오늘 날짜가 표시된다
    And 종목 드롭다운에 "SOXL"이 선택되어 있다
    And "분석하기" 버튼이 활성화되어 있다
```

---

## 2. API 테스트

### 2.1 정상 요청 테스트

#### TC-API-001: 유효한 분석 요청
```gherkin
Feature: 추천 API

  Scenario: 유효한 요청으로 추천 결과 받기
    Given API 서버가 실행 중이다
    And 데이터베이스에 SOXL 데이터가 충분히 존재한다 (60일 이상)
    When POST /api/recommend 요청을 보낸다:
      | ticker        | SOXL       |
      | referenceDate | 2026-01-20 |
      | isToday       | true       |
    Then 응답 상태 코드가 200이다
    And 응답 본문에 "success": true가 포함된다
    And 응답 본문에 "data.referenceMetrics"가 포함된다
    And 응답 본문에 "data.similarPeriods" 배열이 3개의 요소를 포함한다
    And 응답 본문에 "data.recommendation.strategy"가 포함된다
```

#### TC-API-002: 기술적 지표 포함 확인
```gherkin
  Scenario: 응답에 기술적 지표 포함 확인
    Given API 서버가 실행 중이다
    When 유효한 분석 요청을 보낸다
    Then 응답의 referenceMetrics에 다음 필드가 포함된다:
      | isGoldenCross | boolean |
      | maSlope       | number  |
      | disparity     | number  |
      | rsi14         | number  |
      | roc12         | number  |
      | volatility20  | number  |
```

### 2.2 에러 처리 테스트

#### TC-API-003: 지원하지 않는 종목
```gherkin
  Scenario: 지원하지 않는 종목 요청
    Given API 서버가 실행 중이다
    When POST /api/recommend 요청을 보낸다:
      | ticker        | SPY        |
      | referenceDate | 2026-01-20 |
    Then 응답 상태 코드가 400이다
    And 응답 본문에 "error.code": "INVALID_TICKER"가 포함된다
```

#### TC-API-004: 잘못된 날짜 형식
```gherkin
  Scenario: 잘못된 날짜 형식 요청
    Given API 서버가 실행 중이다
    When POST /api/recommend 요청을 보낸다:
      | ticker        | SOXL       |
      | referenceDate | 01/20/2026 |
    Then 응답 상태 코드가 400이다
    And 응답 본문에 "error.code": "INVALID_DATE"가 포함된다
```

#### TC-API-005: 미래 날짜 요청
```gherkin
  Scenario: 미래 날짜 요청
    Given API 서버가 실행 중이다
    And 오늘 날짜가 2026-01-20이다
    When POST /api/recommend 요청을 보낸다:
      | ticker        | SOXL       |
      | referenceDate | 2026-02-01 |
    Then 응답 상태 코드가 400이다
    And 응답 본문에 "error.code": "FUTURE_DATE"가 포함된다
```

#### TC-API-006: 데이터 부족
```gherkin
  Scenario: 60일 미만 데이터로 요청
    Given API 서버가 실행 중이다
    And 데이터베이스에 SOXL 데이터가 30일만 존재한다
    When POST /api/recommend 요청을 보낸다:
      | ticker        | SOXL       |
      | referenceDate | 2026-01-20 |
    Then 응답 상태 코드가 422이다
    And 응답 본문에 "error.code": "INSUFFICIENT_DATA"가 포함된다
```

---

## 3. 유사도 계산 테스트

### 3.1 코사인 유사도 테스트

#### TC-SIMILAR-001: 동일 벡터 유사도
```gherkin
Feature: 코사인 유사도 계산

  Scenario: 동일한 지표 벡터의 유사도
    Given 기준 벡터 A = [0, 5.0, -3.0, 45.0, 10.0, 0.05]
    And 비교 벡터 B = [0, 5.0, -3.0, 45.0, 10.0, 0.05]
    When 코사인 유사도를 계산한다
    Then 결과가 1.0 (100%)이다
```

#### TC-SIMILAR-002: 유사 벡터 유사도
```gherkin
  Scenario: 유사한 지표 벡터의 유사도
    Given 기준 벡터 A = [0, 5.0, -3.0, 45.0, 10.0, 0.05]
    And 비교 벡터 B = [0, 4.8, -3.2, 44.5, 9.8, 0.048]
    When 코사인 유사도를 계산한다
    Then 결과가 0.95 이상이다
```

#### TC-SIMILAR-003: 반대 벡터 유사도
```gherkin
  Scenario: 반대 방향 벡터의 유사도
    Given 기준 벡터 A = [1, 5.0, 3.0, 70.0, 15.0, 0.03]
    And 비교 벡터 B = [0, -5.0, -3.0, 30.0, -15.0, 0.08]
    When 코사인 유사도를 계산한다
    Then 결과가 0.5 미만이다
```

### 3.2 유사 구간 검색 테스트

#### TC-SIMILAR-004: Top 3 유사 구간 검색
```gherkin
  Scenario: 유사 구간 Top 3 반환
    Given 기준일이 "2026-01-20"이다
    And 충분한 과거 데이터가 존재한다 (2년 이상)
    When 유사 구간을 검색한다
    Then 정확히 3개의 유사 구간이 반환된다
    And 각 구간의 유사도가 내림차순으로 정렬되어 있다
    And 첫 번째 구간의 유사도가 가장 높다
```

#### TC-SIMILAR-005: 유사 구간 날짜 범위
```gherkin
  Scenario: 유사 구간 날짜 검증
    Given 기준일이 "2026-01-20"이다
    When 유사 구간을 검색한다
    Then 각 유사 구간의 종료일이 기준일보다 최소 40일 이전이다
    And 각 유사 구간의 분석 기간이 20일이다
    And 각 유사 구간의 성과 확인 기간이 20일이다
```

---

## 4. 점수 계산 테스트

### 4.1 전략 점수 테스트

#### TC-SCORE-001: 점수 계산 공식 검증
```gherkin
Feature: 전략 점수 계산

  Scenario: 점수 계산 공식 검증 (수익률 15%, MDD -25%)
    Given 수익률이 0.15 (15%)이다
    And MDD가 -0.25 (-25%)이다
    And weight가 0.01이다
    When 전략 점수를 계산한다
    Then 결과가 약 11.68이다
    # 15 × e^(-25 × 0.01) = 15 × e^(-0.25) ≈ 11.68
```

#### TC-SCORE-002: 높은 MDD 페널티
```gherkin
  Scenario: 높은 MDD에 대한 페널티 검증
    Given 전략 A의 수익률이 20%, MDD가 -10%이다
    And 전략 B의 수익률이 20%, MDD가 -40%이다
    When 두 전략의 점수를 계산한다
    Then 전략 A의 점수가 전략 B보다 높다
```

#### TC-SCORE-003: 음수 수익률 점수
```gherkin
  Scenario: 음수 수익률의 점수 계산
    Given 수익률이 -0.10 (-10%)이다
    And MDD가 -0.15 (-15%)이다
    When 전략 점수를 계산한다
    Then 결과가 음수이다
```

### 4.2 평균 점수 테스트

#### TC-SCORE-004: 3개 구간 평균 점수
```gherkin
  Scenario: 3개 유사 구간의 평균 점수 계산
    Given Pro2 전략의 구간별 점수가 [14.2, 15.8, 13.5]이다
    When 평균 점수를 계산한다
    Then 결과가 14.5이다
```

### 4.3 Pro1 제외 테스트

#### TC-SCORE-005: 정배열 시 Pro1 제외
```gherkin
  Scenario: 정배열 상태에서 Pro1 제외
    Given 기준일의 isGoldenCross가 true이다 (MA20 > MA60)
    When 전략 점수를 계산한다
    Then Pro1의 점수가 null이다
    And Pro1에 "정배열 시 제외" 표시가 된다
    And 추천 대상에서 Pro1이 제외된다
```

#### TC-SCORE-006: 역배열 시 Pro1 포함
```gherkin
  Scenario: 역배열 상태에서 Pro1 포함
    Given 기준일의 isGoldenCross가 false이다 (MA20 < MA60)
    When 전략 점수를 계산한다
    Then Pro1의 점수가 계산된다
    And Pro1이 추천 대상에 포함된다
```

---

## 5. 추천 결과 테스트

### 5.1 추천 전략 테스트

#### TC-RECOMMEND-001: 최고 점수 전략 추천
```gherkin
Feature: 전략 추천

  Scenario: 가장 높은 평균 점수의 전략 추천
    Given Pro1의 평균 점수가 12.0이다
    And Pro2의 평균 점수가 14.5이다
    And Pro3의 평균 점수가 18.6이다
    When 추천 전략을 결정한다
    Then "Pro3"이 추천된다
    And 추천 이유에 "평균 점수 18.6으로 가장 높음"이 포함된다
```

#### TC-RECOMMEND-002: 정배열 시 Pro2/Pro3 중 추천
```gherkin
  Scenario: 정배열 상태에서 추천
    Given isGoldenCross가 true이다
    And Pro1이 제외되었다
    And Pro2의 평균 점수가 14.5이다
    And Pro3의 평균 점수가 13.2이다
    When 추천 전략을 결정한다
    Then "Pro2"가 추천된다
```

### 5.2 비율 표시 테스트

#### TC-RECOMMEND-003: Pro1 비율 표시
```gherkin
  Scenario: Pro1 전략 비율 표시
    Given "Pro1"이 추천되었다
    When 비율을 표시한다
    Then 티어별 비율이 [20%, 20%, 20%, 20%, 20%, 0%]로 표시된다
```

#### TC-RECOMMEND-004: Pro2 비율 표시
```gherkin
  Scenario: Pro2 전략 비율 표시
    Given "Pro2"가 추천되었다
    When 비율을 표시한다
    Then 티어별 비율이 [15%, 15%, 15%, 15%, 15%, 25%]로 표시된다
```

#### TC-RECOMMEND-005: Pro3 비율 표시
```gherkin
  Scenario: Pro3 전략 비율 표시
    Given "Pro3"이 추천되었다
    When 비율을 표시한다
    Then 티어별 비율이 [10%, 10%, 10%, 10%, 10%, 50%]로 표시된다
```

### 5.3 면책조항 테스트

#### TC-RECOMMEND-006: 면책조항 표시
```gherkin
  Scenario: 면책조항 항상 표시
    Given 추천 결과가 생성되었다
    When 결과를 표시한다
    Then 면책조항 "본 추천은 투자 조언이 아니며 참고용입니다"가 표시된다
    And 면책조항이 추천 카드 하단에 위치한다
```

---

## 6. UI 테스트

### 6.1 차트 표시 테스트

#### TC-UI-001: 기준일 차트 표시
```gherkin
Feature: 차트 UI

  Scenario: 기준일 분석 차트 렌더링
    Given 분석 요청이 완료되었다
    When 차트를 렌더링한다
    Then 20일 가격 라인 차트가 표시된다
    And MA20 라인이 표시된다
    And MA60 라인이 표시된다
    And 미래 20일 영역이 회색으로 표시된다
```

#### TC-UI-002: 기술적 지표 메트릭 표시
```gherkin
  Scenario: 6개 기술적 지표 메트릭 표시
    Given 분석 요청이 완료되었다
    When 메트릭을 렌더링한다
    Then 정배열 상태가 ✓ 또는 ✗로 표시된다
    And 기울기20 값이 % 단위로 표시된다
    And 이격도20 값이 % 단위로 표시된다
    And RSI14 값이 0-100 범위로 표시된다
    And ROC12 값이 % 단위로 표시된다
    And 변동성 값이 % 단위로 표시된다
```

### 6.2 유사 구간 카드 테스트

#### TC-UI-003: 유사 구간 카드 표시
```gherkin
  Scenario: 유사 구간 카드 3개 표시
    Given 유사 구간 3개가 검색되었다
    When 카드를 렌더링한다
    Then 3개의 유사 구간 카드가 가로로 배열된다
    And 각 카드에 유사도 퍼센트가 배지로 표시된다
    And 각 카드에 분석 구간 미니 차트가 표시된다
    And 각 카드에 Pro1/Pro2/Pro3 결과 테이블이 표시된다
```

### 6.3 반응형 테스트

#### TC-UI-004: 모바일 반응형
```gherkin
  Scenario: 모바일 화면 (< 768px) 레이아웃
    Given 화면 너비가 375px이다
    When 페이지를 렌더링한다
    Then 유사 구간 카드가 세로로 배열된다
    And 입력 섹션이 전체 너비를 사용한다
    And 테이블이 가로 스크롤 가능하다
```

#### TC-UI-005: 태블릿 반응형
```gherkin
  Scenario: 태블릿 화면 (768px - 1199px) 레이아웃
    Given 화면 너비가 1024px이다
    When 페이지를 렌더링한다
    Then 유사 구간 카드가 2열로 배열된다
```

### 6.4 로딩 상태 테스트

#### TC-UI-006: 로딩 스피너 표시
```gherkin
  Scenario: 분석 중 로딩 상태
    Given 사용자가 "분석하기" 버튼을 클릭했다
    When API 요청이 진행 중이다
    Then 로딩 스피너가 표시된다
    And "분석하기" 버튼이 비활성화된다
    And 입력 필드가 비활성화된다
```

#### TC-UI-007: 로딩 완료 후 상태
```gherkin
  Scenario: 분석 완료 후 상태
    Given 로딩 스피너가 표시되어 있다
    When API 응답이 도착한다
    Then 로딩 스피너가 사라진다
    And 결과가 표시된다
    And "분석하기" 버튼이 활성화된다
```

---

## 7. 성능 테스트

### 7.1 응답 시간 테스트

#### TC-PERF-001: API 응답 시간
```gherkin
Feature: 성능

  Scenario: API 응답 시간 5초 이내
    Given 데이터베이스에 5년치 데이터가 존재한다
    When 분석 요청을 보낸다
    Then 응답이 5초 이내에 도착한다
```

#### TC-PERF-002: 차트 렌더링 시간
```gherkin
  Scenario: 차트 렌더링 500ms 이내
    Given API 응답이 도착했다
    When 차트를 렌더링한다
    Then 렌더링이 500ms 이내에 완료된다
```

---

## 8. Quality Gate

### 8.1 완료 기준 (Definition of Done)

| 항목 | 기준 | 필수 |
|------|------|------|
| 단위 테스트 커버리지 | >= 80% | Yes |
| 통합 테스트 통과 | 100% | Yes |
| API 응답 시간 | < 5초 | Yes |
| 린트 경고 | 0개 | Yes |
| 타입 에러 | 0개 | Yes |
| 접근성 검사 | WCAG 2.1 AA | No |
| 성능 점수 (Lighthouse) | >= 80 | No |

### 8.2 테스트 매트릭스

| 테스트 영역 | 테스트 케이스 수 | 자동화 |
|------------|----------------|--------|
| 입력 섹션 | 6 | Yes |
| API | 6 | Yes |
| 유사도 계산 | 5 | Yes |
| 점수 계산 | 6 | Yes |
| 추천 결과 | 6 | Yes |
| UI | 7 | Partial |
| 성능 | 2 | Yes |
| **총계** | **38** | |

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0.0 | 2026-01-20 | manager-spec | 초기 인수 테스트 작성 |
