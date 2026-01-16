---
id: SPEC-SIDEBAR-001
title: SOXL 가격 사이드바 실제 데이터 연동
version: "1.0.0"
status: "draft-saved"
created: "2026-01-16"
updated: "2026-01-16"
author: "허태명"
priority: "high"
lifecycle: "spec-anchored"
tags:
  - sidebar
  - database
  - server-component
  - soxl
related_specs: []
---

# SPEC-SIDEBAR-001: SOXL 가격 사이드바 실제 데이터 연동

## 1. 개요

### 1.1 배경

현재 사이드바 컴포넌트(`src/components/Sidebar.tsx`)는 하드코딩된 5일치 목업 데이터를 표시하고 있다. 이를 실제 SQLite 데이터베이스(`data/prices.db`)에서 SOXL 가격 데이터를 조회하여 표시하도록 변경해야 한다.

### 1.2 목적

- 목업 데이터를 실제 데이터베이스 연동으로 대체
- 최근 10일간의 SOXL 가격 데이터 표시
- 일별 변동률 계산 및 색상 코딩 적용

### 1.3 범위

**포함:**
- 데이터베이스에서 최근 10일 가격 조회
- 전일 대비 변동률 계산 로직
- Server Component에서 직접 데이터베이스 접근

**제외:**
- 새로운 API 엔드포인트 생성
- 클라이언트 사이드 데이터 페칭
- 실시간 가격 업데이트

---

## 2. 요구사항

### 2.1 기능 요구사항

#### REQ-SIDEBAR-001: 최근 가격 데이터 조회

**WHEN** 사이드바가 렌더링될 때
**THEN** 시스템은 데이터베이스에서 SOXL의 최근 10일 가격 데이터를 조회한다

| 속성 | 값 |
|------|-----|
| 우선순위 | High |
| 유형 | Event-Driven |
| 검증 방법 | 단위 테스트 |

#### REQ-SIDEBAR-002: 일별 변동률 계산

**WHEN** 가격 데이터가 조회되면
**THEN** 시스템은 각 날짜의 종가와 전일 종가를 비교하여 변동률을 계산한다

**계산 공식:**
```
변동률(%) = ((당일 종가 - 전일 종가) / 전일 종가) × 100
```

| 속성 | 값 |
|------|-----|
| 우선순위 | High |
| 유형 | Event-Driven |
| 검증 방법 | 단위 테스트 |

#### REQ-SIDEBAR-003: 변동률 색상 표시

**IF** 변동률이 0 이상이면
**THEN** 시스템은 `price-up` 클래스(#ff5370, 빨간색)를 적용한다

**IF** 변동률이 0 미만이면
**THEN** 시스템은 `price-down` 클래스(#26c6da, 청록색)를 적용한다

| 속성 | 값 |
|------|-----|
| 우선순위 | High |
| 유형 | State-Driven |
| 검증 방법 | 시각적 검증 |

#### REQ-SIDEBAR-004: Server Component 구현

시스템은 **항상** Sidebar를 Server Component로 유지하고 데이터베이스에 직접 접근한다

| 속성 | 값 |
|------|-----|
| 우선순위 | High |
| 유형 | Ubiquitous |
| 검증 방법 | 코드 리뷰 |

### 2.2 비기능 요구사항

#### REQ-SIDEBAR-005: 데이터 정렬

시스템은 **항상** 가격 데이터를 날짜 기준 내림차순(최신순)으로 정렬하여 표시한다

| 속성 | 값 |
|------|-----|
| 우선순위 | Medium |
| 유형 | Ubiquitous |
| 검증 방법 | 시각적 검증 |

#### REQ-SIDEBAR-006: 데이터 부족 처리

**IF** 데이터베이스에 10일치 미만의 데이터가 존재하면
**THEN** 시스템은 존재하는 데이터만 표시한다

| 속성 | 값 |
|------|-----|
| 우선순위 | Medium |
| 유형 | Unwanted |
| 검증 방법 | 단위 테스트 |

---

## 3. 기술 명세

### 3.1 데이터베이스 쿼리

**필요한 함수:** `getLatestPrices(limit: number, ticker: string)`

```sql
SELECT date, close
FROM daily_prices
WHERE ticker = ?
ORDER BY date DESC
LIMIT ?
```

### 3.2 데이터 타입

```typescript
interface SidebarPriceData {
  date: string;        // YYYY-MM-DD 형식
  close: number;       // 종가
  change: number;      // 변동률 (%)
}
```

### 3.3 변동률 계산 로직

```typescript
// 11일치 데이터 조회 (10일 표시 + 1일 전일 종가 계산용)
const prices = getLatestPrices(11, 'SOXL');

// 변동률 계산
const pricesWithChange = prices.slice(0, 10).map((price, index) => {
  const prevClose = prices[index + 1]?.close;
  const change = prevClose
    ? ((price.close - prevClose) / prevClose) * 100
    : 0;
  return { ...price, change };
});
```

### 3.4 UI 컴포넌트 구조

```
Sidebar
├── Card Header: "최근 주가 (SOXL)"
└── Table
    ├── Header: 날짜 | 종가 | 변동
    └── Body: 10개 행 (날짜, $종가, ±변동률%)
```

---

## 4. 제약사항

### 4.1 기술적 제약

| 제약 | 설명 |
|------|------|
| Server Component | `'use client'` 지시어 사용 불가 |
| 동기 API | better-sqlite3의 동기식 API 사용 |
| 모듈 경로 | ESM 환경에서 상대 경로 `.js` 확장자 필요 |

### 4.2 의존성

| 의존성 | 버전 | 용도 |
|--------|------|------|
| better-sqlite3 | v11.7.0 | SQLite 데이터베이스 접근 |
| Next.js | 15.x | App Router, Server Components |

---

## 5. 추적성 매트릭스

| 요구사항 ID | 구현 파일 | 테스트 케이스 |
|-------------|-----------|---------------|
| REQ-SIDEBAR-001 | `src/database/index.ts` | TC-001 |
| REQ-SIDEBAR-002 | `src/components/Sidebar.tsx` | TC-002 |
| REQ-SIDEBAR-003 | `src/components/Sidebar.tsx` | TC-003 |
| REQ-SIDEBAR-004 | `src/components/Sidebar.tsx` | TC-004 |
| REQ-SIDEBAR-005 | `src/database/index.ts` | TC-005 |
| REQ-SIDEBAR-006 | `src/components/Sidebar.tsx` | TC-006 |
