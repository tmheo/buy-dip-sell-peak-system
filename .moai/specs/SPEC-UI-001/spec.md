---
id: SPEC-UI-001
version: "1.0.0"
status: completed
created: "2026-02-06"
updated: "2026-02-06"
completed: "2026-02-06"
author: MoAI
priority: high
lifecycle_level: spec-first
---

## HISTORY

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0.0 | 2026-02-06 | 최초 작성 |

---

# SPEC-UI-001: 전체 웹페이지 모바일 반응형 개선

## 1. 개요

떨사오팔 Pro 레이더 웹 애플리케이션의 전체 페이지를 모바일 환경(375px~768px)에서 정상적으로 사용할 수 있도록 반응형 레이아웃을 개선한다.

### 1.1 배경

현재 애플리케이션은 Desktop-first 접근으로 개발되어 있으며, 768px와 1700px 브레이크포인트에서 일부 반응형 처리가 되어 있으나 모바일 환경에서의 사용성이 부족하다.

### 1.2 기술 스택

- Next.js 15.1.0 (App Router)
- Bootstrap 5.3.3 (Bootswatch Solar theme, CDN)
- Recharts 3.6.0
- Custom CSS (globals.css)

---

## 2. 요구사항 (EARS 형식)

### REQ-01: TopControlBar 모바일 대응 (Ubiquitous)

시스템은 모바일 화면(768px 이하)에서 TopControlBar의 사용자 정보와 버튼들이 **줄바꿈 또는 compact 레이아웃**으로 표시되어야 한다.

**세부 요구사항:**
- 사용자명은 모바일에서 숨기거나 축약 표시
- Trading, My Page 버튼은 아이콘만 표시하거나 줄바꿈 허용
- 로그인/로그아웃 버튼은 항상 접근 가능

### REQ-02: 인라인 폼 모바일 스택 레이아웃 (Ubiquitous)

시스템은 모바일 화면에서 페이지 헤더의 인라인 폼(추천전략, 백테스트 기본, 백테스트 추천전략)이 **수직 스택 레이아웃**으로 전환되어야 한다.

**세부 요구사항:**
- h1 제목과 폼이 수직으로 분리
- 폼 입력 필드가 전체 너비(100%)로 확장
- 고정 너비(style={{ width: "140px" }}) 제거, 모바일에서 유연한 너비 적용
- 실행 버튼은 전체 너비로 표시

**대상 페이지:**
- `src/app/recommend/_client.tsx`
- `src/app/backtest/_client.tsx`
- `src/app/backtest-recommend/_client.tsx`

### REQ-03: 트레이딩 계좌 목록 모바일 카드 뷰 (Ubiquitous)

시스템은 모바일 화면에서 계좌 목록 테이블 대신 **카드 형태의 리스트**를 표시해야 한다.

**세부 요구사항:**
- 768px 이하에서 테이블 숨기고 카드 뷰 표시
- 카드에 핵심 정보 표시: 계좌 이름, 종목, 전략, 시드, 보유 상태
- "자세히", "삭제" 버튼 접근 가능
- 기존 `trading-mobile-card` / `trading-desktop-table` CSS 패턴 재사용

### REQ-04: 보유현황 테이블 모바일 카드 뷰 (Ubiquitous)

시스템은 모바일 화면에서 9컬럼 보유현황 테이블 대신 **티어별 카드 형태**로 표시해야 한다.

**세부 요구사항:**
- 768px 이하에서 테이블 숨기고 카드 뷰 표시
- 각 티어 카드에 핵심 정보 표시: 티어 번호, 비율, 매수가, 수량, 보유기간
- 보유 중인 티어는 시각적으로 강조

### REQ-05: 수익현황 모바일 최적화 (Ubiquitous)

시스템은 모바일 화면에서 수익현황 테이블과 총계 카드가 **가독성 있게** 표시되어야 한다.

**세부 요구사항:**
- 11컬럼 상세 테이블은 모바일에서 핵심 컬럼(전략, 매도일, 수익, 수익률)만 표시하거나 가로 스크롤 가이드 제공
- GrandTotalCard의 5개 col을 모바일에서 2~3열 그리드로 변경
- 소계 행의 가독성 유지

### REQ-06: 터치 타겟 크기 확보 (Ubiquitous)

시스템은 모바일 환경에서 모든 인터랙티브 요소의 **최소 터치 영역이 44x44px** 이상이어야 한다.

