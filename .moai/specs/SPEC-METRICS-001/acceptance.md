# SPEC-METRICS-001 수용 기준

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-METRICS-001 |
| **제목** | 기술적 지표 차트 데이터 수용 기준 |
| **생성일** | 2026-01-17 |

---

## 1. 이동평균 테스트 시나리오

### 1.1 MA20 계산

#### TC-001: MA20 정상 계산

```gherkin
Feature: 20일 단순이동평균 계산
  20일 이상의 가격 데이터가 있을 때 MA20을 정확히 계산한다.

  Scenario: 20일 데이터로 MA20 계산
    Given 다음 20일간의 수정종가 데이터가 있다:
      | day | adjClose |
      | 1   | 25.00    |
      | 2   | 25.50    |
      | 3   | 24.80    |
      | ... | ...      |
      | 20  | 26.00    |
    And 20일간 수정종가의 합계가 $510.00이다
    When MA20을 계산한다
    Then MA20은 $510.00 / 20 = $25.50이다
    And 소수점 4자리까지 정밀하게 계산된다

  Scenario: 40일 데이터에서 마지막 20일 MA20 계산
    Given 40일간의 수정종가 데이터가 있다
    And 마지막 20일간의 합계가 $520.00이다
    When 인덱스 39에서 MA20을 계산한다
    Then MA20은 $520.00 / 20 = $26.00이다
```

#### TC-002: MA20 데이터 부족

```gherkin
Feature: MA20 데이터 부족 처리
  20일 미만의 데이터에서는 null을 반환한다.

  Scenario: 19일 데이터에서 MA20 계산 시도
    Given 19일간의 수정종가 데이터만 있다
    When 인덱스 18에서 MA20을 계산한다
    Then 결과는 null이다

  Scenario: 첫 날 데이터에서 MA20 계산 시도
    Given 1일간의 수정종가 데이터만 있다
    When 인덱스 0에서 MA20을 계산한다
    Then 결과는 null이다
```

### 1.2 MA60 계산

#### TC-003: MA60 정상 계산

```gherkin
Feature: 60일 단순이동평균 계산
  60일 이상의 가격 데이터가 있을 때 MA60을 정확히 계산한다.

  Scenario: 60일 데이터로 MA60 계산
    Given 60일간의 수정종가 데이터가 있다
    And 60일간 수정종가의 합계가 $1,500.00이다
    When 인덱스 59에서 MA60을 계산한다
    Then MA60은 $1,500.00 / 60 = $25.00이다
```

#### TC-004: MA60 데이터 부족

```gherkin
Feature: MA60 데이터 부족 처리
  60일 미만의 데이터에서는 null을 반환한다.

  Scenario: 59일 데이터에서 MA60 계산 시도
    Given 59일간의 수정종가 데이터만 있다
    When 인덱스 58에서 MA60을 계산한다
    Then 결과는 null이다
```

---

## 2. RSI 테스트 시나리오

### 2.1 RSI(14) 정상 계산

#### TC-005: RSI 기본 계산

```gherkin
Feature: RSI(14) Wilder EMA 방식 계산
  14일 이상의 데이터로 RSI를 Wilder의 EMA 방식으로 계산한다.

  Scenario: 14일 초기 RSI 계산
    Given 15일간의 수정종가 데이터가 있다
    And 첫 14일간 일별 가격 변화가 다음과 같다:
      | day | change |
      | 1→2 | +1.00  |
      | 2→3 | -0.50  |
      | 3→4 | +0.80  |
      | ... | ...    |
    And 첫 14일 평균 상승폭이 0.50이다
    And 첫 14일 평균 하락폭이 0.30이다
    When RSI(14)를 계산한다
    Then RS = 0.50 / 0.30 = 1.6667이다
    And RSI = 100 - (100 / 2.6667) = 62.50이다

  Scenario: 20일 데이터에서 Wilder Smoothed EMA 적용
    Given 20일간의 수정종가 데이터가 있다
    And 15일째부터 Wilder EMA 방식이 적용된다:
      avgGain = (prevAvgGain × 13 + currentGain) / 14
      avgLoss = (prevAvgLoss × 13 + currentLoss) / 14
    When 인덱스 19에서 RSI(14)를 계산한다
    Then Wilder EMA가 적용된 RSI 값이 반환된다
```

