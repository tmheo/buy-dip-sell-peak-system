# 기술 스택

## 기술 스택 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ TypeScript  │  │   Node.js   │  │     ESM     │             │
│  │    5.7.3    │  │  (Runtime)  │  │  (Modules)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                        Data Layer                                │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │    Drizzle ORM      │  │   yahoo-finance2    │              │
│  │      v0.45.1        │  │      v3.11.2        │              │
│  │  (Type-safe ORM)    │  │   (Data Source)     │              │
│  └─────────────────────┘  └─────────────────────┘              │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ Supabase Cloud      │  │  Supabase Local     │              │
│  │   (PostgreSQL)      │  │    (Docker)         │              │
│  │   (Production)      │  │  (Development)      │              │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    Development Layer                             │
│  ┌───────┐  ┌──────────┐  ┌───────┐  ┌───────┐  ┌───────────┐ │
│  │Vitest │  │  ESLint  │  │Prettier│ │ Husky │  │lint-staged│ │
│  │4.0.17 │  │  9.39.2  │  │ 3.8.0 │  │ 9.1.7 │  │  16.2.7   │ │
│  └───────┘  └──────────┘  └───────┘  └───────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
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
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │   Tailwind CSS      │  │   Recharts 3.6.0    │              │
│  │  (Utility CSS)      │  │   (Charts)          │              │
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
- Turbopack 지원으로 빠른 개발 서버

**주요 설정:**
| 기능 | 설정 | 설명 |
|------|------|------|
| App Router | `src/app/` | 파일 시스템 기반 라우팅 |
| Server Components | 기본값 | 서버 사이드 렌더링 |
| Client Components | `'use client'` | 인터랙티브 컴포넌트 |
| Turbopack | `--turbopack` | 빠른 개발 서버 |

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

### Tailwind CSS

**선택 이유:**
- 유틸리티 기반 스타일링으로 빠른 개발
- Bootstrap과 조합하여 유연한 커스터마이징
- JIT 컴파일로 최적화된 CSS 번들

### Recharts 3.6.0

**선택 이유:**
- React 친화적인 차트 라이브러리
- 반응형 차트 지원
- 커스터마이징 용이

**주요 활용:**
| 차트 타입 | 용도 |
|----------|------|
| LineChart | 가격 차트, MA 차트 |
| AreaChart | 자산 변동 차트 |
| ComposedChart | MDD 차트 |
| BarChart | 전략 사용 통계 |

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
| Drizzle Adapter | `DrizzleAdapter` | Drizzle ORM 기반 어댑터 |
| Session | JWT | 세션 저장 전략 |

**구성 파일:**
- `auth.ts` - NextAuth.js 설정
- `src/database/schema/auth.ts` - 인증 테이블 스키마

### Zod 4.3.5 (입력값 검증)

**선택 이유:**
- TypeScript 친화적인 스키마 정의
- 런타임 검증과 타입 추론 동시 지원
- API 요청 데이터 검증에 최적화

**주요 활용:**
| 용도 | 파일 | 설명 |
|------|------|------|
| 트레이딩 검증 | `src/lib/validations/trading.ts` | 계좌 생성/수정, 주문 생성 스키마 |

**검증 예시:**
- 계좌 생성 시 ticker, strategy, seedCapital, stopLossDays 검증
- 주문 생성 시 orderType, tierNumber, price, quantity 검증
- 티어 보유현황 수정 시 수량, 매수가, 보유일수 검증

### Decimal.js 10.6.0 (정밀 연산)

**선택 이유:**
- JavaScript 부동소수점 오차 방지
- 투자 알고리즘의 정확한 가격/수량 계산 필수
- 소수점 버림/올림 등 정밀 제어

**주요 활용:**
| 용도 | 설명 |
|------|------|
| 매수/매도가 계산 | 전일종가 × (1 + 임계값) |
| 수량 계산 | 티어 배분금액 ÷ 매수가 (버림) |
| 체결 판정 | LOC/MOC 주문 체결 여부 |

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

### Drizzle ORM 0.45.1

**선택 이유:**
- **타입 안전성**: TypeScript 네이티브 ORM으로 완벽한 타입 추론
- **경량**: 런타임 오버헤드 최소화
- **SQL 친화적**: SQL에 가까운 직관적인 쿼리 빌더
- **마이그레이션**: Drizzle Kit으로 스키마 관리

**주요 기능 활용:**

| 기능 | 구현 | 설명 |
|------|------|------|
| 스키마 정의 | `src/database/schema/` | TypeScript로 테이블 정의 |
| 쿼리 빌더 | `db.select()`, `db.insert()` | 타입 안전한 쿼리 |
| 트랜잭션 | `db.transaction()` | 원자성 보장 |
| 마이그레이션 | `drizzle-kit` | 스키마 변경 관리 |

