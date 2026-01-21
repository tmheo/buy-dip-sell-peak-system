# 기술 스택

## 기술 스택 개요

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ TypeScript  │  │    Node.js  │  │     ESM     │         │
│  │   5.7.3     │  │   (Runtime) │  │  (Modules)  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │    better-sqlite3   │  │   yahoo-finance2    │          │
│  │      v11.7.0        │  │      v3.11.2        │          │
│  │  (Native SQLite)    │  │   (Data Source)     │          │
│  └─────────────────────┘  └─────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    Development Layer                         │
│  ┌───────┐  ┌──────────┐  ┌───────┐  ┌───────┐  ┌───────┐ │
│  │ ESLint│  │ Prettier │  │  tsx  │  │ Husky │  │lint-  │ │
│  │9.39.2 │  │  3.8.0   │  │4.19.2 │  │ 9.1.7 │  │staged │ │
│  └───────┘  └──────────┘  └───────┘  └───────┘  └───────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Layer

### 기술 스택 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend Layer                               │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │     Next.js 15      │  │      React 19       │              │
│  │   (App Router)      │  │   (UI Library)      │              │
│  └─────────────────────┘  └─────────────────────┘              │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │   Bootstrap 5.3.3   │  │  Bootswatch Solar   │              │
│  │  (CSS Framework)    │  │   (Dark Theme)      │              │
│  └─────────────────────┘  └─────────────────────┘              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Google Fonts - Noto Sans KR                 │   │
│  │                    (한글 폰트)                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Next.js 15 (App Router)

**선택 이유:**
- React 19의 최신 기능 활용 (Server Components, Streaming)
- 파일 기반 라우팅으로 직관적인 페이지 구조
- 빌트인 최적화 (이미지, 폰트, 스크립트)

**주요 설정:**
| 기능 | 설정 | 설명 |
|------|------|------|
| App Router | `src/app/` | 파일 시스템 기반 라우팅 |
| Server Components | 기본값 | 서버 사이드 렌더링 |
| Client Components | `'use client'` | 인터랙티브 컴포넌트 |

### React 19

**선택 이유:**
- 최신 React 기능 (Actions, use hook)
- 향상된 서버 컴포넌트 지원
- 자동 배칭 및 Suspense 개선

### Bootstrap 5.3.3 + Bootswatch Solar

**선택 이유:**
- 반응형 그리드 시스템
- 풍부한 컴포넌트 라이브러리
- Bootswatch Solar 테마로 일관된 다크 모드 UI

**색상 팔레트:**
| 변수 | 값 | 용도 |
|------|-----|------|
| `--bs-body-bg` | #002b36 | 메인 배경 (어두운 청록) |
| `--bs-dark` | #073642 | 카드 배경 |
| `--bs-info` | #2aa198 | 강조 텍스트 (청록) |
| `--price-up` | #ff5370 | 상승 가격 (빨강) |
| `--price-down` | #26c6da | 하락 가격 (밝은 청록) |

### Google Fonts - Noto Sans KR

**선택 이유:**
- 한글 지원에 최적화
- Google CDN을 통한 빠른 로딩
- 다양한 굵기 지원

### NextAuth.js v5 (Auth.js)

**선택 이유:**
- Next.js App Router와의 완벽한 통합
- Google OAuth 등 다양한 소셜 로그인 지원
- 세션 관리 및 JWT 토큰 자동 처리

**주요 설정:**
| 기능 | 설정 | 설명 |
|------|------|------|
| Google OAuth | `GoogleProvider` | 소셜 로그인 제공자 |
| SQLite Adapter | Custom Adapter | better-sqlite3 기반 커스텀 어댑터 |
| Session | JWT | 세션 저장 전략 |

**구성 파일:**
- `auth.ts` - NextAuth.js 설정
- `src/lib/auth/adapter.ts` - SQLite 커스텀 어댑터
- `src/lib/auth/queries.ts` - 사용자/계정 DB 쿼리

---

## 핵심 기술

### TypeScript 5.7.3

**선택 이유:**
- 정적 타입 검사로 런타임 에러 사전 방지
- IDE 자동완성 및 리팩토링 지원
- 코드 문서화 역할 (인터페이스 정의)

**설정 (tsconfig.json):**

