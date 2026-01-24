# SPEC-TRADING-002: 구현 계획

## 추적성 태그

| 항목 | 값 |
|------|-----|
| **SPEC ID** | SPEC-TRADING-002 |
| **문서 유형** | Implementation Plan |
| **상태** | Planned |

---

## 1. 마일스톤

### Primary Goal: 데이터베이스 스키마 및 기록 로직

**목표**: 매도 체결 시 수익 기록 자동 생성

**작업 항목**:

1. **DB 스키마 추가** (`src/database/schema.ts`)
   - `profit_records` 테이블 생성 SQL 추가
   - 인덱스 생성 SQL 추가
   - INSERT/SELECT 쿼리 상수 추가

2. **타입 정의 추가** (`src/types/trading.ts`)
   - `ProfitRecord` 인터페이스 추가
   - `MonthlyProfitSummary` 인터페이스 추가
   - `ProfitStatusResponse` 인터페이스 추가

3. **수익 기록 함수 구현** (`src/database/trading.ts`)
   - `createProfitRecord()` 함수 신규 생성
   - `getProfitRecords()` 함수 신규 생성
   - `getProfitRecordsByMonth()` 함수 신규 생성
   - `processOrderExecution()` 수정 - 매도 체결 시 수익 기록 생성

**의존성**: 없음 (독립 작업)

**검증 기준**:
- [ ] profit_records 테이블 생성 확인
- [ ] 매도 체결 시 수익 기록 자동 생성 확인
- [ ] Decimal.js로 모든 금액 계산 확인
- [ ] 다중 티어 매도 시 개별 기록 생성 확인

---

### Secondary Goal: API 엔드포인트 구현

**목표**: 수익 현황 조회 API 구현

**작업 항목**:

1. **수익 조회 API 생성** (`src/app/api/trading/accounts/[id]/profits/route.ts`)
   - GET 핸들러 구현
   - 인증 및 권한 검증
   - 월별 그룹화 로직
   - 소계 및 총계 계산

2. **응답 형식 최적화**
   - 월별 내림차순 정렬 (최신 월 먼저)
   - 각 월 내 날짜 내림차순 정렬
   - 금액 소수점 2자리 고정

**의존성**: Primary Goal 완료 후

**검증 기준**:
- [ ] API 응답 형식 검증
- [ ] 인증되지 않은 요청 거부 확인
- [ ] 본인 계좌만 조회 가능 확인
- [ ] 응답 시간 500ms 이내 확인

---

### Final Goal: UI 컴포넌트 구현

**목표**: 수익 현황 테이블 UI 구현

**작업 항목**:

1. **ProfitStatusTable 컴포넌트 생성** (`src/components/trading/ProfitStatusTable.tsx`)
   - API 호출 및 상태 관리
   - 로딩/에러 상태 처리
   - 빈 데이터 상태 처리

2. **MonthSection 컴포넌트 생성** (또는 인라인 구현)
   - 월별 접기/펼치기 토글
   - 수익 기록 테이블 렌더링
   - 소계 행 렌더링

3. **상세 페이지 통합** (`src/app/trading/[accountId]/_client.tsx`)
   - ProfitStatusTable 컴포넌트 추가
   - 레이아웃 조정

**의존성**: Secondary Goal 완료 후

**검증 기준**:
- [ ] 현재 월 펼쳐진 상태로 표시
- [ ] 과거 월 접힌 상태로 표시
- [ ] 클릭 시 토글 동작 확인
- [ ] 수익: 초록색, 손실: 빨간색 표시
- [ ] Bootstrap Solar 테마 일관성

---

### Optional Goal: 성능 최적화

**목표**: 대량 데이터 처리 최적화

**작업 항목**:

1. **페이지네이션 구현** (선택)
   - 월 단위 lazy loading
   - 무한 스크롤 또는 더보기 버튼

2. **캐싱 전략** (선택)
   - React Query 또는 SWR 도입 검토
   - 클라이언트 측 캐싱