### 2.2 RSI 극단값

#### TC-006: RSI 과매수/과매도 구간

```gherkin
Feature: RSI 극단값 처리
  극단적인 상승/하락 시 RSI가 적절한 범위를 유지한다.

  Scenario: 연속 상승으로 RSI > 70
    Given 14일 연속 주가가 상승했다
    And 평균 하락폭이 0에 가깝다
    When RSI를 계산한다
    Then RSI는 70 초과이다 (과매수 구간)
    And RSI는 100을 초과하지 않는다

  Scenario: 연속 하락으로 RSI < 30
    Given 14일 연속 주가가 하락했다
    And 평균 상승폭이 0에 가깝다
    When RSI를 계산한다
    Then RSI는 30 미만이다 (과매도 구간)
    And RSI는 0 미만이 되지 않는다

  Scenario: 평균 하락폭이 0일 때
    Given 14일간 하락이 전혀 없었다
    And 평균 하락폭이 정확히 0이다
    When RSI를 계산한다
    Then RSI는 100이다
```

#### TC-007: RSI 데이터 부족

```gherkin
Feature: RSI 데이터 부족 처리
  14일 미만의 데이터에서는 null을 반환한다.

  Scenario: 13일 데이터에서 RSI 계산 시도
    Given 13일간의 수정종가 데이터만 있다
    When 인덱스 12에서 RSI를 계산한다
    Then 결과는 null이다
```

---

## 3. ROC 테스트 시나리오

### 3.1 ROC(12) 계산

#### TC-008: ROC 정상 계산

```gherkin
Feature: ROC(12) 12일 변화율 계산
  12일 전 대비 현재 가격의 변화율을 계산한다.

  Scenario: 12일 전 대비 상승
    Given 12일 전 수정종가가 $25.00이다
    And 현재 수정종가가 $27.50이다
    When ROC(12)를 계산한다
    Then ROC = ($27.50 - $25.00) / $25.00 × 100 = 10.00%이다

  Scenario: 12일 전 대비 하락
    Given 12일 전 수정종가가 $30.00이다
    And 현재 수정종가가 $27.00이다
    When ROC(12)를 계산한다
    Then ROC = ($27.00 - $30.00) / $30.00 × 100 = -10.00%이다

  Scenario: 12일 전 대비 변화 없음
    Given 12일 전 수정종가가 $25.00이다
    And 현재 수정종가가 $25.00이다
    When ROC(12)를 계산한다
    Then ROC = 0.00%이다
```

#### TC-009: ROC 데이터 부족

```gherkin
Feature: ROC 데이터 부족 처리
  12일 미만의 데이터에서는 null을 반환한다.

  Scenario: 11일 데이터에서 ROC 계산 시도
    Given 11일간의 수정종가 데이터만 있다
    When 인덱스 10에서 ROC를 계산한다
    Then 결과는 null이다
```

---

## 4. 변동성 테스트 시나리오

### 4.1 20일 연율화 변동성

#### TC-010: 변동성 정상 계산

```gherkin
Feature: 20일 연율화 변동성 계산
  최근 20일 일별 수익률의 표준편차를 연율화한다.

  Scenario: 변동성 계산
    Given 21일간의 수정종가 데이터가 있다
    And 최근 20일간 일별 수익률이 다음과 같다:
      | day | return |
      | 1   | +0.02  |
      | 2   | -0.01  |
      | 3   | +0.03  |
      | ... | ...    |
      | 20  | -0.02  |
    And 일별 수익률의 표본 표준편차가 0.025이다
    When 변동성을 계산한다
    Then 변동성 = 0.025 × sqrt(20) = 0.1118 (11.18%)이다

  Scenario: 낮은 변동성 (안정적 시장)
    Given 일별 수익률 표본 표준편차가 0.01이다
    When 변동성을 계산한다
    Then 변동성 = 0.01 × sqrt(20) = 0.0447 (4.47%)이다

  Scenario: 높은 변동성 (불안정 시장)
    Given 일별 수익률 표본 표준편차가 0.05이다
    When 변동성을 계산한다
    Then 변동성 = 0.05 × sqrt(20) = 0.2236 (22.36%)이다
```

