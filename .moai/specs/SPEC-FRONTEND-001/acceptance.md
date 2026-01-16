---
id: SPEC-FRONTEND-001
version: "1.1.0"
status: "in_progress"
created: "2026-01-16"
updated: "2026-01-16"
author: "허태명"
---

# Acceptance Criteria: SPEC-FRONTEND-001

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0.0 | 2026-01-16 | 허태명 | 초기 수락 기준 문서 생성 |
| 1.1.0 | 2026-01-16 | 허태명 | Phase 1 UI 구현 완료, 회귀 테스트 체크리스트 업데이트 |

---

## 1. 테스트 시나리오 개요

| 시나리오 ID | 분류 | 설명 | 우선순위 |
|-------------|------|------|----------|
| AC-001 | 기능 | Info 페이지 렌더링 | Critical |
| AC-002 | 기능 | Backtest 폼 UI | Critical |
| AC-003 | 반응형 | 사이드바 반응형 동작 | High |
| AC-004 | 디자인 | 색상 스키마 일치 | High |
| AC-005 | 네비게이션 | 페이지 라우팅 | High |
| AC-006 | 네비게이션 | 메뉴 활성화 상태 | Medium |
| AC-007 | 컴포넌트 | 전략 카드 렌더링 | Medium |
| AC-008 | 컴포넌트 | 플로우차트 렌더링 | Medium |
| AC-009 | 폼 | 폼 필드 기본값 | Medium |
| AC-010 | 폼 | 로딩 스피너 표시 | Low |

---

## 2. 상세 테스트 시나리오

### AC-001: Info 페이지 렌더링

**우선순위**: Critical

```gherkin
Feature: Info 페이지 렌더링
  사용자가 떨사오팔 Pro 전략 정보를 확인할 수 있다

  Scenario: Info 페이지 기본 렌더링
    Given 사용자가 브라우저를 열고
    When /info 경로로 접근하면
    Then "떨사오팔 Pro 레이더 Info" 제목이 표시되고
    And "떨사오팔 Pro 레이더는?" 섹션이 표시되고
    And "떨사오팔이란?" 섹션이 표시되고
    And "Pro1 / Pro2 / Pro3 전략이란?" 섹션이 표시되고
    And "떨사오팔Pro vs 원론 차이점" 섹션이 표시되고
    And "사용법 플로우차트" 섹션이 표시된다

  Scenario: Info 페이지 전략 카드 표시
    Given 사용자가 /info 페이지에 있고
    When 전략 섹션으로 스크롤하면
    Then Pro1 전략 카드가 표시되고
    And Pro2 전략 카드가 표시되고
    And Pro3 전략 카드가 표시되고
    And 세 카드가 가로로 나란히 배치된다

  Scenario: Info 페이지 플로우차트 표시
    Given 사용자가 /info 페이지에 있고
    When 사용법 섹션으로 스크롤하면
    Then 5개의 단계 박스가 표시되고
    And 각 단계 사이에 화살표가 표시되고
    And 단계가 가로로 배치된다
```

---

### AC-002: Backtest 폼 UI

**우선순위**: Critical

```gherkin
Feature: Backtest 폼 UI
  사용자가 백테스트 파라미터를 입력할 수 있다

  Scenario: Backtest 폼 필드 존재 확인
    Given 사용자가 /backtest 페이지에 있고
    When 백테스트 폼을 확인하면
    Then 시작일 입력 필드가 존재하고
    And 종료일 입력 필드가 존재하고
    And 종목 선택 드롭다운이 존재하고
    And Pro/Custom 선택 드롭다운이 존재하고
    And "백테스트 실행" 버튼이 존재한다

  Scenario: Backtest 종목 선택 옵션
    Given 사용자가 /backtest 페이지에 있고
    When 종목 선택 드롭다운을 클릭하면
    Then SOXL 옵션이 존재하고
    And TQQQ 옵션이 존재하고
    And BITU 옵션이 존재하고
    And TECL 옵션이 존재하고
    And SOXL이 기본 선택되어 있다

  Scenario: Backtest Pro/Custom 선택 옵션
    Given 사용자가 /backtest 페이지에 있고
    When Pro/Custom 드롭다운을 클릭하면
    Then Pro 옵션이 존재하고
    And Custom 옵션이 존재하고
    And Pro가 기본 선택되어 있다
```

---

### AC-003: 사이드바 반응형 동작

**우선순위**: High

```gherkin
Feature: 사이드바 반응형 동작
  화면 크기에 따라 사이드바가 적절히 표시된다

  Scenario: 넓은 화면에서 사이드바 표시
    Given 사용자가 1920px 너비의 화면에서
    When /info 또는 /backtest 페이지를 보면
    Then 우측 사이드바가 표시되고
    And "최근 주가 (SOXL)" 제목이 표시되고
    And 주가 테이블이 표시된다

  Scenario: 중간 화면에서 사이드바 숨김
    Given 사용자가 1920px 너비의 화면에서 페이지를 보고
    When 화면 너비를 1600px로 줄이면
    Then 우측 사이드바가 숨겨지고
    And 메인 콘텐츠가 전체 너비를 차지한다

  Scenario: 모바일 화면에서 사이드바 숨김
    Given 사용자가 768px 너비의 모바일 화면에서
    When /info 또는 /backtest 페이지를 보면
    Then 우측 사이드바가 숨겨지고
    And 메인 콘텐츠가 전체 너비를 차지한다
```