**Drizzle Kit 설정 (drizzle.config.ts):**
- `schema`: 스키마 파일 경로
- `out`: 마이그레이션 출력 디렉토리
- `dialect`: PostgreSQL
- `dbCredentials`: Supabase 연결 정보

### Supabase (PostgreSQL)

**선택 이유:**
- **클라우드 호스팅**: 서버 관리 없이 PostgreSQL 사용
- **무료 티어**: 개인 프로젝트에 적합한 무료 플랜
- **실시간 기능**: 필요시 실시간 구독 가능
- **인증 통합**: Auth 서비스 제공 (NextAuth.js와 별도 사용)

**주요 기능 활용:**

| 기능 | 설명 |
|------|------|
| PostgreSQL | 프로덕션 데이터베이스 |
| Connection Pooling | 연결 풀링으로 성능 최적화 |
| Row Level Security | 데이터 보안 (선택적) |

### Supabase Local (개발 환경)

**선택 이유:**
- **프로덕션 일관성**: 프로덕션과 동일한 PostgreSQL 환경에서 개발
- **Docker 기반**: 간편한 로컬 환경 설정 및 정리
- **Studio 포함**: localhost:54323에서 DB GUI 제공

**주요 기능 활용:**

| 기능 | 구현 | 설명 |
|------|------|------|
| PostgreSQL | localhost:54322 | 로컬 PostgreSQL 인스턴스 |
| Studio | localhost:54323 | 데이터베이스 GUI |
| API | localhost:54321 | Supabase API 엔드포인트 |

