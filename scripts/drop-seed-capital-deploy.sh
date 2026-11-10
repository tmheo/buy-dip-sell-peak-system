#!/usr/bin/env bash
# 계좌 seed_capital 칸 삭제(#120) 운영 DB 배포 스크립트 - 마이그레이션 B와 적용 뒤 확인 쿼리
#
# 운영 DB에는 마이그레이션이 자동 적용되지 않는다. 사람이 아래 순서로 직접 실행한다.
#   1. PR 머지(배포) - 칸을 지운 코드가 먼저 돌아야 한다
#   2. bash scripts/drop-seed-capital-deploy.sh check    # 지금 상태 (읽기만)
#   3. bash scripts/drop-seed-capital-deploy.sh dry-run  # 마이그레이션 B를 돌려 보고 되돌린다
#   4. 일일 마감 스케줄러가 돌지 않는 시간에(KST 09:30 전후를 피한다)
#      bash scripts/drop-seed-capital-deploy.sh apply    # 마이그레이션 B 적용 (한 트랜잭션)
#   5. bash scripts/drop-seed-capital-deploy.sh verify   # 적용 뒤 확인 쿼리
#
# 머지 전 코드는 계좌를 지울 때 돌려받는 칸에 seed_capital을 넣으므로(drizzle 스키마의 모든 칸),
# 칸을 먼저 지우면 계좌 삭제가 실패한다. 같은 까닭으로 apply 뒤에는 이 PR 이전 배포로 되돌리지 않는다.
#
# check와 verify는 시드 이력 줄이 없는 계좌를 보인다. 그런 계좌가 있으면 마이그레이션 B는 칸을
# 지우지 않고 실패한다 - 칸을 지우면 그 계좌의 시드를 되살릴 곳이 없다. 사람이 이력을 채운 뒤
# 다시 dry-run부터 한다.
#
# 접속 정보: 기본은 저장소 루트 .env.vercel의 SUPABASE_DIRECT_URL. DB_URL로 바꿀 수 있다.
# 로컬에 psql이 없으므로 기본으로 Supabase 로컬 컨테이너 안의 psql을 쓴다. PSQL로 바꿀 수 있다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261111000000_drop_trading_accounts_seed_capital.sql"
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

# 시드 이력 줄이 없는 계좌 목록
MISSING_HISTORY_SQL=$(cat <<'SQL'
SELECT a.id AS account_id, a.created_at
FROM public.trading_accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.seed_capital_history h WHERE h.account_id = a.id
)
ORDER BY a.created_at;
SQL
)

# 칸이 남아 있는지
COLUMN_SQL=$(cat <<'SQL'
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trading_accounts'
    AND column_name = 'seed_capital'
) AS seed_capital_column_exists;
SQL
)

# 적용 뒤 확인 쿼리. 칸이 남아 있거나 시드 이력 줄이 없는 계좌가 있으면 예외로 끝난다.
VERIFY_SQL=$(cat <<SQL
$MISSING_HISTORY_SQL

DO \$\$
DECLARE
  missing integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trading_accounts'
      AND column_name = 'seed_capital'
  ) THEN
    RAISE EXCEPTION 'drop seed_capital verify failed: trading_accounts.seed_capital still exists';
  END IF;
  SELECT count(*) INTO missing
    FROM public.trading_accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.seed_capital_history h WHERE h.account_id = a.id
    );
  IF missing > 0 THEN
    RAISE EXCEPTION 'drop seed_capital verify failed: % account(s) have no seed_capital_history row', missing;
  END IF;
  RAISE NOTICE 'drop seed_capital verify passed';
END
\$\$;
SQL
)

case "${1:-}" in
  check)
    { echo "SELECT count(*) AS accounts FROM public.trading_accounts;"
      echo "$COLUMN_SQL"
      echo "$MISSING_HISTORY_SQL"; } | run_psql
    ;;
  dry-run)
    # 한 트랜잭션 안에서 적용하고 확인한 뒤 되돌린다
    { echo "BEGIN;"; cat "$MIGRATION"; echo "$VERIFY_SQL"; echo "ROLLBACK;"; } | run_psql
    echo "dry-run 완료: 적용과 확인이 통과했고 모두 되돌렸습니다."
    ;;
  apply)
    run_psql -1 < "$MIGRATION"
    echo "마이그레이션 B 적용 완료. 이어서 verify를 실행하세요."
    ;;
  verify)
    echo "$VERIFY_SQL" | run_psql
    ;;
  *)
    echo "사용법: bash $0 check|dry-run|apply|verify" >&2
    exit 1
    ;;
esac
