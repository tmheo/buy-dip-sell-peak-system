---
id: SPEC-FRONTEND-001
version: "1.0.0"
status: "draft"
created: "2026-01-16"
updated: "2026-01-16"
author: "허태명"
---

# Implementation Plan: SPEC-FRONTEND-001

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0.0 | 2026-01-16 | 허태명 | 초기 구현 계획 문서 생성 |

---

## 1. 구현 개요

### 1.1 목표

radar0458.pro 사이트의 `/info` 및 `/backtest` 페이지를 Next.js 15 App Router 기반으로 동일하게 복제한다.

### 1.2 예상 작업 시간

| 단계 | 작업 | 예상 시간 |
|------|------|----------|
| 1 | Next.js 프로젝트 초기화 + 의존성 설치 | 30분 |
| 2 | `layout.tsx` 공통 레이아웃 구현 | 1시간 |
| 3 | `globals.css` 커스텀 스타일 | 1시간 |
| 4 | 공통 컴포넌트 구현 (6개) | 1시간 |
| 5 | `/info` 페이지 구현 | 2시간 |
| 6 | `/backtest` 페이지 구현 | 1시간 |
| 7 | 반응형 테스트 및 수정 | 1시간 |

**총 예상 시간: 7.5시간**

---

## 2. 단계별 구현 계획

### 2.1 단계 1: 프로젝트 초기화

#### 2.1.1 Next.js 15 프로젝트 설정

```bash
# src/app 디렉토리 구조 생성 (기존 TypeScript 프로젝트 확장)
mkdir -p src/app/info src/app/backtest src/components src/styles
```

#### 2.1.2 package.json 업데이트

기존 `package.json`에 Next.js 관련 의존성 추가:

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  },
  "scripts": {
    "web:dev": "next dev",
    "web:build": "next build",
    "web:start": "next start"
  }
}
```

#### 2.1.3 next.config.ts 생성

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 기존 src/ 디렉토리와 공존
};

export default nextConfig;
```

---

### 2.2 단계 2: 공통 레이아웃 구현

#### 2.2.1 `src/app/layout.tsx`

루트 레이아웃 파일 생성:

```typescript
// 메타데이터 정의
// CDN 링크 포함 (Bootstrap, Bootswatch Solar, Google Fonts)
// 공통 구조: TopControlBar + MainNavigation + children + Sidebar
```

**핵심 구현 사항**:
- `<html lang="ko">` 설정
- CDN 스타일시트 링크 (`<head>` 내 `<link>`)
- CDN 스크립트 (`<body>` 끝에 `<Script>`)
- 공통 레이아웃 구조

#### 2.2.2 `src/app/page.tsx`

홈페이지 리다이렉트:

```typescript
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/info');
}
```

---

### 2.3 단계 3: 글로벌 스타일 구현

#### 2.3.1 `src/styles/globals.css`

**구현 내용**:

1. **폰트 설정**
```css
body {
  font-family: 'Noto Sans KR', sans-serif;
}
```

2. **커스텀 색상 변수**
```css
:root {
  --price-up: #ff5370;
  --price-down: #26c6da;
}
```

3. **사이드바 스타일**
```css
#fixedSidebar {
  position: fixed;
  right: 20px;
  top: 120px;
  width: 220px;
  background: #1b1b1b;
}
```

4. **플로우차트 스타일**
```css
.flow-box-horizontal {
  min-width: 120px;
  padding: 0.75rem;
}

.arrow-right {
  width: 30px;
  height: 2px;
  background: #fdf6e3;
  position: relative;
}

.arrow-right::after {
  content: '';
  position: absolute;
  right: 0;
  top: -4px;
  border: 5px solid transparent;
  border-left-color: #fdf6e3;
}
```

5. **반응형 스타일**
```css
@media (max-width: 1700px) {
  #fixedSidebar { display: none; }
}

@media (max-width: 768px) {
  #fixedSidebar { display: none; }
  .flow-box-horizontal { min-width: 100px; }
}
```

---

### 2.4 단계 4: 공통 컴포넌트 구현

#### 2.4.1 `TopControlBar.tsx`