**의존성**: Final Goal 완료 후

**검증 기준**:
- [ ] 100건 이상 데이터에서 성능 저하 없음
- [ ] 스크롤 시 렌더링 지연 없음

---

## 2. 기술적 접근 방식

### 2.1 수익 기록 생성 통합

#### processOrderExecution() 수정

```typescript
// 기존 매도 체결 로직에 수익 기록 생성 추가
if (order.type === "SELL") {
  // 1. 수익 기록 생성 (티어 초기화 전에 호출)
  const holding = getTierHolding(accountId, order.tier);
  if (holding && holding.buyPrice && holding.buyDate) {
    createProfitRecord(
      accountId,
      holding,
      date,           // 매도일
      closePrice,     // 매도가 (종가)
      ticker,
      strategy
    );
  }

  // 2. 기존 티어 초기화 로직
  updateTierHolding(accountId, order.tier, {
    buyPrice: null,
    shares: 0,
    buyDate: null,
    sellTargetPrice: null,
  });
}
```

### 2.2 금액 계산 (Decimal.js)

```typescript
/**
 * 수익 기록 생성 - 모든 금융 계산은 Decimal.js 사용
 */
function createProfitRecord(
  accountId: string,
  holding: TierHolding,
  sellDate: string,
  sellPrice: number,
  ticker: Ticker,
  strategy: Strategy
): ProfitRecord {
  // 매수금액 = 매수가 × 수량 (버림)
  const buyAmount = new Decimal(holding.buyPrice!)
    .mul(holding.shares)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  // 매도금액 = 매도가 × 수량 (버림)
  const sellAmount = new Decimal(sellPrice)
    .mul(holding.shares)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  // 수익금 = 매도금액 - 매수금액 (반올림)
  const profit = new Decimal(sellAmount)
    .sub(buyAmount)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // 수익률 = (수익금 / 매수금액) × 100 (반올림)
  const profitRate = new Decimal(profit)
    .div(buyAmount)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // DB 삽입
  const id = randomUUID();
  insertProfitRecord({
    id,
    accountId,
    tier: holding.tier,
    ticker,
    strategy,
    buyDate: holding.buyDate!,
    buyPrice: holding.buyPrice!,
    buyQuantity: holding.shares,
    sellDate,
    sellPrice,
    buyAmount,
    sellAmount,
    profit,
    profitRate,
  });

  return getProfitRecordById(id);
}
```

### 2.3 월별 그룹화 로직

```typescript
/**
 * 수익 기록을 월별로 그룹화
 */
function groupProfitsByMonth(records: ProfitRecord[]): MonthlyProfitSummary[] {
  const groups = new Map<string, ProfitRecord[]>();

  for (const record of records) {
    const yearMonth = record.sellDate.substring(0, 7); // YYYY-MM
    if (!groups.has(yearMonth)) {
      groups.set(yearMonth, []);
    }
    groups.get(yearMonth)!.push(record);
  }

  // 월별 내림차순 정렬
  const sortedMonths = Array.from(groups.keys()).sort().reverse();

  return sortedMonths.map(yearMonth => {
    const monthRecords = groups.get(yearMonth)!;

    // 소계 계산 (Decimal.js 사용)
    let totalBuyAmount = new Decimal(0);
    let totalSellAmount = new Decimal(0);
    let totalProfit = new Decimal(0);

    for (const record of monthRecords) {
      totalBuyAmount = totalBuyAmount.add(record.buyAmount);
      totalSellAmount = totalSellAmount.add(record.sellAmount);
      totalProfit = totalProfit.add(record.profit);
    }

    const averageProfitRate = totalBuyAmount.isZero()
      ? 0
      : totalProfit.div(totalBuyAmount).mul(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    return {
      yearMonth,
      records: monthRecords.sort((a, b) =>
        b.sellDate.localeCompare(a.sellDate)
      ),
      totalTrades: monthRecords.length,
      totalBuyAmount: totalBuyAmount.toDecimalPlaces(2).toNumber(),
      totalSellAmount: totalSellAmount.toDecimalPlaces(2).toNumber(),
      totalProfit: totalProfit.toDecimalPlaces(2).toNumber(),
      averageProfitRate,
    };
  });
}
```

