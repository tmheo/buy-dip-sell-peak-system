#!/usr/bin/env bash
# Local Supabase -> Cloud Supabase 데이터 이관 스크립트
# 사용법: CLOUD_DB_URL="postgresql://..." ./scripts/migrate-to-cloud.sh
# 참고: chmod +x scripts/migrate-to-cloud.sh 로 실행 권한을 부여해야 합니다.
set -euo pipefail

# ============================================================
# 설정
# ============================================================
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DUMP_FILE="./data/local-supabase-dump.sql"
TABLES=("daily_prices" "daily_metrics" "recommendation_cache")

# Cloud DB URL 필수 확인
if [[ -z "${CLOUD_DB_URL:-}" ]]; then
  echo "오류: CLOUD_DB_URL 환경변수가 설정되지 않았습니다."
  echo "사용법: CLOUD_DB_URL=\"postgresql://user:pass@host:port/db\" $0"
  exit 1
fi

# ============================================================
# 1단계: data/ 디렉토리 생성
# ============================================================
echo "============================================================"
echo "1단계: data/ 디렉토리 확인 및 생성"
echo "============================================================"
mkdir -p ./data
echo "  -> data/ 디렉토리 준비 완료"

# ============================================================
# 2단계: 로컬 DB에서 pg_dump (데이터만)
# ============================================================
echo ""
echo "============================================================"
echo "2단계: 로컬 Supabase에서 데이터 덤프"
echo "============================================================"

TABLE_ARGS=""
for table in "${TABLES[@]}"; do
  TABLE_ARGS="${TABLE_ARGS} --table=${table}"
done

echo "  -> 대상 테이블: ${TABLES[*]}"
echo "  -> 덤프 파일: ${DUMP_FILE}"

pg_dump \
  --data-only \
  --no-owner \
  --no-privileges \
  ${TABLE_ARGS} \
  "${LOCAL_DB_URL}" > "${DUMP_FILE}"

echo "  -> 덤프 완료 ($(wc -c < "${DUMP_FILE}" | tr -d ' ') bytes)"

# ============================================================
# 3단계: Cloud DB로 데이터 임포트
# ============================================================
echo ""
echo "============================================================"
echo "3단계: Cloud Supabase로 데이터 임포트"
echo "============================================================"

psql "${CLOUD_DB_URL}" < "${DUMP_FILE}"
echo "  -> 임포트 완료"

# ============================================================
# 4단계: Row Count 검증
# ============================================================
echo ""
echo "============================================================"
echo "4단계: 테이블별 행 수 검증"
echo "============================================================"

VERIFICATION_FAILED=0

for table in "${TABLES[@]}"; do
  LOCAL_COUNT=$(psql "${LOCAL_DB_URL}" -t -A -c "SELECT COUNT(*) FROM ${table};")
  CLOUD_COUNT=$(psql "${CLOUD_DB_URL}" -t -A -c "SELECT COUNT(*) FROM ${table};")

  if [[ "${LOCAL_COUNT}" -eq "${CLOUD_COUNT}" ]]; then
    echo "  [OK] ${table}: 로컬=${LOCAL_COUNT}, 클라우드=${CLOUD_COUNT}"
  else
    echo "  [실패] ${table}: 로컬=${LOCAL_COUNT}, 클라우드=${CLOUD_COUNT} (불일치!)"
    VERIFICATION_FAILED=1
  fi
done

# ============================================================
# 5단계: 샘플 데이터 검증
# ============================================================
echo ""
echo "============================================================"
echo "5단계: daily_prices 최신 3건 샘플 비교"
echo "============================================================"

echo ""
echo "  [로컬 DB]"
psql "${LOCAL_DB_URL}" -c \
  "SELECT ticker, date, close FROM daily_prices ORDER BY date DESC LIMIT 3;"

echo ""
echo "  [클라우드 DB]"
psql "${CLOUD_DB_URL}" -c \
  "SELECT ticker, date, close FROM daily_prices ORDER BY date DESC LIMIT 3;"

# ============================================================
# 결과
# ============================================================
echo ""
echo "============================================================"
if [[ "${VERIFICATION_FAILED}" -eq 1 ]]; then
  echo "검증 실패: 로컬과 클라우드 데이터 행 수가 일치하지 않습니다."
  echo "덤프 파일(${DUMP_FILE})을 확인한 후 재시도해 주세요."
  echo "============================================================"
  exit 1
else
  echo "이관 완료: 모든 테이블 검증 통과!"
  echo "============================================================"
  exit 0
fi