#### TC-011: 변동성 데이터 부족

```gherkin
Feature: 변동성 데이터 부족 처리
  20일 수익률을 계산하려면 21일 데이터가 필요하다.

  Scenario: 20일 데이터에서 변동성 계산 시도
    Given 20일간의 수정종가 데이터만 있다
    When 인덱스 19에서 변동성을 계산한다
    Then 결과는 null이다 (19일치 수익률만 계산 가능)
```

---

## 5. 복합 지표 테스트 시나리오

### 5.1 정배열 (Golden Cross)

#### TC-012: 정배열 계산

```gherkin
Feature: 정배열 지표 계산
  MA20과 MA60의 차이를 백분율로 계산한다.

  Scenario: 정배열 (상승 추세)
    Given MA20이 $27.00이다
    And MA60이 $25.00이다
    When 정배열 지표를 계산한다
    Then 정배열 = ($27.00 - $25.00) / $25.00 × 100 = 8.00%이다
    And 양수 값은 상승 추세를 의미한다

  Scenario: 역배열 (하락 추세)
    Given MA20이 $23.00이다
    And MA60이 $25.00이다
    When 정배열 지표를 계산한다
    Then 정배열 = ($23.00 - $25.00) / $25.00 × 100 = -8.00%이다
    And 음수 값은 하락 추세를 의미한다

  Scenario: MA60이 없을 때
    Given MA20이 $27.00이다
    And MA60이 null이다 (60일 미만 데이터)
    When 정배열 지표를 계산한다
    Then 결과는 null이다
```

### 5.2 MA 기울기

#### TC-013: MA 기울기 계산

```gherkin
Feature: MA20 10일 기울기 계산
  현재 MA20과 10일 전 MA20의 변화율을 계산한다.

  Scenario: 상승 기울기
    Given 현재 MA20이 $27.00이다
    And 10일 전 MA20이 $25.00이다
    When MA 기울기를 계산한다
    Then 기울기 = ($27.00 - $25.00) / $25.00 × 100 = 8.00%이다

  Scenario: 하락 기울기
    Given 현재 MA20이 $23.00이다
    And 10일 전 MA20이 $25.00이다
    When MA 기울기를 계산한다
    Then 기울기 = ($23.00 - $25.00) / $25.00 × 100 = -8.00%이다

  Scenario: 30일 미만 데이터에서 기울기 계산 시도
    Given 29일간의 데이터만 있다 (MA20 + 10일 필요)
    When MA 기울기를 계산한다
    Then 결과는 null이다
```

### 5.3 이격도

#### TC-014: 이격도 계산

```gherkin
Feature: 이격도 계산
  현재 주가와 MA20의 비율을 계산한다.

  Scenario: 과매수 상태 (주가 > MA20)
    Given 현재 수정종가가 $27.50이다
    And MA20이 $25.00이다
    When 이격도를 계산한다
    Then 이격도 = $27.50 / $25.00 × 100 = 110.00%이다
    And 100% 초과는 과매수 가능성을 의미한다

  Scenario: 과매도 상태 (주가 < MA20)
    Given 현재 수정종가가 $22.50이다
    And MA20이 $25.00이다
    When 이격도를 계산한다
    Then 이격도 = $22.50 / $25.00 × 100 = 90.00%이다
    And 100% 미만은 과매도 가능성을 의미한다

  Scenario: MA20이 없을 때
    Given MA20이 null이다
    When 이격도를 계산한다
    Then 결과는 null이다
```

---

