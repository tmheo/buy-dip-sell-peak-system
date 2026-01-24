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
 * 현재 연도의 1월 1일을 YYYY-MM-DD 형식으로 반환
 */
export function getYearStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}
