/**
 * 날짜 관련 유틸리티 함수
 */

/**
 * Date 객체를 YYYY-MM-DD 형식 문자열로 변환
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 오늘 날짜를 YYYY-MM-DD 형식으로 반환 (로컬 타임존 기준)
 */
export function getTodayDate(): string {
  return formatDateString(new Date());
}

/**
 * Date 객체를 UTC 기준 YYYY-MM-DD 형식 문자열로 변환
 */
export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 실계좌 거래일 기준의 오늘 (UTC 기준, YYYY-MM-DD)
 * 주문표 조회·계좌 상세·일일 마감이 모두 이 날짜를 오늘로 본다.
 * 로컬 타임존 기준인 getTodayDate와 다르다.
 *
 * @param now - 기준 시각 (기본값: 현재 시각)
 */
export function getTodayTradingDate(now: Date = new Date()): string {
  return formatUtcDate(now);
}

/**
 * 현재 연도의 1월 1일을 YYYY-MM-DD 형식으로 반환
 */
export function getYearStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

/**
 * 이전 거래일 계산 (주말 제외)
 * UTC 기준으로 계산하여 타임존 문제 방지
 *
 * @param date - 기준 날짜 (YYYY-MM-DD)
 * @returns 이전 거래일 (YYYY-MM-DD)
 */
export function getPreviousTradingDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);

  const day = dt.getUTCDay();
  if (day === 0) dt.setUTCDate(dt.getUTCDate() - 2); // 일요일 -> 금요일
  if (day === 6) dt.setUTCDate(dt.getUTCDate() - 1); // 토요일 -> 금요일

  return formatUtcDate(dt);
}

/**
 * 평일인지 (UTC 기준). 앞으로의 휴장일은 알 수 없으므로 실계좌는 오늘과 앞날의 거래일을
 * 평일로 어림한다 - 지난 날짜의 거래일은 가격 행으로 가린다.
 *
 * @param date - 날짜 (YYYY-MM-DD)
 */
export function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * 다음 평일 (주말만 건너뛴다 - 휴장일은 알 수 없다)
 * UTC 기준으로 계산하여 타임존 문제 방지
 *
 * @param date - 기준 날짜 (YYYY-MM-DD)
 * @returns 기준 날짜 뒤의 첫 평일 (YYYY-MM-DD)
 */
export function getNextWeekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  do {
    dt.setUTCDate(dt.getUTCDate() + 1);
  } while (!isWeekday(formatUtcDate(dt)));

  return formatUtcDate(dt);
}

/**
 * 두 날짜 사이의 거래일 수 계산 (주말 제외)
 * 시작일부터 종료일까지의 거래일 수 (시작일 포함)
 * UTC 기준으로 계산하여 타임존 문제 방지
 * 예: 월요일 시작 → 다음 월요일 종료 = 6 거래일 (월~금 + 월)
 *
 * @param startDate - 시작 날짜 (YYYY-MM-DD)
 * @param endDate - 종료 날짜 (YYYY-MM-DD)
 * @returns 거래일 수
 */
export function calculateTradingDays(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  let tradingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      tradingDays++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return tradingDays;
}