**Props 인터페이스**:
```typescript
interface TopControlBarProps {
  userName?: string;
}
```

**구현 요소**:
- 좌측: 제품군 드롭다운 (`떨사오팔 Pro`, disabled)
- 우측: 사용자명, 트레이딩 버튼, My Custom 버튼, My Page 버튼

#### 2.4.2 `MainNavigation.tsx`

**Props 인터페이스**:
```typescript
interface MainNavigationProps {
  currentPath: string;
}
```

**구현 요소**:
- 로고: `🛰️ 떨사오팔 Pro 레이더`
- 메뉴 항목: Info, 추천전략, 통계, 백테스트(기본), 백테스트(추천전략), Update Note
- 현재 페이지 활성화 표시

#### 2.4.3 `Sidebar.tsx`

**Props 인터페이스**:
```typescript
interface SidebarProps {
  ticker?: string;
  prices?: PriceData[];
}

interface PriceData {
  date: string;
  close: number;
  change: number;
}
```

**구현 요소**:
- 제목: `📅 최근 주가 (SOXL)`
- 테이블: 날짜, 종가, 변동률
- 상승/하락 색상 표시

#### 2.4.4 `StrategyCard.tsx`

**Props 인터페이스**:
```typescript
interface StrategyCardProps {
  title: string;  // Pro1, Pro2, Pro3
  splitRatio: string;
  settings: string[];
}
```

**구현 요소**:
- 카드 헤더: Pro1/Pro2/Pro3
- 분할 비율 표시
- 2열 그리드 설정값 표시

#### 2.4.5 `FlowChart.tsx`

**Props 인터페이스**:
```typescript
interface FlowChartProps {
  steps: FlowStep[];
}

interface FlowStep {
  number: number;
  title: string;
  subtitle?: string;
}
```

**구현 요소**:
- 5단계 가로 배치
- 화살표 연결
- 반응형 래핑

#### 2.4.6 `PremiumModal.tsx`

**구현 요소**:
- Bootstrap Modal 컴포넌트
- 부가 기능 안내 메시지
- 확인 버튼

---

### 2.5 단계 5: Info 페이지 구현

#### 2.5.1 `src/app/info/page.tsx`

**섹션 구조**:

1. **헤더 섹션**
   - 제목: `ℹ️ 떨사오팔 Pro 레이더 Info`

2. **소개 섹션**
   - `📡 떨사오팔 Pro 레이더는?` 설명
   - `🤔 떨사오팔이란?` 리스트

3. **전략 섹션**
   - `⚙️ Pro1 / Pro2 / Pro3 전략이란?`
   - 3열 StrategyCard 컴포넌트

4. **차이점 섹션**
   - `📐 떨사오팔Pro vs 원론 차이점`
   - 리스트 형식

5. **사용법 섹션**
   - `📙 사용법 플로우차트`
   - FlowChart 컴포넌트 (5단계)

6. **하단 섹션**
   - 면책 조항
   - 문의 섹션

---

### 2.6 단계 6: Backtest 페이지 구현

#### 2.6.1 `src/app/backtest/page.tsx`

**섹션 구조**:

1. **폼 섹션**
   ```typescript
   interface BacktestFormData {
     startDate: string;
     endDate: string;
     symbol: 'SOXL' | 'TQQQ' | 'BITU' | 'TECL';
     mode: 'Pro' | 'Custom';
   }
   ```

2. **폼 필드**
   - 시작일: `<input type="date">` (기본값: 2025-01-01)
   - 종료일: `<input type="date">` (기본값: 오늘)
   - 종목 선택: `<select>` (SOXL, TQQQ, BITU, TECL)
   - Pro/Custom: `<select>` (Pro, Custom)
   - 실행 버튼: `<button type="submit" class="btn btn-success">`

3. **로딩 상태**
   - 스피너: `<div class="spinner-border">`
   - 텍스트: "처리 중..."

4. **결과 영역**
   - Phase 1에서는 빈 placeholder
   - Phase 2에서 실제 결과 표시

---

### 2.7 단계 7: 반응형 테스트

#### 2.7.1 테스트 브레이크포인트

