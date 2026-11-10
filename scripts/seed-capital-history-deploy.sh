#!/usr/bin/env bash
# 시드 이력(#116, ADR-0005) 운영 DB 배포 스크립트 - 마이그레이션 A와 배포 뒤 확인 쿼리
#
# 운영 DB에는 마이그레이션이 자동 적용되지 않는다. 사람이 아래 순서로 직접 실행한다.
#   1. bash scripts/seed-capital-history-deploy.sh check    # 지금 상태 (읽기만)
#   2. bash scripts/seed-capital-history-deploy.sh dry-run  # 마이그레이션 A를 돌려 보고 되돌린다
#   3. 일일 마감 스케줄러가 돌지 않는 시간에(KST 09:30 전후를 피한다)
#      bash scripts/seed-capital-history-deploy.sh apply    # 마이그레이션 A 적용 (한 트랜잭션)
#   4. PR 머지(배포)
#   5. bash scripts/seed-capital-history-deploy.sh verify   # 배포 뒤 확인 쿼리
#
# verify는 3과 4 사이에 옛 코드가 만든 계좌나 바꾼 시드를 잡는다. 다음 중 하나라도 있으면
# 실패로 끝나고 해당 계좌를 보인다. 사람이 고친 뒤 다시 verify한다.
#   - 시드 이력 줄이 없는 계좌 (옛 코드가 만든 계좌)
#   - 첫 줄(적용일이 가장 이른 줄)이 seed_capital과 값이 다른 계좌 (옛 코드가 바꾼 시드)
# 새 코드는 seed_capital도 첫 줄도 쓰지 않는다. 그래서 첫 줄은 apply 때의 seed_capital
# 그대로이고, 둘이 다르면 그 뒤 옛 코드가 seed_capital을 바꾼 것이다. 줄 수는 보지 않는다 -
# 옛 코드가 바꾼 뒤 verify 전에 사용자가 새 코드로 다시 바꾸면 줄이 둘이 되지만, 첫 줄은
# 여전히 옛 코드가 바꾸기 전의 값이다.
# 새 코드가 만든 계좌는 seed_capital이 비어 있어 걸리지 않는다.
#
# 접속 정보: 기본은 저장소 루트 .env.vercel의 SUPABASE_DIRECT_URL. DB_URL로 바꿀 수 있다.
# 로컬에 psql이 없으므로 기본으로 Supabase 로컬 컨테이너 안의 psql을 쓴다. PSQL로 바꿀 수 있다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261110000000_add_seed_capital_history.sql"
CONTAINER="${CONTAINER:-supabase_db_buy-dip-sell-peak-system}"

if [[ -z "${DB_URL:-}" ]]; then
  ENV_FILE="$ROOT/.env.vercel"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "오류: DB_URL이 없고 $ENV_FILE도 없습니다." >&2
    exit 1
  fi
  DB_URL="$(grep '^SUPABASE_DIRECT_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  if [[ -z "$DB_URL" ]]; then
    echo "오류: $ENV_FILE에 SUPABASE_DIRECT_URL이 없습니다." >&2
    exit 1
  fi
fi

run_psql() {
  if [[ -n "${PSQL:-}" ]]; then
    $PSQL "$DB_URL" -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i "$CONTAINER" psql "$DB_URL" -v ON_ERROR_STOP=1 "$@"
  fi
}

# 배포 뒤 확인 쿼리. 문제 계좌가 있으면 그 목록을 보이고 예외로 끝난다.
VERIFY_SQL=$(cat <<'SQL'
CREATE TEMP VIEW seed_capital_history_problems AS
SELECT a.id AS account_id, a.created_at, a.seed_capital,
  f.effective_date AS first_effective_date, f.seed_capital AS first_seed, f.rows,
  CASE WHEN f.account_id IS NULL THEN 'no history row'
       ELSE 'first row differs from seed_capital' END AS problem
FROM public.trading_accounts a
LEFT JOIN (
  SELECT DISTINCT ON (account_id) account_id, effective_date, seed_capital,
    count(*) OVER (PARTITION BY account_id) AS rows
  FROM public.seed_capital_history
  ORDER BY account_id, effective_date
) f ON f.account_id = a.id
WHERE f.account_id IS NULL
   OR (a.seed_capital IS NOT NULL AND f.seed_capital <> a.seed_capital);

SELECT * FROM seed_capital_history_problems ORDER BY created_at;

DO $$
DECLARE
  problems integer;
BEGIN
  SELECT count(*) INTO problems FROM seed_capital_history_problems;
  IF problems > 0 THEN
    RAISE EXCEPTION 'seed_capital_history verify failed: % account(s) need a fix', problems;
  END IF;
  RAISE NOTICE 'seed_capital_history verify passed';
END
$$;
SQL
)

case "${1:-}" in
  check)
    run_psql <<'SQL'
SELECT count(*) AS accounts,
       count(*) FILTER (WHERE seed_capital IS NULL) AS accounts_without_seed_capital
FROM public.trading_accounts;
SELECT to_regclass('public.seed_capital_history') AS seed_capital_history_table;
SQL
    ;;
  dry-run)
    # 한 트랜잭션 안에서 적용하고 확인한 뒤 되돌린다
    { echo "BEGIN;"; cat "$MIGRATION"; echo "$VERIFY_SQL"; echo "ROLLBACK;"; } | run_psql
    echo "dry-run 완료: 적용과 확인이 통과했고 모두 되돌렸습니다."
    ;;
  apply)
    run_psql -1 < "$MIGRATION"
    echo "마이그레이션 A 적용 완료. 이어서 PR을 머지하고 verify를 실행하세요."
    ;;
  verify)
    echo "$VERIFY_SQL" | run_psql
    ;;
  *)
    echo "사용법: bash $0 check|dry-run|apply|verify" >&2
    exit 1
    ;;
esac