## 6. 종합 지표 테스트 시나리오

### 6.1 TechnicalMetrics 통합 계산

#### TC-015: 모든 지표 계산 성공

```gherkin
Feature: 종합 기술적 지표 계산
  6개 지표를 모두 계산하여 TechnicalMetrics 객체를 반환한다.

  Scenario: 충분한 데이터로 모든 지표 계산
    Given 100일간의 수정종가 데이터가 있다
    When calculateTechnicalMetrics를 호출한다
    Then TechnicalMetrics 객체가 반환된다
    And goldenCross 필드가 숫자이다
    And maSlope 필드가 숫자이다
    And disparity 필드가 숫자이다
    And rsi14 필드가 0-100 사이의 숫자이다
    And roc12 필드가 숫자이다
    And volatility20 필드가 양수이다
```

#### TC-016: 일부 지표 계산 불가

```gherkin
Feature: 데이터 부족 시 null 반환
  하나의 지표라도 계산 불가능하면 전체 null을 반환한다.

  Scenario: 59일 데이터 (MA60 계산 불가)
    Given 59일간의 수정종가 데이터가 있다
    When calculateTechnicalMetrics를 호출한다
    Then 결과는 null이다 (MA60, goldenCross 계산 불가)

  Scenario: 29일 데이터 (MA 기울기 계산 불가)
    Given 29일간의 수정종가 데이터가 있다
    When calculateTechnicalMetrics를 호출한다
    Then 결과는 null이다 (maSlope 계산 불가)
```

---

## 7. 통합 테스트 시나리오

### 7.1 DailySnapshot MA 포함

#### TC-017: 백테스트 실행 시 DailySnapshot에 MA 포함

```gherkin
Feature: DailySnapshot에 이동평균 포함
  백테스트 실행 시 각 DailySnapshot에 ma20, ma60이 포함된다.

  Scenario: 100일 백테스트 실행
    Given 티커가 "SOXL"이다
    And 100일간의 가격 데이터가 있다
    When 백테스트를 실행한다
    Then dailyHistory의 각 DailySnapshot에 ma20 필드가 있다
    And dailyHistory의 각 DailySnapshot에 ma60 필드가 있다
    And 처음 19일은 ma20이 null이다
    And 20일째부터 ma20이 숫자이다
    And 처음 59일은 ma60이 null이다
    And 60일째부터 ma60이 숫자이다
```

### 7.2 BacktestResult technicalMetrics 포함

#### TC-018: 백테스트 결과에 technicalMetrics 포함

```gherkin
Feature: BacktestResult에 기술적 지표 포함
  백테스트 종료 시 종료일 기준 기술적 지표가 포함된다.

  Scenario: 충분한 데이터로 백테스트 완료
    Given 티커가 "SOXL"이다
    And 100일간의 가격 데이터가 있다
    When 백테스트를 실행한다
    Then BacktestResult에 technicalMetrics 필드가 있다
    And technicalMetrics는 종료일 기준으로 계산된다
    And 6개 지표가 모두 포함된다

  Scenario: 데이터 부족으로 지표 계산 불가
    Given 티커가 "SOXL"이다
    And 30일간의 가격 데이터만 있다
    When 백테스트를 실행한다
    Then BacktestResult에 technicalMetrics가 null이다
```

---

## 8. 엣지 케이스 테스트

### 8.1 경계 조건

#### TC-019: 0으로 나누기 방지

```gherkin
Feature: Division by Zero 방지
  분모가 0인 경우 null을 반환한다.

  Scenario: MA60이 0일 때 정배열 계산
    Given MA20이 $25.00이다
    And MA60이 $0.00이다 (이론적 상황)
    When 정배열 지표를 계산한다
    Then 결과는 null이다 (0으로 나누기 방지)

  Scenario: 10일 전 MA20이 0일 때 기울기 계산
    Given 현재 MA20이 $25.00이다
    And 10일 전 MA20이 $0.00이다
    When MA 기울기를 계산한다
    Then 결과는 null이다
```

