# SPEC-DEPLOY-001: Supabase 인프라 및 ORM 기반 구축

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-DEPLOY-001 |
| **제목** | Supabase 인프라 및 Drizzle ORM 기반 구축 |
| **상태** | Completed |
| **우선순위** | High |
| **생성일** | 2026-02-02 |
| **라이프사이클** | spec-anchored |
| **관련 SPEC** | SPEC-DEPLOY-002, SPEC-DEPLOY-003 |

---

## 1. 환경 (Environment)

### 1.1 기술 스택

| 구성요소 | 현재 | 변경 후 |
|----------|------|---------|
| 데이터베이스 (개발) | SQLite (better-sqlite3) | Supabase Local (Docker PostgreSQL) |
| 데이터베이스 (프로덕션) | N/A | Supabase Cloud PostgreSQL |
| ORM | 없음 (Raw SQL) | Drizzle ORM |
| 타입 안전성 | 수동 | Drizzle 타입 추론 |

### 1.2 신규 도입 패키지

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `drizzle-orm` | ^0.38.x | 타입 안전 ORM |
| `drizzle-kit` | ^0.30.x | 마이그레이션 도구 |
| `@supabase/supabase-js` | ^2.x | Supabase 클라이언트 (선택) |
| `postgres` | ^3.x | PostgreSQL 드라이버 |
| `dotenv` | ^16.x | 환경변수 로딩 |

### 1.3 영향받는 파일

| 파일 | 역할 | 수정 범위 |
|------|------|----------|
| `src/database/db.ts` | DB 연결 설정 | 전체 재작성 |
| `src/database/schema.ts` | **신규** Drizzle 스키마 정의 | 신규 생성 |
| `drizzle.config.ts` | **신규** Drizzle 설정 | 신규 생성 |
| `supabase/config.toml` | **신규** Supabase Local 설정 | 신규 생성 |
| `.env.local` | 환경변수 | 수정 |
| `.env.example` | **신규** 환경변수 템플릿 | 신규 생성 |

### 1.4 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                        개발 환경                             │
├─────────────────────────────────────────────────────────────┤
│  Next.js App                                                │
│       │                                                     │
│       ▼                                                     │
│  Drizzle ORM (postgres dialect)                             │
│       │                                                     │
│       ▼                                                     │
│  Supabase Local (Docker)                                    │
│  ├── PostgreSQL (localhost:54322)                           │
│  ├── Auth (localhost:54321)                                 │
│  └── Studio (localhost:54323)                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       프로덕션 환경                          │
├─────────────────────────────────────────────────────────────┤
│  Vercel                                                     │
│       │                                                     │
│       ▼                                                     │
│  Drizzle ORM (postgres dialect)                             │
│       │                                                     │
│       ▼                                                     │
│  Supabase Cloud                                             │
│  └── PostgreSQL (xxx.supabase.co:5432)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 가정 (Assumptions)

### 2.1 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 | 오류 시 영향 |
|----|------|--------|------|-------------|
| A1 | 로컬 개발 시 Docker가 설치되어 있다 | High | macOS 개발 환경 | Supabase Local 불가 |
| A2 | 개발/프로덕션 환경은 동일한 스키마를 사용한다 | High | 코드 일관성 | 환경별 버그 |
| A3 | Supabase 무료 티어(500MB)가 데이터에 충분하다 | Medium | 현재 SQLite 크기 추정 | 유료 플랜 필요 |

### 2.2 기술 가정

| ID | 가정 | 신뢰도 | 근거 | 검증 방법 |
|----|------|--------|------|----------|
| T1 | Drizzle ORM은 SQLite와 PostgreSQL 모두 지원한다 | High | 공식 문서 | POC 테스트 |
| T2 | Supabase Local은 프로덕션과 동일한 스키마를 지원한다 | High | Supabase 문서 | 마이그레이션 테스트 |
| T3 | better-sqlite3 의존성은 프로덕션에서 제거 가능하다 | Medium | 빌드 분석 | 빌드 테스트 |

---

## 3. 요구사항 (Requirements)

### 3.1 기능적 요구사항

#### REQ-001: Supabase Local 개발 환경 구성

**[Ubiquitous]** 시스템은 로컬 개발 환경에서 Supabase Local (Docker 기반)을 사용하여 PostgreSQL 데이터베이스에 연결해야 한다.

**인수 조건**:
- `supabase start` 명령으로 로컬 환경 시작 가능
- PostgreSQL Studio (localhost:54323)에서 데이터 확인 가능
- `.env.local`에서 DATABASE_URL 환경변수로 연결

