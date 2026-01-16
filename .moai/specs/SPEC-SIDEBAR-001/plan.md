---
spec_id: SPEC-SIDEBAR-001
title: SOXL 가격 사이드바 구현 계획
version: "1.0.0"
created: "2026-01-16"
updated: "2026-01-16"
author: "허태명"
---

# SPEC-SIDEBAR-001: 구현 계획

## 1. 마일스톤

### Primary Goal: 데이터베이스 함수 추가

**목표:** 최근 N일 가격 데이터를 조회하는 함수 구현

**작업 항목:**

1. `src/database/schema.ts`에 새 쿼리 상수 추가
   ```sql
   SELECT date, close FROM daily_prices
   WHERE ticker = ? ORDER BY date DESC LIMIT ?
   ```

2. `src/database/index.ts`에 `getLatestPrices()` 함수 추가
   - 파라미터: `limit: number`, `ticker: string`
   - 반환값: `{ date: string; close: number }[]`

**완료 기준:**
- [ ] 쿼리 상수 정의 완료
- [ ] 함수 구현 및 export 완료
- [ ] TypeScript 타입 검사 통과

---

### Secondary Goal: 사이드바 컴포넌트 수정

**목표:** 목업 데이터를 실제 데이터베이스 연동으로 대체

**작업 항목:**

1. `src/components/Sidebar.tsx` 수정
   - 데이터베이스 모듈 import
   - 11일치 데이터 조회 (10일 표시 + 1일 변동률 계산용)
   - 변동률 계산 로직 구현
   - 목업 데이터 제거

2. 인터페이스 유지
   - 기존 `PriceData` 인터페이스와 동일한 구조 유지
   - `SidebarPriceData` 타입으로 명명 변경 고려

**완료 기준:**
- [ ] 데이터베이스에서 실제 데이터 조회 확인
- [ ] 변동률 계산 정확성 검증
- [ ] 기존 UI 레이아웃 유지

---

### Final Goal: 통합 및 검증

**목표:** 전체 페이지에서 사이드바 정상 동작 확인

**작업 항목:**

1. 통합 테스트
   - 메인 페이지(`/`)에서 사이드바 렌더링 확인
   - 정보 페이지(`/info`)에서 사이드바 렌더링 확인
   - 백테스트 페이지(`/backtest`)에서 사이드바 렌더링 확인

2. 시각적 검증
   - 날짜 포맷 확인 (YYYY-MM-DD)
   - 종가 포맷 확인 ($XX.XX)
   - 변동률 색상 확인 (상승: 빨강, 하락: 청록)

**완료 기준:**
- [ ] 모든 페이지에서 사이드바 정상 표시
- [ ] 데이터 정렬 확인 (최신순)
- [ ] 색상 코딩 정확성 확인

---

## 2. 기술적 접근

### 2.1 데이터 흐름

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   prices.db     │───▶│  getLatestPrices │───▶│   Sidebar.tsx   │
│   (SQLite)      │    │  (database/index)│    │ (Server Component)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 2.2 변동률 계산 전략

**Why 11일 조회?**
- 표시: 최근 10일
- 계산: 가장 오래된 날짜의 전일 종가 필요
- 따라서: 10 + 1 = 11일 조회

**예시:**
```
조회: [1/15, 1/14, 1/13, 1/12, 1/11, 1/10, 1/9, 1/8, 1/7, 1/6, 1/5]
표시: [1/15, 1/14, 1/13, 1/12, 1/11, 1/10, 1/9, 1/8, 1/7, 1/6]
1/6의 변동률 = (1/6 종가 - 1/5 종가) / 1/5 종가 × 100
```

### 2.3 Server Component 데이터 페칭

```typescript
// src/components/Sidebar.tsx
import { getLatestPrices } from '@/database/index.js';

export default function Sidebar() {
  // Server Component에서 직접 데이터베이스 호출
  const rawPrices = getLatestPrices(11, 'SOXL');

  // 변동률 계산
  const pricesWithChange = calculateChange(rawPrices);

  return (
    // ... JSX
  );
}
```

---

## 3. 아키텍처 설계

### 3.1 파일 변경 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `src/database/schema.ts` | 수정 | 새 쿼리 상수 추가 |
| `src/database/index.ts` | 수정 | `getLatestPrices()` 함수 추가 |
| `src/components/Sidebar.tsx` | 수정 | 데이터베이스 연동 |

### 3.2 새 함수 시그니처

```typescript
// src/database/index.ts
export function getLatestPrices(
  limit: number,
  ticker: string = 'SOXL'
): { date: string; close: number }[];
```

### 3.3 데이터 변환 흐름

```
DB 원본 데이터:
{ date: "2026-01-15", close: 28.45 }

변환 후:
{ date: "2026-01-15", close: 28.45, change: 2.3 }
```

---

## 4. 리스크 및 대응

### 4.1 기술적 리스크

| 리스크 | 영향 | 대응 방안 |
|--------|------|----------|
| 데이터베이스 연결 실패 | 사이드바 렌더링 실패 | try-catch로 에러 처리, 빈 배열 반환 |
| 데이터 부족 | 10일 미만 표시 | 존재하는 데이터만 표시 |
| ESM 경로 문제 | import 실패 | `.js` 확장자 명시 |

### 4.2 대응 코드

```typescript
export default function Sidebar() {
  let pricesWithChange: SidebarPriceData[] = [];

  try {
    const rawPrices = getLatestPrices(11, 'SOXL');
    pricesWithChange = calculateChange(rawPrices);
  } catch (error) {
    console.error('사이드바 데이터 로드 실패:', error);
  }

  if (pricesWithChange.length === 0) {
    return (
      <aside id="fixedSidebar">
        <div className="card">
          <div className="card-body">데이터 없음</div>
        </div>
      </aside>
    );
  }

  return (/* 정상 렌더링 */);
}
```

---

## 5. 의존성 확인

### 5.1 사전 조건

- [x] `data/prices.db` 데이터베이스 파일 존재
- [x] `better-sqlite3` 패키지 설치됨
- [x] SOXL 가격 데이터 저장됨

### 5.2 확인 명령어

```bash
# 데이터베이스 파일 확인
ls -la data/prices.db

# 데이터 존재 확인
npx tsx -e "
import { getCount } from './src/database/index.js';
console.log('SOXL 데이터 수:', getCount('SOXL'));
"
```

---

## 6. 다음 단계

구현 완료 후:
1. `/moai:2-run SPEC-SIDEBAR-001` 실행하여 TDD 기반 구현
2. 수동 테스트로 모든 페이지에서 사이드바 동작 확인
3. `/moai:3-sync SPEC-SIDEBAR-001` 실행하여 문서 동기화