### 2.4 UI 컴포넌트 구조

```tsx
// ProfitStatusTable.tsx
export default function ProfitStatusTable({ accountId }: Props) {
  const [data, setData] = useState<ProfitStatusResponse | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProfitStatus(accountId).then(data => {
      setData(data);
      // 현재 월만 펼침
      const currentMonth = new Date().toISOString().substring(0, 7);
      setExpandedMonths(new Set([currentMonth]));
      setIsLoading(false);
    });
  }, [accountId]);

  const toggleMonth = (yearMonth: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(yearMonth)) {
        next.delete(yearMonth);
      } else {
        next.add(yearMonth);
      }
      return next;
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (!data || data.months.length === 0) return <EmptyState />;

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header">
        <h5 className="mb-0 text-info">수익 현황</h5>
      </div>
      <div className="card-body p-0">
        {data.months.map(month => (
          <MonthSection
            key={month.yearMonth}
            {...month}
            isExpanded={expandedMonths.has(month.yearMonth)}
            onToggle={() => toggleMonth(month.yearMonth)}
          />
        ))}
        <GrandTotalSection total={data.grandTotal} />
      </div>
    </div>
  );
}
```

---

## 3. 위험 및 대응 계획

### Risk 1: 기존 데이터 누락

**위험**: 기능 배포 전 매도 체결 건에 대한 수익 기록 없음

**대응**:
- 배포 시점부터 신규 기록만 생성
- (선택) 마이그레이션 스크립트로 과거 데이터 복구 검토
- 사용자에게 "이 기능은 2026-01-XX부터 기록됩니다" 안내

### Risk 2: 데이터 정합성

**위험**: 수익 기록 생성과 티어 초기화 사이 실패 시 불일치

**대응**:
- 트랜잭션으로 원자적 처리
- 수익 기록 생성 → 티어 초기화 순서 유지
- 실패 시 전체 롤백

### Risk 3: 대량 데이터 성능

**위험**: 거래 기록이 많을 경우 API 응답 지연

**대응**:
- sell_date 인덱스로 쿼리 최적화
- 필요시 페이지네이션 구현
- 월별 lazy loading 고려

---

## 4. 구현 순서

### Phase 1: 데이터 레이어 (Primary Goal)

1. `src/database/schema.ts` - 테이블/쿼리 상수 추가
2. `src/types/trading.ts` - 타입 정의 추가
3. `src/database/trading.ts` - DB 함수 구현
4. `src/database/trading.ts:processOrderExecution` - 수익 기록 생성 통합
5. 단위 테스트 작성

### Phase 2: API 레이어 (Secondary Goal)

1. `src/app/api/trading/accounts/[id]/profits/route.ts` - API 구현
2. API 통합 테스트

### Phase 3: UI 레이어 (Final Goal)

1. `src/components/trading/ProfitStatusTable.tsx` - 컴포넌트 구현
2. `src/app/trading/[accountId]/_client.tsx` - 통합
3. E2E 테스트 (수동)

---

## 5. 파일 생성/수정 체크리스트

### 수정 파일

- [ ] `src/database/schema.ts` - profit_records 테이블 추가
- [ ] `src/types/trading.ts` - ProfitRecord 타입 추가
- [ ] `src/database/trading.ts` - 수익 기록 함수 추가
- [ ] `src/app/trading/[accountId]/_client.tsx` - 컴포넌트 통합

### 신규 파일

- [ ] `src/app/api/trading/accounts/[id]/profits/route.ts` - API 엔드포인트
- [ ] `src/components/trading/ProfitStatusTable.tsx` - UI 컴포넌트

---

## 6. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-24 | manager-spec | 초기 계획 작성 |
