---
id: SPEC-FRONTEND-001
version: "1.0.0"
status: "draft"
created: "2026-01-16"
updated: "2026-01-16"
author: "허태명"
priority: "high"
---

# SPEC-FRONTEND-001: radar0458.pro 사이트 복제 - Phase 1 프론트엔드 UI

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0.0 | 2026-01-16 | 허태명 | 초기 SPEC 문서 생성 |

---

## 1. 개요

### 1.1 목적

radar0458.pro 사이트의 `/info` 및 `/backtest` 페이지를 Next.js 15 기반으로 동일하게 복제한다.

### 1.2 범위

**포함 (In Scope)**:
- `/info` 페이지 - 전략 설명 UI
- `/backtest` 페이지 - 백테스트 폼 UI
- 6개 공통 컴포넌트
- Bootswatch Solar 테마 적용
- 반응형 디자인

**제외 (Out of Scope)**:
- 사용자 인증/로그인 시스템 (Phase 2)
- 실제 백테스트 로직 및 API 연동 (Phase 2)
- 데이터베이스 연동 (Phase 2)
- 실시간 주가 데이터 (Phase 2)

### 1.3 기술 스택

| 항목 | 버전 | 비고 |
|------|------|------|
| Node.js | 22 LTS | 런타임 환경 |
| TypeScript | 5.x | 정적 타입 |
| Next.js | 15 (App Router) | 프레임워크 |
| React | 19 | UI 라이브러리 |
| Bootstrap | 5.3.3 | CSS 프레임워크 |
| Bootswatch Solar | 5.3.3 | 다크 테마 |
| Google Fonts | Noto Sans KR | 한글 폰트 |

---

## 2. EARS 형식 요구사항

### 2.1 Ubiquitous (항상 활성)

| ID | 요구사항 |
|----|----------|
| U-001 | 시스템은 **항상** Bootswatch Solar 테마의 색상 팔레트를 준수해야 한다 |
| U-002 | 시스템은 **항상** Noto Sans KR 폰트를 기본 서체로 사용해야 한다 |
| U-003 | 시스템은 **항상** TypeScript strict 모드에서 타입 오류 없이 컴파일되어야 한다 |
| U-004 | 시스템은 **항상** Next.js App Router 구조를 따라야 한다 |
| U-005 | 시스템은 **항상** 모든 페이지에서 공통 레이아웃(Header, Navigation, Sidebar)을 표시해야 한다 |

### 2.2 Event-Driven (이벤트 기반)

| ID | 요구사항 |
|----|----------|
| E-001 | **WHEN** 사용자가 `/` 경로로 접근하면 **THEN** `/info` 페이지로 리다이렉트해야 한다 |
| E-002 | **WHEN** 사용자가 네비게이션 메뉴 항목을 클릭하면 **THEN** 해당 페이지로 이동해야 한다 |
| E-003 | **WHEN** 사용자가 백테스트 폼을 제출하면 **THEN** 로딩 스피너를 표시해야 한다 |
| E-004 | **WHEN** 화면 너비가 1700px 미만이면 **THEN** 우측 사이드바를 숨겨야 한다 |
| E-005 | **WHEN** 화면 너비가 768px 미만이면 **THEN** 모바일 최적화 레이아웃을 표시해야 한다 |

### 2.3 State-Driven (상태 기반)

| ID | 요구사항 |
|----|----------|
| S-001 | **IF** 현재 페이지가 `/info`이면 **THEN** Info 메뉴 항목이 활성화 상태로 표시되어야 한다 |
| S-002 | **IF** 현재 페이지가 `/backtest`이면 **THEN** 백테스트(기본) 메뉴 항목이 활성화 상태로 표시되어야 한다 |
| S-003 | **IF** 백테스트 폼이 처리 중이면 **THEN** 제출 버튼이 비활성화되어야 한다 |
| S-004 | **IF** 주가가 상승했으면 **THEN** 가격이 `#ff5370` 색상으로 표시되어야 한다 |
| S-005 | **IF** 주가가 하락했으면 **THEN** 가격이 `#26c6da` 색상으로 표시되어야 한다 |