| 옵션 | 값 | 설명 |
|------|-----|------|
| target | ES2022 | 최신 JavaScript 기능 사용 |
| module | NodeNext | ESM 모듈 시스템 |
| strict | true | 엄격한 타입 검사 활성화 |
| moduleResolution | NodeNext | Node.js 스타일 모듈 해석 |
| esModuleInterop | true | CommonJS/ESM 상호 운용성 |
| skipLibCheck | true | 의존성 타입 검사 생략 (빌드 속도) |

### Node.js (ESM)

**선택 이유:**
- 비동기 I/O를 통한 효율적인 API 호출
- npm 생태계 활용
- ESM(ECMAScript Modules)으로 현대적인 모듈 관리

**ESM 설정:**
```json
// package.json
{
  "type": "module"
}
```

**ESM 임포트 규칙:**
- 상대 경로 임포트 시 `.js` 확장자 명시 필요
- `__dirname`, `__filename` 대신 `import.meta.url` 사용

---

## 데이터 레이어

### better-sqlite3 v11.7.0

**선택 이유:**
- **성능**: 동기식 API로 Node.js에서 가장 빠른 SQLite 드라이버
- **안정성**: 네이티브 바인딩으로 직접 SQLite 라이브러리 호출
- **간결함**: 프로미스/콜백 없이 직관적인 동기 코드 작성

**주요 기능 활용:**

| 기능 | 구현 | 설명 |
|------|------|------|
| WAL 모드 | `db.pragma("journal_mode = WAL")` | 동시 읽기 성능 향상 |
| 트랜잭션 | `db.transaction()` | 대량 삽입 시 원자성 보장 |
| Prepared Statements | `db.prepare()` | SQL 인젝션 방지 및 성능 최적화 |

**데이터베이스 스키마:**
```sql
CREATE TABLE IF NOT EXISTS daily_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL DEFAULT 'SOXL',
    date TEXT NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_ticker_date ON daily_prices(ticker, date);
```

### yahoo-finance2 v3.11.2

**선택 이유:**
- Yahoo Finance의 비공식 API를 안정적으로 래핑
- TypeScript 지원
- 차트, 시세, 히스토리 등 다양한 데이터 엔드포인트 제공

**주요 기능 활용:**

| 메서드 | 용도 | 반환 데이터 |
|--------|------|------------|
| `chart()` | 일별 가격 히스토리 | OHLCV (시가, 고가, 저가, 종가, 거래량) |
| `quote()` | 현재 시세 | 현재가, 변동폭, 변동률 |

**에러 처리:**
- Rate Limit (429 에러) 발생 시 지수 백오프로 재시도
- 최대 3회 재시도, 대기 시간: 2초 * 시도 횟수

---

## 개발 환경

### 코드 품질 도구

#### ESLint v9.39.2

**역할:** 코드 정적 분석 및 잠재적 오류 감지

**설정:**
- `@eslint/js` - 기본 규칙 세트
- `typescript-eslint` - TypeScript 전용 규칙
- `eslint-config-prettier` - Prettier와 충돌 방지

**주요 검사 항목:**
- 미사용 변수/임포트
- 암시적 any 타입
- 일관된 코딩 스타일

#### Prettier v3.8.0

**역할:** 코드 자동 포매팅

**설정 (.prettierrc):**
- 들여쓰기, 세미콜론, 따옴표 스타일 통일
- 저장 시 자동 포매팅

### 개발 워크플로우 도구

#### tsx v4.19.2

**역할:** TypeScript 직접 실행 (컴파일 없이)

**특징:**
- esbuild 기반으로 빠른 변환
- Node.js 환경에서 .ts 파일 직접 실행
- 개발 중 빠른 피드백 루프

**사용법:**
```bash
npx tsx src/index.ts init --ticker SOXL
```

#### Husky v9.1.7 + lint-staged v16.2.7

**역할:** Git 커밋 전 자동 코드 검사

**워크플로우:**
1. `git commit` 실행
2. Husky가 pre-commit 훅 트리거
3. lint-staged가 스테이징된 .ts 파일에 대해:
   - ESLint 자동 수정 실행
   - Prettier 포매팅 적용
4. 모든 검사 통과 시 커밋 완료