---

### AC-004: 색상 스키마 일치

**우선순위**: High

```gherkin
Feature: 색상 스키마 일치
  페이지가 Bootswatch Solar 테마 색상을 사용한다

  Scenario: 배경 색상 확인
    Given 사용자가 /info 또는 /backtest 페이지에 있고
    When 페이지의 배경색을 확인하면
    Then body 배경색이 #002b36 (어두운 청록)이다

  Scenario: 강조 색상 확인
    Given 사용자가 /info 페이지에 있고
    When Info 관련 텍스트 색상을 확인하면
    Then 강조 텍스트 색상이 #2aa198 (청록)이다

  Scenario: 가격 상승/하락 색상 확인
    Given 사용자가 사이드바의 주가 데이터를 보고
    When 상승한 주가를 확인하면
    Then 상승 가격이 #ff5370 (빨강) 색상이고
    When 하락한 주가를 확인하면
    Then 하락 가격이 #26c6da (밝은 청록) 색상이다

  Scenario: 버튼 색상 확인
    Given 사용자가 /backtest 페이지에 있고
    When 백테스트 실행 버튼을 확인하면
    Then 버튼 배경색이 #859900 (녹색, btn-success)이다
```

---

### AC-005: 페이지 라우팅

**우선순위**: High

```gherkin
Feature: 페이지 라우팅
  사용자가 페이지 간 네비게이션을 할 수 있다

  Scenario: 홈페이지 리다이렉트
    Given 사용자가 브라우저를 열고
    When / 경로로 접근하면
    Then /info 페이지로 리다이렉트된다

  Scenario: Info 페이지 직접 접근
    Given 사용자가 브라우저를 열고
    When /info 경로로 접근하면
    Then Info 페이지가 정상 로드된다

  Scenario: Backtest 페이지 직접 접근
    Given 사용자가 브라우저를 열고
    When /backtest 경로로 접근하면
    Then Backtest 페이지가 정상 로드된다

  Scenario: 네비게이션 메뉴 클릭
    Given 사용자가 /info 페이지에 있고
    When 네비게이션에서 "백테스트(기본)" 링크를 클릭하면
    Then /backtest 페이지로 이동한다
```

---

### AC-006: 메뉴 활성화 상태

**우선순위**: Medium

```gherkin
Feature: 메뉴 활성화 상태
  현재 페이지에 해당하는 메뉴가 활성화 표시된다

  Scenario: Info 페이지 메뉴 활성화
    Given 사용자가 /info 페이지에 있고
    When 네비게이션 메뉴를 확인하면
    Then "Info" 메뉴 항목이 활성화 상태로 표시되고
    And 다른 메뉴 항목은 비활성화 상태이다

  Scenario: Backtest 페이지 메뉴 활성화
    Given 사용자가 /backtest 페이지에 있고
    When 네비게이션 메뉴를 확인하면
    Then "백테스트(기본)" 메뉴 항목이 활성화 상태로 표시되고
    And 다른 메뉴 항목은 비활성화 상태이다
```

---

### AC-007: 전략 카드 렌더링

**우선순위**: Medium

```gherkin
Feature: 전략 카드 렌더링
  Pro1/Pro2/Pro3 전략 카드가 올바르게 표시된다

  Scenario: Pro1 카드 내용 확인
    Given 사용자가 /info 페이지의 전략 섹션에 있고
    When Pro1 카드를 확인하면
    Then 카드 헤더에 "Pro1"이 표시되고
    And 분할 비율 정보가 표시되고
    And 설정값 그리드가 2열로 표시된다

  Scenario: 카드 3열 레이아웃
    Given 사용자가 1200px 이상 너비의 화면에서
    When /info 페이지의 전략 섹션을 보면
    Then Pro1, Pro2, Pro3 카드가 가로로 3열 배치된다

  Scenario: 카드 모바일 레이아웃
    Given 사용자가 768px 미만 너비의 화면에서
    When /info 페이지의 전략 섹션을 보면
    Then 카드가 세로로 1열 배치된다
```

---

### AC-008: 플로우차트 렌더링

**우선순위**: Medium

```gherkin
Feature: 플로우차트 렌더링
  사용법 5단계 플로우차트가 올바르게 표시된다

  Scenario: 플로우차트 5단계 표시
    Given 사용자가 /info 페이지의 사용법 섹션에 있고
    When 플로우차트를 확인하면
    Then "① 추천 전략 확인" 박스가 표시되고
    And "② 매수 시작" 박스가 표시되고
    And "③ 레이더 모니터링" 박스가 표시되고
    And "④ 매도 결정" 박스가 표시되고
    And "⑤ 사이클 종료" 박스가 표시된다

  Scenario: 플로우차트 화살표 연결
    Given 사용자가 /info 페이지의 플로우차트를 보고
    When 각 단계 사이를 확인하면
    Then 1단계와 2단계 사이에 화살표가 표시되고
    And 모든 연속 단계 사이에 화살표가 표시된다
```

