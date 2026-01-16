# Phase 1: radar0458.pro 사이트 복제 계획서

> 작성일: 2026-01-16
> 대상 페이지: `/info`, `/backtest`

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택 분석](#2-기술-스택-분석)
3. [디자인 시스템](#3-디자인-시스템)
4. [페이지별 구조 분석](#4-페이지별-구조-분석)
5. [공통 컴포넌트](#5-공통-컴포넌트)
6. [구현 계획](#6-구현-계획)
7. [파일 구조](#7-파일-구조)
8. [외부 의존성](#8-외부-의존성)

---

## 1. 프로젝트 개요

### 목표
radar0458.pro 사이트의 `/info`와 `/backtest` 페이지를 동일하게 복제

### 범위 (Phase 1)
- ✅ `/info` 페이지 - 전략 설명 페이지
- ✅ `/backtest` 페이지 - 백테스트 폼 UI
- ❌ 로그인/인증 시스템 (Phase 2)
- ❌ 실제 백테스트 로직 (Phase 2)
- ❌ 데이터베이스 연동 (Phase 2)

---

## 2. 기술 스택 분석

### 원본 사이트 기술 스택 (추정)
| 항목 | 기술 |
|------|------|
| 백엔드 | Python 기반 (Flask/Django 추정) |
| 템플릿 엔진 | Jinja2 스타일 |
| CSS 프레임워크 | Bootstrap 5.3.3 |
| CSS 테마 | Bootswatch Solar |
| 폰트 | Google Fonts - Noto Sans KR |
| 아이콘 | 이모지 기반 |

### 복제 기술 스택 (확정)
| 항목 | 기술 |
|------|------|
| 런타임 | Node.js 22 LTS |
| 언어 | TypeScript 5.x |
| 프레임워크 | Next.js 15 (App Router) |
| CSS | Bootstrap 5.3.3 + Bootswatch Solar |
| 폰트 | Google Fonts - Noto Sans KR |
| 패키지 매니저 | pnpm (권장) 또는 npm |

---

## 3. 디자인 시스템

### 색상 팔레트 (Bootswatch Solar 기반)

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

### 타이포그래피

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

### 레이아웃 규격

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

## 4. 페이지별 구조 분석

### 4.1 `/info` 페이지

#### 페이지 목적
떨사오팔 Pro 전략에 대한 상세 설명 제공

#### 섹션 구조

```
┌─────────────────────────────────────────────────────────┐
│ [상단 컨트롤 바]                                          │
│  - 좌: 떨사오팔 Pro (드롭다운 버튼, disabled)              │
│  - 우: 👤 사용자명 | 📋 트레이딩 | 🔧 My Custom | My Page │
├─────────────────────────────────────────────────────────┤
│ [메인 네비게이션]                                         │
│  🛰️ 떨사오팔 Pro 레이더 | Info | 추천전략 | 통계 |       │
│                          백테스트(기본) | 백테스트(추천) | │
│                          Update Note                    │
├─────────────────────────────────────────────────────────┤
│ [콘텐츠 영역]                              [사이드바]     │
│                                                         │
│ ## ℹ️ 떨사오팔 Pro 레이더 Info              📅 최근 주가  │
│                                            (SOXL)       │
│ #### 📡 떨사오팔 Pro 레이더는?              ┌─────────┐  │
│ 설명 텍스트...                              │날짜│종가│  │
│                                            ├─────────┤  │
│ #### 🤔 떨사오팔이란?                       │...│...│   │
│ • 리스트 항목들...                          └─────────┘  │
│                                                         │
│ #### ⚙️ Pro1 / Pro2 / Pro3 전략이란?                    │
│ ┌─────────┬─────────┬─────────┐                        │
│ │  Pro1   │  Pro2   │  Pro3   │  ← 3열 카드 레이아웃    │
│ │ 분할비율 │ 분할비율 │ 분할비율 │                        │
│ │ 설정값들 │ 설정값들 │ 설정값들 │                        │
│ └─────────┴─────────┴─────────┘                        │
│                                                         │
│ #### 📐 떨사오팔Pro vs 원론 차이점                       │
│ • 차이점 리스트...                                       │
│                                                         │
│ [📙 사용법 플로우차트 - 5단계]                           │
│ ①→②→③→④→⑤                                          │
│                                                         │
│ [면책 조항]                                              │
│ [문의 섹션]                                              │
└─────────────────────────────────────────────────────────┘
```

#### 주요 컴포넌트

1. **전략 카드 (Pro1/Pro2/Pro3)**
```html
<div class="card bg-light text-dark h-100">
  <div class="card-header fw-bold">Pro1</div>
  <div class="card-body">
    <p><strong>분할 비율</strong> 5.0% / 10.0% / ... / 예비티어</p>
    <div class="row row-cols-2 g-2">
      <div class="col">
        <div class="border rounded p-1 text-center small bg-opacity-50 bg-white">
          6분할 10일 손절
        </div>
      </div>
      <!-- 추가 설정값들 -->
    </div>
  </div>
</div>
```

2. **플로우차트 (사용법 안내)**
```html
<div class="d-flex justify-content-center align-items-center flex-wrap gap-2">
  <div class="card text-center bg-light text-dark flow-box-horizontal">
    <strong>① 추천 전략 확인</strong><br>
    <span class="small">(새 사이클 시작 시)</span>
  </div>
  <div class="arrow-right"></div>
  <!-- 반복 -->
</div>
```

### 4.2 `/backtest` 페이지

#### 페이지 목적
백테스트 실행을 위한 입력 폼 제공

#### 섹션 구조

```
┌─────────────────────────────────────────────────────────┐
│ [상단 컨트롤 바] - 공통                                   │
├─────────────────────────────────────────────────────────┤
│ [메인 네비게이션] - 공통 (백테스트(기본) 활성화)           │
├─────────────────────────────────────────────────────────┤
│ [백테스트 폼]                              [사이드바]     │
│                                                         │
│ ┌──────────────────────────────────────┐   📅 최근 주가 │
│ │시작일 │종료일 │종목선택│Pro/Custom│실행│  (SOXL)      │
│ │[날짜] │[날짜] │[SOXL▼]│[Pro▼]   │[✅]│  ┌─────────┐  │
│ └──────────────────────────────────────┘  │날짜│종가│   │
│                                           └─────────┘   │
│ [로딩 스피너 영역 - 초기 숨김]                            │
│                                                         │
│ [결과 영역 - 폼 제출 후 표시]                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 폼 요소 상세

| 필드명 | 타입 | 기본값 | 옵션 |
|--------|------|--------|------|
| 시작일 | date | 2025-01-01 | - |
| 종료일 | date | 오늘 날짜 | - |
| 종목 선택 | select | SOXL | SOXL, TQQQ, BITU, TECL |
| Pro/Custom | select | Pro | Pro, Custom |

#### 폼 HTML 구조

```html
<form method="post" class="mb-4">
  <div class="row g-2 align-items-end">
    <!-- 시작일 -->
    <div class="col-md-2">
      <label class="form-label">시작일</label>
      <input type="date" name="start" class="form-control" required>
    </div>

    <!-- 종료일 -->
    <div class="col-md-2">
      <label class="form-label">종료일</label>
      <input type="date" name="end" class="form-control" required>
    </div>

    <!-- 종목 선택 -->
    <div class="col-md-2">
      <label class="form-label">종목 선택</label>
      <select name="symbol" class="form-select" required>
        <option value="SOXL" selected>SOXL</option>
        <option value="TQQQ">TQQQ</option>
        <option value="BITU">BITU</option>
        <option value="TECL">TECL</option>
      </select>
    </div>

    <!-- Pro/Custom 선택 -->
    <div class="col-md-2">
      <label class="form-label">Pro / Custom</label>
      <select name="mode" class="form-select">
        <option value="Pro" selected>Pro</option>
        <option value="Custom">Custom</option>
      </select>
    </div>

    <!-- 실행 버튼 -->
    <div class="col-md-3">
      <button type="submit" class="btn btn-success w-100">
        ✅ 백테스트 실행
      </button>
      <div id="backtest-spinner" class="text-center mt-1" style="display: none;">
        <div class="spinner-border text-light" role="status"></div>
        <div class="small">처리 중...</div>
      </div>
    </div>
  </div>
</form>
```

---

## 5. 공통 컴포넌트

### 5.1 상단 컨트롤 바

```html
<div class="d-flex justify-content-between align-items-center px-3 mb-2 top-control-bar">
  <!-- 좌측: 제품군 드롭다운 -->
  <div class="dropdown">
    <button class="btn btn-outline-info btn-sm dropdown-toggle fw-bold"
            type="button" disabled>
      떨사오팔 Pro
    </button>
  </div>

  <!-- 우측: 사용자/네비게이션 -->
  <div class="d-flex align-items-center gap-2">
    <span class="text-white fw-bold">👤 사용자명</span>
    <a href="/accounts" class="btn btn-info btn-sm text-white fw-bold">📋 트레이딩</a>
    <a href="/my_custom" class="btn btn-success btn-sm text-white fw-bold">🔧 My Custom</a>
    <a href="/mypage" class="btn btn-outline-light btn-sm">My Page</a>
  </div>
</div>
```

### 5.2 메인 네비게이션 (탭)

```html
<!-- 탭 형태의 네비게이션은 원본에서 사용하지 않음 -->
<!-- 로고 + 메뉴 링크 형태로 구현 -->
<nav class="navbar navbar-expand navbar-dark">
  <a class="navbar-brand" href="/">
    🛰️ 떨사오팔 Pro 레이더
  </a>
  <ul class="navbar-nav">
    <li class="nav-item">
      <a class="nav-link active" href="/info">ℹ️ Info</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" href="/recommend">🎯 추천 전략</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" href="/stats">📊 통계</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" href="/backtest">📈 백테스트(기본)</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" href="/advanced_backtest">🚀 백테스트(추천전략)</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" href="/update_note">📝 Update Note</a>
    </li>
  </ul>
</nav>
```

### 5.3 우측 사이드바 (최근 주가)

```html
<div id="fixedSidebar" class="d-none d-md-block">
  <h6 class="mb-2">📅 최근 주가 (SOXL)</h6>
  <table class="table table-sm table-dark table-bordered text-center mb-0">
    <thead>
      <tr class="table-secondary text-dark text-center">
        <th>날짜</th>
        <th>종가</th>
      </tr>
    </thead>
    <tbody class="text-start">
      <tr>
        <td>2026-01-15</td>
        <td style="color: #ff5370;">58.08 (▲4.88%)</td>
      </tr>
      <tr>
        <td>2026-01-14</td>
        <td style="color: #26c6da;">55.38 (▼1.23%)</td>
      </tr>
      <!-- 추가 행들 -->
    </tbody>
  </table>
</div>
```

### 5.4 프리미엄 모달

```html
<div class="modal fade" id="premiumModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content bg-dark text-light">
      <div class="modal-header">
        <h5 class="modal-title">⛔ 부가 기능</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        부가 기능은 <strong>정기 후원 시</strong> 사용할 수 있습니다.<br>
        후원 후 이용해주세요 😊
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
          확인
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## 6. 구현 계획

### 6.1 구현 단계

| 단계 | 작업 | 예상 시간 |
|------|------|----------|
| 1 | Next.js 프로젝트 초기화 + 의존성 설치 | 30분 |
| 2 | `layout.tsx` 공통 레이아웃 구현 | 1시간 |
| 3 | `globals.css` 커스텀 스타일 | 1시간 |
| 4 | 공통 컴포넌트 구현 (TopControlBar, MainNavigation, Sidebar) | 1시간 |
| 5 | `/info` 페이지 구현 | 2시간 |
| 6 | `/backtest` 페이지 구현 | 1시간 |
| 7 | 반응형 테스트 및 수정 | 1시간 |

**총 예상 시간: 7.5시간**

### 6.2 우선순위

1. **필수 구현**
   - [x] 분석 완료
   - [ ] Next.js 프로젝트 설정
   - [ ] 공통 레이아웃 (`layout.tsx`)
   - [ ] 커스텀 스타일 (`globals.css`)
   - [ ] 공통 컴포넌트 (TopControlBar, MainNavigation, Sidebar)
   - [ ] Info 페이지 (`/info/page.tsx`)
   - [ ] Backtest 폼 UI (`/backtest/page.tsx`)

2. **선택 구현**
   - [ ] 반응형 사이드바
   - [ ] 프리미엄 모달 컴포넌트
   - [ ] 로딩 스피너 애니메이션

---

## 7. 파일 구조

```
buy-dip-sell-peak-system/
├── src/
│   └── app/
│       ├── layout.tsx           # 공통 레이아웃 (RootLayout)
│       ├── page.tsx             # 홈페이지 (/ → /info 리다이렉트)
│       ├── info/
│       │   └── page.tsx         # Info 페이지
│       └── backtest/
│           └── page.tsx         # Backtest 페이지
├── src/
│   └── components/
│       ├── TopControlBar.tsx    # 상단 컨트롤 바
│       ├── MainNavigation.tsx   # 메인 네비게이션
│       ├── Sidebar.tsx          # 우측 사이드바 (최근 주가)
│       ├── StrategyCard.tsx     # 전략 카드 (Pro1/Pro2/Pro3)
│       ├── FlowChart.tsx        # 사용법 플로우차트
│       └── PremiumModal.tsx     # 프리미엄 모달
├── src/
│   └── styles/
│       └── globals.css          # 글로벌 스타일 + 커스텀 CSS
├── public/
│   └── favicon.ico              # 파비콘
├── package.json                 # Node.js 의존성
├── tsconfig.json                # TypeScript 설정
├── next.config.ts               # Next.js 설정
└── docs/
    └── phase1-site-replication-plan.md  # 이 문서
```

---

## 8. 외부 의존성

### CDN 링크

```html
<!-- Bootstrap + Bootswatch Solar 테마 -->
<link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/solar/bootstrap.min.css" rel="stylesheet">

<!-- Google Fonts - Noto Sans KR -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap" rel="stylesheet">

<!-- Bootstrap Bundle JS (Popper 포함) -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
```

### Node.js 의존성 (package.json)

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "bootstrap": "^5.3.3"
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

## 📎 참고 자료

### 원본 사이트 스크린샷

#### /info 페이지
- 3열 카드 레이아웃으로 Pro1/Pro2/Pro3 전략 비교
- 플로우차트 형태의 사용법 안내
- 우측 사이드바에 최근 주가 정보

#### /backtest 페이지
- 깔끔한 가로 폼 레이아웃
- 녹색 실행 버튼 (btn-success)
- 로딩 시 스피너 표시

### 컬러 코드 요약

| 용도 | HEX | 미리보기 |
|------|-----|---------|
| 배경 | #002b36 | 어두운 청록 |
| 카드 배경 | #073642 | 진한 청록 |
| 주요 강조 | #2aa198 | 밝은 청록 |
| 상승 | #ff5370 | 빨강 |
| 하락 | #26c6da | 밝은 청록 |
| 텍스트 | #fdf6e3 | 아이보리 화이트 |

---

*이 문서는 Hyperbrowser MCP를 활용하여 radar0458.pro 사이트를 분석한 결과입니다.*
