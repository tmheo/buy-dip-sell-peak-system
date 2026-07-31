/**
 * DB 통합 테스트 게이트 (#66)
 *
 * DATABASE_URL이 없는 환경(로컬 단위 테스트)에서는 DB 통합 테스트를 건너뛴다.
 * 단, CI는 서비스 컨테이너로 DATABASE_URL을 반드시 주입하므로, 누락되면
 * 조용히 건너뛰어 초록불이 되는 대신 즉시 실패시켜 연결 문제를 드러낸다.
 */
export const hasDb = Boolean(process.env.DATABASE_URL);

if (!hasDb && process.env.CI) {
  throw new Error(
    "CI에서는 DATABASE_URL이 필요합니다. DB 통합 테스트가 조용히 건너뛰어지는 것을 막기 위해 실패 처리합니다."
  );
}