#### REQ-002: Drizzle ORM 스키마 정의

**[Ubiquitous]** 시스템은 Drizzle ORM을 사용하여 타입 안전한 데이터베이스 스키마를 정의해야 한다.

**스키마 테이블 목록**:
| 테이블 | 용도 |
|--------|------|
| `daily_prices` | 일봉 OHLCV 데이터 |
| `daily_metrics` | 기술적 지표 |
| `recommendation_cache` | 추천 캐시 |
| `users` | Auth.js 사용자 |
| `accounts` | OAuth 계정 |
| `sessions` | 세션 |
| `verification_tokens` | 인증 토큰 |
| `trading_accounts` | 트레이딩 계좌 |
| `tier_holdings` | 티어별 보유 |
| `daily_orders` | 일일 주문 |
| `profit_records` | 수익 기록 |

**인수 조건**:
- 모든 테이블이 Drizzle 스키마로 정의됨
- TypeScript 타입이 자동 추론됨
- SQLite → PostgreSQL 타입 매핑 완료

#### REQ-003: Supabase Cloud 프로덕션 설정

**[Ubiquitous]** 시스템은 프로덕션 환경에서 Supabase Cloud PostgreSQL에 연결해야 한다.

**인수 조건**:
- Supabase 프로젝트 생성 완료
- Connection Pooler URL 확보
- RLS(Row Level Security) 정책 정의 (필요시)
- 환경변수 문서화

#### REQ-004: 환경변수 기반 DB 연결 분기

**[State-Driven]** **IF** `NODE_ENV === 'development'` **THEN** 시스템은 Supabase Local에 연결하고 **ELSE** Supabase Cloud에 연결해야 한다.

**인수 조건**:
- 단일 코드베이스로 양쪽 환경 지원
- 환경변수로 연결 URL 전환
- 연결 풀링 설정 포함

---

## 4. 기술 설계

### 4.1 Drizzle 스키마 구조

```
src/database/
├── db.ts              # Drizzle 클라이언트 초기화
├── schema.ts          # 테이블 스키마 정의
├── schema/
│   ├── prices.ts      # daily_prices, daily_metrics
│   ├── auth.ts        # users, accounts, sessions
│   ├── trading.ts     # trading_accounts, tier_holdings, orders
│   └── index.ts       # 통합 export
└── migrations/        # Drizzle Kit 마이그레이션
```

### 4.2 환경변수 설정

```env
# .env.local (개발)
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# .env.production (프로덕션 - Vercel 환경변수)
DATABASE_URL=postgresql://[user]:[password]@[host]:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://[user]:[password]@[host]:5432/postgres
```

### 4.3 Supabase Local 설정

```toml
# supabase/config.toml
[api]
enabled = true
port = 54321

[db]
port = 54322
major_version = 15

[studio]
enabled = true
port = 54323
```

---

## 5. 테스트 전략

### 5.1 단위 테스트

| 테스트 케이스 | 검증 항목 |
|--------------|----------|
| 스키마 타입 검증 | Drizzle 타입 추론 정확성 |
| 연결 분기 테스트 | 환경별 DB 연결 |
| 마이그레이션 테스트 | 스키마 생성/변경 |

### 5.2 통합 테스트

| 테스트 케이스 | 검증 항목 |
|--------------|----------|
| Supabase Local 연결 | Docker 환경 정상 동작 |
| Supabase Cloud 연결 | 프로덕션 연결 테스트 |
| CRUD 작업 | 기본 데이터 작업 |

---

## 6. 위험 요소 및 대응

| 위험 | 확률 | 영향 | 대응 방안 |
|------|------|------|----------|
| Docker 리소스 부족 | Low | Medium | 최소 4GB RAM 권장 |
| Supabase Local 버전 호환성 | Low | High | 버전 고정, 테스트 |
| PostgreSQL 문법 차이 | Medium | Medium | 표준 SQL 사용, 테스트 커버리지 |

---

## 7. 마일스톤

| 단계 | 작업 | 산출물 |
|------|------|--------|
| M1 | Supabase CLI 설치 및 초기화 | `supabase/` 디렉토리 |
| M2 | Drizzle ORM 설치 및 스키마 정의 | `src/database/schema.ts` |
| M3 | Supabase Local 연결 테스트 | 연결 성공 확인 |
| M4 | Supabase Cloud 프로젝트 생성 | 프로젝트 URL, API 키 |
| M5 | 환경변수 분기 구현 | `db.ts` 수정 |
| M6 | 마이그레이션 실행 | 테이블 생성 확인 |