**로컬 환경 시작:**
```bash
npm run supabase:start   # Supabase Local 시작
npm run supabase:stop    # Supabase Local 종료
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

#### Vitest 4.0.17

**역할:** 단위 및 통합 테스트 프레임워크

**선택 이유:**
- Vite 기반으로 빠른 테스트 실행
- Jest 호환 API로 낮은 학습 곡선
- TypeScript 네이티브 지원
- 핫 모듈 리로드 지원

**주요 기능:**

| 기능 | 설명 |
|------|------|
| `vitest run` | 테스트 실행 |
| `vitest --coverage` | 커버리지 리포트 생성 |
| `vitest --ui` | UI 모드로 테스트 확인 |

**설정 (vitest.config.ts):**
- 테스트 파일 패턴: `**/*.{test,spec}.{ts,tsx}`
- 커버리지 리포터: text, html, lcov

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

#### 추가 개발 도구

**@ast-grep/cli v0.40.5**

**역할:** AST 기반 코드 검색 및 변환

**특징:**
- 구조적 코드 패턴 검색
- 정규식보다 정확한 코드 매칭
- 리팩토링 자동화 지원

**dotenv-cli v11.0.0**

**역할:** 환경 변수 파일 로드하여 스크립트 실행

**특징:**
- npm scripts에서 환경 변수 주입
- 다중 .env 파일 지원
- 개발/프로덕션 환경 분리

**sharp v0.34.5 + png-to-ico v3.0.1**

**역할:** 이미지 처리 및 파비콘 생성

**특징:**
- 고성능 이미지 변환
- PNG에서 ICO 포맷 변환
- favicon 자동 생성 스크립트 지원

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
| `test` | `vitest` | 테스트 실행 |
| `test:coverage` | `vitest run --coverage` | 커버리지 리포트 |
| `web:dev` | `next dev` | Next.js 개발 서버 |
| `web:build` | `next build` | Next.js 프로덕션 빌드 |
| `web:start` | `next start` | Next.js 프로덕션 서버 |
| `db:generate` | `drizzle-kit generate` | Drizzle 마이그레이션 파일 생성 |
| `db:push` | `drizzle-kit push` | 스키마 동기화 |
| `db:studio` | `drizzle-kit studio` | Drizzle Studio (DB GUI) |
| `supabase:start` | `supabase start` | Supabase Local 시작 |

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
- **네트워크**: Yahoo Finance API, Supabase 접근 가능

### 환경 변수

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 |
| `AUTH_SECRET` | NextAuth.js 시크릿 키 |
| `AUTH_GOOGLE_ID` | Google OAuth 클라이언트 ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth 클라이언트 시크릿 |
| `CRON_SECRET` | Vercel Cron 인증용 시크릿 토큰 |

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone https://github.com/username/buy-dip-sell-peak-system.git
cd buy-dip-sell-peak-system

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정
cp .env.example .env.local
# .env.local 파일에 필요한 환경 변수 설정

# 4. 데이터베이스 스키마 동기화
npm run db:push

# 5. 데이터베이스 초기화 (SOXL)
npm run dev init -- --ticker SOXL

# 6. 웹 개발 서버 실행
npm run web:dev

# 7. 데이터 조회
npm run dev query -- --ticker SOXL --start 2024-01-01 --end 2024-12-31
```

---

## 빌드 및 배포

### 프로덕션 빌드

```bash
# TypeScript 컴파일
npm run build

# Next.js 프로덕션 빌드
npm run web:build

# 프로덕션 실행
npm run web:start
```

### 배포 플랫폼

| 플랫폼 | 용도 | 설명 |
|--------|------|------|
| **Vercel** | 웹 호스팅 | Next.js 최적화 배포 |
| **GitHub Actions** | CI/CD | Cron 기반 자동 데이터 업데이트 |
| **Supabase** | 데이터베이스 | PostgreSQL 클라우드 호스팅 |

### Vercel (배포 플랫폼)

**선택 이유:**
- Next.js 공식 호스팅 플랫폼으로 최적화된 배포 파이프라인
- Serverless Functions로 API 라우트 자동 배포
- Edge Network를 통한 글로벌 CDN 제공

**주요 기능 활용:**

| 기능 | 설명 |
|------|------|
| Serverless Functions | API 라우트 자동 서버리스 배포 |
| Edge Network | 정적 자산 글로벌 CDN 배포 |
| Environment Variables | 프로덕션 환경 변수 관리 |

**Cron 보안 인증:**
- GitHub Actions에서 Vercel API 엔드포인트(`/api/cron/update-prices`)를 호출하여 Cron 실행
- `CRON_SECRET` 환경 변수를 통한 Bearer 토큰 인증
- Node.js `crypto.timingSafeEqual`을 사용한 타이밍 공격 방지 토큰 비교

**설정 파일 (`vercel.json`):**
- API 헤더: Cache-Control 헤더 설정

### GitHub Actions (자동화)

**선택 이유:**
- Vercel Hobby 플랜의 Cron 제한 해소
- `workflow_dispatch`를 통한 수동 실행 지원
- GitHub 네이티브 통합으로 모니터링 용이

**주요 기능 활용:**

| 기능 | 설명 |
|------|------|
| Scheduled Workflow | 매일 KST 09:30에 가격/지표 자동 업데이트 |
| Manual Dispatch | 필요 시 수동 실행 가능 |
| Secret Management | `CRON_SECRET` 시크릿 관리 |

**워크플로우 (`cron-update-prices.yml`):**
- 스케줄: `30 0 * * *` (UTC 00:30 = KST 09:30)
- 동작: Vercel 배포된 `/api/cron/update-prices` 엔드포인트 호출
- 인증: `CRON_SECRET` Bearer 토큰
- 실패 감지: HTTP 상태 코드 기반 에러 리포팅

### 배포 고려사항

1. **환경 변수**: Vercel에서 환경 변수 설정 필요 (`CRON_SECRET` 포함)
2. **데이터베이스**: Supabase 프로젝트 연결
3. **빌드 명령어**: `npm run web:build`
4. **출력 디렉토리**: `.next`

---

## 기술 선택 근거

### Drizzle ORM vs Prisma

| 기준 | Drizzle ORM | Prisma |
|------|------------|--------|
| **타입 안전성** | TypeScript 네이티브 | 코드 생성 필요 |
| **런타임 크기** | 경량 | 상대적으로 큼 |
| **SQL 친화성** | SQL에 가까운 문법 | 추상화된 문법 |
| **마이그레이션** | Drizzle Kit | Prisma Migrate |

**결론**: 경량화와 SQL 친화성을 위해 Drizzle ORM 선택

### Supabase vs 직접 PostgreSQL 호스팅

| 기준 | Supabase | 직접 호스팅 |
|------|----------|------------|
| **설정** | 즉시 사용 가능 | 서버 설정 필요 |
| **비용** | 무료 티어 제공 | 서버 비용 발생 |
| **관리** | 자동 백업/스케일링 | 직접 관리 |
| **기능** | Auth, Storage 등 추가 기능 | 순수 DB만 |

**결론**: 개인 프로젝트에 적합한 Supabase 선택

### Vitest vs Jest

| 기준 | Vitest | Jest |
|------|--------|------|
| **속도** | Vite 기반으로 빠름 | 상대적으로 느림 |
| **설정** | 최소 설정 | 복잡한 설정 |
| **TypeScript** | 네이티브 지원 | ts-jest 필요 |
| **ESM** | 네이티브 지원 | 추가 설정 필요 |

**결론**: 빠른 테스트 실행과 ESM 지원을 위해 Vitest 선택

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

- [ ] **Docker**: 컨테이너화를 통한 환경 독립성
- [x] **Vercel 배포**: Cron Jobs, Serverless Functions, Edge Network
- [x] **CI/CD**: GitHub Actions를 통한 자동 데이터 업데이트 파이프라인
- [ ] **모니터링**: Sentry 또는 LogRocket 연동
- [x] **테스트**: Vitest를 활용한 유닛/통합 테스트
- [x] **웹 UI**: React/Next.js 기반 대시보드
- [x] **인증**: NextAuth.js v5 기반 Google OAuth 로그인
- [x] **ORM**: Drizzle ORM으로 마이그레이션
- [x] **클라우드 DB**: Supabase PostgreSQL 연동

---

*마지막 업데이트: 2026년 2월*
