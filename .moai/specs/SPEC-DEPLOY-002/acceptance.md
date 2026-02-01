# SPEC-DEPLOY-002 인수 조건

## 기능 테스트

### AC-001: 가격 데이터 레이어

| 조건 | 기대 결과 | 검증 방법 |
|------|----------|----------|
| `insertDailyPrices` 호출 | 데이터 삽입 성공 | DB 조회 |
| `getLatestDate` 호출 | 최신 날짜 반환 | API 테스트 |
| `getPriceRange` 호출 | 기간 데이터 반환 | API 테스트 |
| 중복 삽입 시도 | onConflictDoNothing 동작 | 에러 없음 확인 |

### AC-002: 기술지표 레이어

| 조건 | 기대 결과 | 검증 방법 |
|------|----------|----------|
| `insertMetrics` 호출 | 지표 저장 성공 | DB 조회 |
| `getMetricsByDate` 호출 | 특정 일자 지표 반환 | API 테스트 |
| `getMetricsRange` 호출 | 기간 지표 반환 | API 테스트 |

### AC-003: 추천 캐시 레이어

| 조건 | 기대 결과 | 검증 방법 |
|------|----------|----------|
| `getCachedRecommendation` 호출 | 캐시 데이터 반환 | API 테스트 |
| `cacheRecommendation` 호출 | 캐시 저장/업데이트 | DB 조회 |
| 캐시 미스 | null 반환 | 빈 결과 확인 |

### AC-004: 트레이딩 레이어

| 조건 | 기대 결과 | 검증 방법 |
|------|----------|----------|
| 계좌 생성 | ID 반환 | API 테스트 |
| 계좌 목록 조회 | 사용자별 목록 | API 테스트 |
| 티어 보유 조회 | 정렬된 목록 | API 테스트 |
| 주문 생성 | 트랜잭션 성공 | DB 조회 |
| 주문 체결 | 보유 현황 업데이트 | DB 조회 |
| 수익 기록 | profit_records 저장 | DB 조회 |

### AC-005: Auth.js 어댑터

| 조건 | 기대 결과 | 검증 방법 |
|------|----------|----------|
| Google 로그인 | 사용자 생성 | users 테이블 확인 |
| 세션 생성 | 세션 토큰 발급 | sessions 테이블 확인 |
| 로그아웃 | 세션 삭제 | sessions 테이블 확인 |
| 재로그인 | 기존 사용자 연결 | user_id 확인 |

### AC-006: API 라우트

| 엔드포인트 | 기대 결과 | 검증 방법 |
|-----------|----------|----------|
| GET /api/backtest | 백테스트 결과 | HTTP 200 |
| GET /api/recommend | 추천 결과 | HTTP 200 |
| GET /api/trading/accounts | 계좌 목록 | HTTP 200 |
| POST /api/trading/accounts | 계좌 생성 | HTTP 201 |
| GET /api/trading/accounts/[id]/orders | 주문 목록 | HTTP 200 |
| GET /api/trading/accounts/[id]/holdings | 보유 현황 | HTTP 200 |

---

## 비기능 테스트

### 성능

| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| API 응답 시간 | < 500ms (p95) | 부하 테스트 |
| 대량 삽입 | 1000건/초 | 벤치마크 |

### 안정성

| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| 트랜잭션 롤백 | 에러 시 롤백 | 실패 시나리오 |
| 연결 풀 | 연결 고갈 없음 | 동시 요청 |

### 타입 안전성

| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| TypeScript 에러 | 0개 | `tsc --noEmit` |
| Drizzle 타입 추론 | 자동 완성 | IDE 확인 |

---

## 회귀 테스트

- [ ] 기존 테스트 슈트 100% 통과
- [ ] 백테스트 결과 동일 (데이터 일관성)
- [ ] 추천 알고리즘 결과 동일
- [ ] 트레이딩 시뮬레이션 결과 동일

---

## 산출물 체크리스트

- [ ] `src/database/prices.ts` Drizzle 변환 완료
- [ ] `src/database/metrics.ts` Drizzle 변환 완료
- [ ] `src/database/recommend-cache.ts` Drizzle 변환 완료
- [ ] `src/database/trading.ts` Drizzle 변환 완료
- [ ] `src/lib/auth.ts` DrizzleAdapter 적용
- [ ] `src/lib/auth-adapter.ts` 삭제
- [ ] 모든 API 라우트 async/await 적용
- [ ] 테스트 업데이트 완료