#### TC-020: 정확한 경계 인덱스

```gherkin
Feature: 정확한 경계 인덱스 처리
  필요한 최소 데이터가 정확히 있을 때 계산 성공.

  Scenario: 정확히 20일 데이터로 MA20 계산
    Given 정확히 20일간의 데이터가 있다 (인덱스 0-19)
    When 인덱스 19에서 MA20을 계산한다
    Then 결과는 유효한 MA20 값이다

  Scenario: 정확히 60일 데이터로 MA60 계산
    Given 정확히 60일간의 데이터가 있다 (인덱스 0-59)
    When 인덱스 59에서 MA60을 계산한다
    Then 결과는 유효한 MA60 값이다
```

---

## 9. 성능 테스트

### 9.1 응답 시간 검증

#### TC-021: 1년 데이터 백테스트 성능

```gherkin
Feature: 기술적 지표 포함 백테스트 성능
  기술적 지표 계산을 포함하여 5초 이내 완료.

  Scenario: 1년 백테스트 성능 검증
    Given 티커가 "SOXL"이다
    And 1년간 (약 252 거래일) 데이터가 있다
    When 백테스트를 실행하고 시간을 측정한다
    Then 실행 시간은 5초 이내이다
    And 모든 DailySnapshot에 ma20, ma60이 포함된다
    And BacktestResult에 technicalMetrics가 포함된다
```

---

## 10. 품질 게이트 (Definition of Done)

### 10.1 코드 품질

- [ ] 모든 TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 0개
- [ ] Prettier 포맷팅 적용
- [ ] JSDoc 주석 작성 (모든 public 함수)

### 10.2 테스트 커버리지

- [ ] 단위 테스트 커버리지 85% 이상
- [ ] 모든 EARS 요구사항에 대응하는 테스트 케이스 존재
- [ ] TC-001 ~ TC-021 모든 테스트 통과

### 10.3 기능 완성도

- [ ] TechnicalMetrics 인터페이스 정의 완료
- [ ] DailySnapshot에 ma20, ma60 필드 추가
- [ ] BacktestResult에 technicalMetrics 필드 추가
- [ ] 6개 지표 계산 함수 구현 완료
- [ ] null 처리 (데이터 부족, 0 나누기) 검증
- [ ] 기존 테스트 통과 확인

### 10.4 호환성

- [ ] 기존 API 응답 구조 유지 (필드 추가만)
- [ ] 기존 BacktestResult 소비자에 영향 없음
- [ ] 프론트엔드 연동 테스트 통과

### 10.5 성능

- [ ] 1년 데이터 백테스트 5초 이내 완료
- [ ] 메모리 사용량 합리적 수준 유지

---

## 11. 추적성 매트릭스

| 요구사항 ID | 테스트 케이스 | 검증 항목 |
|-------------|--------------|----------|
| REQ-001 | TC-017 | DailySnapshot MA 확장 |
| REQ-002, REQ-003 | TC-015, TC-016, TC-018 | TechnicalMetrics, BacktestResult 확장 |
| REQ-004 | TC-001, TC-002 | MA20 계산 |
| REQ-005 | TC-003, TC-004 | MA60 계산 |
| REQ-006 | TC-012 | 정배열 계산 |
| REQ-007 | TC-013 | MA 기울기 계산 |
| REQ-008 | TC-014 | 이격도 계산 |
| REQ-009 | TC-005, TC-006, TC-007 | RSI(14) 계산 |
| REQ-010 | TC-008, TC-009 | ROC(12) 계산 |
| REQ-011 | TC-010, TC-011 | 변동성 계산 |
| REQ-012 | TC-021 | 성능 요구사항 |
| REQ-013 | TC-001 ~ TC-014 | 정밀도 검증 |
| CON-001, CON-002 | TC-016, TC-019 | null 및 0 나누기 처리 |
| CON-003 | TC-017, TC-018 | 기존 호환성 |

---

## 12. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-17 | manager-spec | 초기 수용 기준 작성 |