**설정 (package.json):**
```json
{
  "lint-staged": {
    "src/**/*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

---

## npm 스크립트

| 스크립트 | 명령어 | 설명 |
|----------|--------|------|
| `build` | `tsc` | TypeScript 컴파일 |
| `start` | `node dist/index.js` | 빌드된 코드 실행 |
| `dev` | `tsx src/index.ts` | 개발 모드 실행 |
| `init` | `tsx src/index.ts init` | 데이터베이스 초기화 |
| `update` | `tsx src/index.ts update` | 데이터 업데이트 |
| `query` | `tsx src/index.ts query` | 데이터 조회 |
| `lint` | `eslint src/` | 린트 검사 |
| `lint:fix` | `eslint src/ --fix` | 린트 자동 수정 |
| `format` | `prettier --write src/` | 코드 포매팅 |
| `format:check` | `prettier --check src/` | 포매팅 검사 |
| `prepare` | `husky` | Husky 설치 |
| `web:dev` | `next dev --turbopack` | Next.js 개발 서버 (Turbopack) |
| `web:build` | `next build` | Next.js 프로덕션 빌드 |
| `web:start` | `next start` | Next.js 프로덕션 서버 |

---

## 개발 환경 요구사항

### 필수 요구사항

| 항목 | 최소 버전 | 권장 버전 |
|------|----------|----------|
| Node.js | 18.x | 20.x LTS |
| npm | 9.x | 10.x |

### 시스템 요구사항

- **OS**: macOS, Linux, Windows (WSL 권장)
- **디스크**: 최소 100MB (데이터베이스 포함)
- **네트워크**: Yahoo Finance API 접근 가능

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone https://github.com/username/buy-dip-sell-peak-system.git
cd buy-dip-sell-peak-system

# 2. 의존성 설치
npm install

# 3. 데이터베이스 초기화 (SOXL)
npm run dev init -- --ticker SOXL

# 4. 데이터 조회
npm run dev query -- --ticker SOXL --start 2024-01-01 --end 2024-12-31
```

---

## 빌드 및 배포

### 프로덕션 빌드

```bash
# TypeScript 컴파일
npm run build

# 빌드 결과 확인
ls -la dist/

# 프로덕션 실행
npm start init -- --ticker SOXL
```

### 빌드 출력 구조

```
dist/
├── index.js
├── types/
│   └── index.js
├── database/
│   ├── index.js
│   └── schema.js
└── services/
    └── dataFetcher.js
```

### 배포 고려사항

1. **환경 변수**: 현재 하드코딩된 설정 없음 (추후 확장 시 고려)
2. **데이터베이스 경로**: `data/prices.db` 상대 경로 사용
3. **의존성**: `better-sqlite3`는 네이티브 모듈로 OS별 재빌드 필요

---

## 기술 선택 근거

### SQLite vs 클라우드 DB

| 기준 | SQLite | 클라우드 DB |
|------|--------|------------|
| **설치** | 로컬 파일, 즉시 사용 | 계정/설정 필요 |
| **비용** | 무료 | 사용량 기반 과금 |
| **성능** | 로컬 I/O로 빠름 | 네트워크 지연 |
| **용도** | 개인 분석 도구에 적합 | 멀티 유저 서비스용 |

**결론**: 개인 백테스팅 도구로서 SQLite가 최적

### TypeScript vs JavaScript

| 기준 | TypeScript | JavaScript |
|------|-----------|------------|
| **타입 안전성** | 컴파일 타임 검사 | 런타임 에러 |
| **IDE 지원** | 완전한 자동완성 | 제한적 |
| **유지보수** | 인터페이스로 문서화 | 주석 의존 |
| **빌드** | 컴파일 단계 필요 | 즉시 실행 |

**결론**: 데이터 구조가 명확한 금융 데이터 처리에 TypeScript 적합

### yahoo-finance2 vs 대안

| 라이브러리 | 장점 | 단점 |
|-----------|------|------|
| **yahoo-finance2** | TypeScript 지원, 활발한 유지보수 | 비공식 API |
| Alpha Vantage | 공식 API | 일일 호출 제한 |
| Polygon.io | 실시간 데이터 | 유료 |

**결론**: 히스토리 데이터 수집 목적에 yahoo-finance2가 최적

---

## 향후 기술 확장 계획

- [ ] **테스트**: Jest/Vitest를 활용한 유닛/통합 테스트
- [ ] **CI/CD**: GitHub Actions를 통한 자동화 파이프라인
- [ ] **Docker**: 컨테이너화를 통한 환경 독립성
- [x] **웹 UI**: React/Next.js 기반 대시보드
- [x] **인증**: NextAuth.js v5 기반 Google OAuth 로그인

---

*마지막 업데이트: 2026년 1월*