**세부 요구사항:**
- btn-sm 버튼은 모바일에서 패딩 증가
- 작은 badge 클릭 요소 영역 확대
- 라디오 버튼, 체크박스의 터치 영역 확보

### REQ-07: SimilarPeriodCard 텍스트 overflow 방지 (Event-driven)

**시스템이** 모바일 화면에서 SimilarPeriodCard의 날짜 범위 텍스트를 표시할 때, 텍스트가 **컨테이너를 초과하지 않고** 줄바꿈 또는 축약 표시되어야 한다.

---

## 3. 범위

### 3.1 포함 범위

- 7개 페이지 모바일 레이아웃 개선
- globals.css 미디어 쿼리 추가
- 컴포넌트별 모바일 카드 뷰 추가 (3개 테이블)
- 인라인 폼 반응형 전환 (3개 페이지)
- TopControlBar 반응형 개선

### 3.2 제외 범위

- 태블릿(769px~1024px) 전용 레이아웃
- 기존 Desktop 레이아웃 변경
- 새로운 CSS 프레임워크 도입
- PWA 또는 모바일 앱 전환
- 차트 라이브러리 변경 (Recharts ResponsiveContainer가 이미 반응형)

---

## 4. 기술적 제약 조건

- Bootstrap 5 클래스와 기존 CSS 패턴을 최대한 활용
- CSS-first 접근: 가능하면 CSS 미디어 쿼리로 해결
- 기존 `trading-mobile-card` / `trading-desktop-table` 패턴 재사용
- Desktop 레이아웃에 영향 없어야 함
- 새로운 의존성 추가 금지

---

## 5. 수정 대상 파일

| # | 파일 경로 | 수정 내용 | 관련 REQ |
|---|----------|----------|---------|
| 1 | `src/styles/globals.css` | 모바일 미디어 쿼리 대폭 추가 | 전체 |
| 2 | `src/components/TopControlBar.tsx` | 모바일 compact 레이아웃 | REQ-01 |
| 3 | `src/app/recommend/_client.tsx` | 인라인 폼 모바일 스택 | REQ-02 |
| 4 | `src/app/backtest/_client.tsx` | 인라인 폼 모바일 스택 | REQ-02 |
| 5 | `src/app/backtest-recommend/_client.tsx` | 인라인 폼 모바일 스택 | REQ-02 |
| 6 | `src/components/trading/AccountListTable.tsx` | 모바일 카드 뷰 추가 | REQ-03 |
| 7 | `src/components/trading/TierHoldingsTable.tsx` | 모바일 카드 뷰 추가 | REQ-04 |
| 8 | `src/components/trading/ProfitStatusTable.tsx` | 모바일 최적화 | REQ-05 |
| 9 | `src/components/recommend/SimilarPeriodCard.tsx` | 날짜 overflow 처리 | REQ-07 |

---

## 6. 구현 노트 (Implementation Notes)

### 구현 일자: 2026-02-06

### 구현 결과

| 항목 | 결과 |
|------|------|
| 변경 파일 수 | 9개 (계획 대비 100% 일치) |
| 코드 변경량 | +375 / -153 |
| CSS 추가량 | 125줄 (기존 383줄의 32.6%, 50% 제한 내) |
| TypeScript 에러 | 0 |
| ESLint 에러 | 0 |
| 새 의존성 | 없음 |

### REQ별 구현 상태

| REQ | 구현 방법 | 상태 |
|-----|----------|------|
| REQ-01 | Bootstrap `d-none d-md-inline`, `flex-wrap` 클래스 적용 | 완료 |
| REQ-02 | 인라인 스타일 제거, CSS 클래스(form-input-*) + 미디어 쿼리 flex-column | 완료 |
| REQ-03 | `trading-mobile-card` 패턴으로 계좌 카드 뷰 추가 | 완료 |
| REQ-04 | 티어별 카드 뷰 추가, 보유 중 티어 `border-success` 강조 | 완료 |
| REQ-05 | GrandTotalCard `col` → `col-4 col-md` (모바일 3+2 레이아웃) | 완료 |
| REQ-06 | `btn-sm`, `form-control-sm` 최소 44px 높이, 터치 패딩 확대 | 완료 |
| REQ-07 | `text-break` 클래스 + CSS word-break, 폰트 축소 | 완료 |

### 계획 대비 차이점

- 계획과 100% 일치. 추가 기능, 범위 변경, 미구현 항목 없음.
- CSS 추가량은 예상(~150줄)보다 적은 125줄로 효율적 구현.