### 2.4 Unwanted (금지 사항)

| ID | 요구사항 |
|----|----------|
| N-001 | 시스템은 Phase 1에서 실제 API 호출을 **수행하지 않아야 한다** |
| N-002 | 시스템은 사용자 인증 로직을 **포함하지 않아야 한다** |
| N-003 | 시스템은 데이터베이스 연결을 **포함하지 않아야 한다** |
| N-004 | 시스템은 Pages Router를 **사용하지 않아야 한다** (App Router 전용) |
| N-005 | 시스템은 원본 사이트와 다른 색상 팔레트를 **사용하지 않아야 한다** |

### 2.5 Optional (선택 사항)

| ID | 요구사항 |
|----|----------|
| O-001 | **가능하면** 프리미엄 모달 컴포넌트를 구현해야 한다 |
| O-002 | **가능하면** 로딩 스피너에 CSS 애니메이션을 적용해야 한다 |
| O-003 | **가능하면** 768px 이하에서 모바일 최적화 레이아웃을 제공해야 한다 |
| O-004 | **가능하면** 다크 모드 토글 기능을 추가해야 한다 |

---

## 3. 컴포넌트 명세

### 3.1 페이지 컴포넌트

#### 3.1.1 Info 페이지 (`/info/page.tsx`)

**구조**:
```
┌─────────────────────────────────────────────────────────┐
│ [상단 컨트롤 바]                                          │
├─────────────────────────────────────────────────────────┤
│ [메인 네비게이션]                                         │
├─────────────────────────────────────────────────────────┤
│ [콘텐츠 영역]                              [사이드바]     │
│                                                         │
│ ## ℹ️ 떨사오팔 Pro 레이더 Info              📅 최근 주가  │
│ #### 📡 떨사오팔 Pro 레이더는?                           │
│ #### 🤔 떨사오팔이란?                                    │
│ #### ⚙️ Pro1 / Pro2 / Pro3 전략이란?                    │
│ [전략 카드 3열 레이아웃]                                  │
│ #### 📐 떨사오팔Pro vs 원론 차이점                       │
│ [플로우차트 - 5단계]                                     │
│ [면책 조항]                                              │
│ [문의 섹션]                                              │
└─────────────────────────────────────────────────────────┘
```

#### 3.1.2 Backtest 페이지 (`/backtest/page.tsx`)

**구조**:
```
┌─────────────────────────────────────────────────────────┐
│ [상단 컨트롤 바]                                          │
├─────────────────────────────────────────────────────────┤
│ [메인 네비게이션]                                         │
├─────────────────────────────────────────────────────────┤
│ [백테스트 폼]                              [사이드바]     │
│ ┌──────────────────────────────────────┐                │
│ │시작일 │종료일 │종목선택│Pro/Custom│실행│                │
│ └──────────────────────────────────────┘                │
│ [로딩 스피너 영역 - 초기 숨김]                            │
│ [결과 영역 - 폼 제출 후 표시]                             │
└─────────────────────────────────────────────────────────┘
```

### 3.2 공통 컴포넌트

| 컴포넌트 | 파일명 | 용도 |
|----------|--------|------|
| TopControlBar | `TopControlBar.tsx` | 상단 사용자 네비게이션 (제품군 드롭다운, 사용자명, 메뉴 버튼) |
| MainNavigation | `MainNavigation.tsx` | 메인 메뉴 (로고 + 7개 메뉴 링크) |
| Sidebar | `Sidebar.tsx` | 우측 최근 주가 패널 (고정 위치, 반응형 숨김) |
| StrategyCard | `StrategyCard.tsx` | Pro1/Pro2/Pro3 전략 카드 (분할 비율, 설정값) |
| FlowChart | `FlowChart.tsx` | 사용법 5단계 플로우차트 (가로 배치, 화살표) |
| PremiumModal | `PremiumModal.tsx` | 프리미엄 기능 안내 모달 (Bootstrap Modal) |

