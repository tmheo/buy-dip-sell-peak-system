# SPEC-UI-001 구현 계획

## 구현 전략

CSS-first 접근으로 기존 컴포넌트 변경을 최소화하고, Bootstrap 유틸리티와 미디어 쿼리를 최대한 활용한다.

---

## Phase 1: CSS 기반 글로벌 개선

### Task 1.1: globals.css 모바일 미디어 쿼리 확장

**파일**: `src/styles/globals.css`

추가할 CSS 규칙:

1. TopControlBar 모바일 레이아웃
   - 768px 이하에서 버튼 그룹 줄바꿈
   - 사용자명 숨김 또는 축약

2. 인라인 폼 모바일 레이아웃
   - `info-section` 내 `d-flex justify-content-between` 수직 전환
   - 폼 입력 필드 너비 100%
   - 실행 버튼 전체 너비

3. 터치 타겟 크기 확보
   - `btn-sm` 최소 높이 44px
   - badge 터치 영역 패딩

4. 테이블 모바일/데스크톱 토글
   - 기존 `trading-mobile-card` / `trading-desktop-table` 패턴을 일반화

---

## Phase 2: 컴포넌트별 모바일 대응

### Task 2.1: TopControlBar 모바일 개선

**파일**: `src/components/TopControlBar.tsx`
**접근**: Bootstrap responsive 유틸리티 활용

- `d-none d-md-inline` 클래스로 모바일에서 사용자명 숨김
- 버튼 그룹에 `flex-wrap` 추가
- 모바일에서 버튼 크기 축소 (`d-md-none` / `d-none d-md-inline` 토글)

### Task 2.2: 인라인 폼 3개 페이지

**파일**:
- `src/app/recommend/_client.tsx`
- `src/app/backtest/_client.tsx`
- `src/app/backtest-recommend/_client.tsx`

**접근**: CSS 클래스 + 인라인 스타일 제거

- 고정 `style={{ width: "140px" }}` 제거, CSS 클래스로 대체
- `d-flex justify-content-between` → 모바일에서 `flex-column` 전환
- 폼 요소에 `w-100` 클래스 조건부 적용 (또는 CSS 미디어 쿼리)
- 실행 버튼 모바일에서 `w-100`

### Task 2.3: AccountListTable 모바일 카드 뷰

**파일**: `src/components/trading/AccountListTable.tsx`
**접근**: 기존 `trading-mobile-card` / `trading-desktop-table` 패턴 재사용

- Desktop: 기존 테이블 유지 (`trading-desktop-table`)
- Mobile: 카드 리스트 추가 (`trading-mobile-card`)
- 카드 내용: 계좌이름, 종목 badge, 전략 badge, 시드, 보유 N/M, "자세히"/"삭제" 버튼

### Task 2.4: TierHoldingsTable 모바일 카드 뷰

**파일**: `src/components/trading/TierHoldingsTable.tsx`
**접근**: 티어별 카드 형태

- Desktop: 기존 테이블 유지
- Mobile: 각 티어를 카드로 표시
- 카드 내용: 티어 번호, 비율, 매수가, 수량, 보유기간
- 보유 중인 티어 강조 (badge 색상 + 테두리)

### Task 2.5: ProfitStatusTable 모바일 최적화

**파일**: `src/components/trading/ProfitStatusTable.tsx`
**접근**: GrandTotalCard 그리드 변경 + 테이블 스크롤 가이드

- GrandTotalCard: `col` → `col-4 col-md` (모바일에서 3열, 데스크톱에서 5열)
- 상세 테이블은 `table-responsive` 유지 (11컬럼 카드 뷰는 과도한 복잡성)
- 모바일 가로 스크롤 힌트 추가 (그라데이션 오버레이)

### Task 2.6: SimilarPeriodCard 날짜 overflow

**파일**: `src/components/recommend/SimilarPeriodCard.tsx`
**접근**: CSS word-break + font-size 조정

- 날짜 범위 텍스트에 `text-break` 또는 `word-break: break-word`
- 모바일에서 날짜 형식을 축약 (YY.MM.DD) 고려

---

## 구현 순서

1. **globals.css** 미디어 쿼리 추가 (전체 기반)
2. **TopControlBar** 모바일 개선 (모든 페이지 영향)
3. **인라인 폼 3개 페이지** 동시 수정 (동일 패턴)
4. **AccountListTable** 모바일 카드 뷰
5. **TierHoldingsTable** 모바일 카드 뷰
6. **ProfitStatusTable** 모바일 최적화
7. **SimilarPeriodCard** overflow 처리

---

## 리스크 분석

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| Desktop 레이아웃 깨짐 | 높음 | 모든 CSS 변경은 미디어 쿼리 내부에만 |
| Bootstrap CDN 업데이트 시 충돌 | 낮음 | 커스텀 CSS의 specificity 유지 |
| 차트 렌더링 이슈 | 낮음 | ResponsiveContainer가 이미 처리 |
| 모바일 카드 뷰 데이터 누락 | 중간 | 카드에 모든 핵심 데이터 포함 확인 |