| 너비 | 검증 항목 |
|------|----------|
| 1920px | 전체 레이아웃, 사이드바 표시 |
| 1700px | 사이드바 숨김 확인 |
| 1024px | 태블릿 레이아웃 |
| 768px | 모바일 브레이크포인트 |
| 375px | 모바일 최소 너비 |

#### 2.7.2 검증 항목

- [ ] 사이드바 반응형 숨김 (1700px 이하)
- [ ] 전략 카드 열 조정 (768px 이하에서 1열)
- [ ] 플로우차트 래핑 (좁은 화면)
- [ ] 폼 필드 스택 배치 (모바일)
- [ ] 네비게이션 메뉴 접기 (모바일)

---

## 3. 기술적 고려사항

### 3.1 Server Component vs Client Component

| 컴포넌트 | 타입 | 이유 |
|----------|------|------|
| layout.tsx | Server | 정적 메타데이터, CDN 링크 |
| page.tsx (info) | Server | 정적 콘텐츠 |
| page.tsx (backtest) | Client | 폼 상태 관리 필요 |
| TopControlBar | Server | 정적 네비게이션 |
| MainNavigation | Client | 현재 경로 확인 필요 |
| Sidebar | Server | 정적 데이터 (Phase 1) |
| StrategyCard | Server | Props 기반 정적 렌더링 |
| FlowChart | Server | Props 기반 정적 렌더링 |
| PremiumModal | Client | Bootstrap JS 필요 |

### 3.2 Bootstrap JS 통합

Next.js App Router에서 Bootstrap JS 사용:

```typescript
// layout.tsx
import Script from 'next/script';

<Script
  src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
  strategy="afterInteractive"
/>
```

### 3.3 타입 안전성

모든 컴포넌트에 TypeScript 인터페이스 정의:
- Props 인터페이스 필수
- 이벤트 핸들러 타입 명시
- 상태 타입 정의

---

## 4. 의존성 관리

### 4.1 기존 프로젝트와의 통합

현재 프로젝트는 CLI 기반 백테스팅 도구:
- 기존: `src/index.ts` (CLI 진입점)
- 추가: `src/app/` (Next.js 웹 앱)

**공존 전략**:
- CLI 스크립트: `npm run dev` (기존 유지)
- 웹 앱: `npm run web:dev` (신규 추가)

### 4.2 tsconfig.json 확장

Next.js 설정 추가:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }]
  },
  "include": ["src/app/**/*", "src/components/**/*"]
}
```

---

## 5. 위험 관리

### 5.1 기술적 위험

| 위험 | 확률 | 영향 | 완화 전략 |
|------|------|------|-----------|
| Next.js 15 호환성 | 낮음 | 중간 | Context7 문서 참조, 공식 마이그레이션 가이드 |
| Bootstrap JS/React 충돌 | 중간 | 낮음 | Client Component 분리, useEffect 사용 |
| CDN 장애 | 낮음 | 중간 | 로컬 폴백 준비 (Phase 2) |

### 5.2 범위 위험

| 위험 | 완화 전략 |
|------|-----------|
| Phase 1 범위 확장 | SPEC 문서로 범위 명확화, 추가 요청은 별도 SPEC |
| 디자인 불일치 | 원본 사이트 CSS 분석 완료, 픽셀 단위 검증 |

---

## 6. 품질 게이트

### 6.1 코드 품질

- [ ] TypeScript strict 모드 통과
- [ ] ESLint 오류 없음
- [ ] Prettier 포맷 적용

### 6.2 기능 품질

- [ ] 모든 EARS 요구사항 충족
- [ ] 반응형 디자인 검증
- [ ] 색상 팔레트 일치

### 6.3 성능 품질

- [ ] 초기 로딩 3초 이내
- [ ] Lighthouse 성능 점수 80+
- [ ] CLS (Cumulative Layout Shift) 0.1 이하

---

## 7. 다음 단계

SPEC 구현 완료 후:

1. `/moai:2-run SPEC-FRONTEND-001` - TDD 기반 구현 시작
2. `/moai:3-sync SPEC-FRONTEND-001` - 문서 동기화 및 PR 생성

---

*이 구현 계획은 SPEC-FRONTEND-001을 기반으로 작성되었습니다.*