---

### AC-009: 폼 필드 기본값

**우선순위**: Medium

```gherkin
Feature: 폼 필드 기본값
  Backtest 폼 필드에 적절한 기본값이 설정된다

  Scenario: 시작일 기본값
    Given 사용자가 /backtest 페이지에 있고
    When 시작일 필드를 확인하면
    Then 기본값이 "2025-01-01"이다

  Scenario: 종료일 기본값
    Given 사용자가 /backtest 페이지에 있고
    When 종료일 필드를 확인하면
    Then 기본값이 오늘 날짜이다

  Scenario: 종목 선택 기본값
    Given 사용자가 /backtest 페이지에 있고
    When 종목 선택 드롭다운을 확인하면
    Then SOXL이 기본 선택되어 있다

  Scenario: Mode 선택 기본값
    Given 사용자가 /backtest 페이지에 있고
    When Pro/Custom 드롭다운을 확인하면
    Then Pro가 기본 선택되어 있다
```

---

### AC-010: 로딩 스피너 표시

**우선순위**: Low

```gherkin
Feature: 로딩 스피너 표시
  폼 제출 시 로딩 상태가 표시된다

  Scenario: 초기 상태 스피너 숨김
    Given 사용자가 /backtest 페이지에 있고
    When 페이지가 처음 로드되면
    Then 로딩 스피너가 숨겨져 있다

  Scenario: 폼 제출 시 스피너 표시
    Given 사용자가 /backtest 페이지에서 폼을 작성하고
    When 백테스트 실행 버튼을 클릭하면
    Then 로딩 스피너가 표시되고
    And "처리 중..." 텍스트가 표시된다

  Scenario: 폼 제출 시 버튼 비활성화
    Given 사용자가 /backtest 페이지에서 폼을 제출하고
    When 로딩 스피너가 표시되면
    Then 백테스트 실행 버튼이 비활성화된다
```

---

## 3. 품질 게이트 기준

### 3.1 기능 테스트

| 기준 | 목표 | 필수 여부 |
|------|------|----------|
| Critical 시나리오 통과율 | 100% | 필수 |
| High 시나리오 통과율 | 100% | 필수 |
| Medium 시나리오 통과율 | 90% 이상 | 권장 |
| Low 시나리오 통과율 | 80% 이상 | 선택 |

### 3.2 성능 기준

| 기준 | 목표 | 측정 방법 |
|------|------|----------|
| 초기 로딩 시간 | 3초 이내 | Lighthouse |
| First Contentful Paint | 1.8초 이내 | Lighthouse |
| Largest Contentful Paint | 2.5초 이내 | Lighthouse |
| Cumulative Layout Shift | 0.1 이하 | Lighthouse |

### 3.3 접근성 기준

| 기준 | 목표 |
|------|------|
| 키보드 네비게이션 | 모든 인터랙티브 요소 접근 가능 |
| 스크린 리더 호환성 | 주요 콘텐츠 읽기 가능 |
| 색상 대비 | WCAG AA 기준 충족 |

---

## 4. 테스트 환경

### 4.1 브라우저 호환성

| 브라우저 | 버전 | 지원 수준 |
|----------|------|----------|
| Chrome | 최신 | 완전 지원 |
| Firefox | 최신 | 완전 지원 |
| Safari | 최신 | 완전 지원 |
| Edge | 최신 | 완전 지원 |

### 4.2 디바이스 테스트

| 디바이스 | 해상도 | 테스트 항목 |
|----------|--------|------------|
| Desktop (Large) | 1920x1080 | 전체 기능 |
| Desktop (Medium) | 1440x900 | 사이드바 표시 |
| Tablet | 1024x768 | 반응형 레이아웃 |
| Mobile | 375x667 | 모바일 레이아웃 |

---

## 5. 회귀 테스트 체크리스트

구현 완료 후 최종 검증:

- [x] AC-001: Info 페이지 모든 섹션 렌더링
- [x] AC-002: Backtest 폼 모든 필드 작동
- [x] AC-003: 1700px, 768px 브레이크포인트 동작
- [x] AC-004: 색상 팔레트 일치 (배경, 강조, 가격)
- [x] AC-005: 라우팅 정상 작동 (/, /info, /backtest)
- [x] AC-006: 메뉴 활성화 상태 표시
- [x] AC-007: 전략 카드 3열/1열 레이아웃
- [x] AC-008: 플로우차트 5단계 + 화살표
- [x] AC-009: 폼 기본값 설정
- [x] AC-010: 로딩 스피너 동작

---

*이 수락 기준 문서는 SPEC-FRONTEND-001을 기반으로 작성되었습니다.*