---

## 4. 디자인 시스템

### 4.1 색상 팔레트 (Bootswatch Solar)

```css
/* 배경 색상 */
--bs-body-bg: #002b36;           /* 메인 배경 (어두운 청록) */
--bs-dark: #073642;               /* 카드 배경 */
--bs-secondary: #839496;          /* 보조 배경 */

/* 텍스트 색상 */
--bs-body-color: #839496;         /* 기본 텍스트 */
--bs-light: #fdf6e3;              /* 밝은 텍스트 */
--bs-info: #2aa198;               /* 강조 텍스트 (청록) */

/* 커스텀 색상 */
--price-up: #ff5370;              /* 상승 (빨강) */
--price-down: #26c6da;            /* 하락 (청록) */

/* 버튼 색상 */
--btn-info: #2aa198;              /* 주요 버튼 */
--btn-success: #859900;           /* 성공 버튼 */
--btn-outline-light: #fdf6e3;     /* 아웃라인 버튼 */
```

### 4.2 타이포그래피

```css
/* 기본 폰트 */
font-family: 'Noto Sans KR', sans-serif;

/* 제목 스타일 */
h2 { font-weight: bold; color: white; }
h4.text-info { font-weight: bold; color: #2aa198; }

/* 본문 스타일 */
body { font-size: 1rem; line-height: 1.5; }
.small { font-size: 0.9rem; }
```

### 4.3 레이아웃 규격

```css
/* 컨테이너 */
.container { padding: 1.5rem; }

/* 사이드바 */
#fixedSidebar {
  position: fixed;
  right: 20px;
  top: 120px;
  width: 220px;
  background: #1b1b1b;
}

/* 반응형 브레이크포인트 */
@media (max-width: 768px) {
  #fixedSidebar { display: none; }
}
@media (max-width: 1700px) {
  #fixedSidebar { display: none; }
}
```

---

## 5. 외부 의존성

### 5.1 CDN 링크

```html
<!-- Bootstrap + Bootswatch Solar 테마 -->
<link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/solar/bootstrap.min.css" rel="stylesheet">

<!-- Google Fonts - Noto Sans KR -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap" rel="stylesheet">

<!-- Bootstrap Bundle JS (Popper 포함) -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
```

### 5.2 npm 패키지

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

---

## 6. 파일 구조

```
src/
├── app/
│   ├── layout.tsx           # 루트 레이아웃 (메타데이터, CDN, 공통 구조)
│   ├── page.tsx             # 홈페이지 (/ → /info 리다이렉트)
│   ├── info/
│   │   └── page.tsx         # Info 페이지
│   └── backtest/
│       └── page.tsx         # Backtest 페이지
├── components/
│   ├── TopControlBar.tsx    # 상단 컨트롤 바
│   ├── MainNavigation.tsx   # 메인 네비게이션
│   ├── Sidebar.tsx          # 우측 사이드바 (최근 주가)
│   ├── StrategyCard.tsx     # 전략 카드 (Pro1/Pro2/Pro3)
│   ├── FlowChart.tsx        # 사용법 플로우차트
│   └── PremiumModal.tsx     # 프리미엄 모달
└── styles/
    └── globals.css          # 글로벌 스타일 + 커스텀 CSS
```

---

## 7. 참고 자료

### 7.1 원본 사이트

- URL: radar0458.pro
- 분석 페이지: `/info`, `/backtest`

### 7.2 관련 문서

- [Phase 1 사이트 복제 계획서](../../../docs/phase1-site-replication-plan.md)
- [프로젝트 기술 스택](../../project/tech.md)
- [프로젝트 구조](../../project/structure.md)

---

*이 SPEC 문서는 MoAI-ADK EARS 형식을 따릅니다.*
