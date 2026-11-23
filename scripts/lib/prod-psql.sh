# shellcheck shell=bash
# 운영 DB 배포 스크립트가 함께 쓰는 접속 정보와 psql 실행 (scripts/*-deploy.sh에서 source 한다)
#
# 접속 정보: 기본은 저장소 루트 .env.vercel의 SUPABASE_DIRECT_URL. DB_URL로 바꿀 수 있다.
# 로컬에 psql이 없으므로 기본으로 Supabase 로컬 컨테이너(CONTAINER) 안의 psql을 쓴다.
# PSQL에 psql 실행 파일 경로를 주면 그것을 쓴다.
#
# source 하면 DB_URL을 정하고 run_psql을 정의한다. 접속 정보가 없으면 끝낸다.

PROD_PSQL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -z "${DB_URL:-}" ]]; then
  PROD_PSQL_ENV_FILE="$PROD_PSQL_ROOT/.env.vercel"
  if [[ ! -f "$PROD_PSQL_ENV_FILE" ]]; then
    echo "오류: DB_URL이 없고 ${PROD_PSQL_ENV_FILE}도 없습니다." >&2
    exit 1
  fi
  DB_URL="$(grep '^SUPABASE_DIRECT_URL=' "$PROD_PSQL_ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  if [[ -z "$DB_URL" ]]; then
    echo "오류: ${PROD_PSQL_ENV_FILE}에 SUPABASE_DIRECT_URL이 없습니다." >&2
    exit 1
  fi
fi

if [[ -n "${PSQL:-}" ]]; then
  PROD_PSQL_CMD=("$PSQL")
else
  PROD_PSQL_CMD=(docker exec -i "${CONTAINER:-supabase_db_buy-dip-sell-peak-system}" psql)
fi

# 오류가 나면 바로 멈추는 psql. SQL은 표준 입력으로 받는다.
run_psql() {
  "${PROD_PSQL_CMD[@]}" "$DB_URL" -v ON_ERROR_STOP=1 "$@"
}
