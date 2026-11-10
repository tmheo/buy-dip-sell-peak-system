#!/usr/bin/env bash
# 계좌 seed_capital 칸 삭제(#120) 운영 DB 배포 스크립트
# supabase/migrations/20261111000000_drop_trading_accounts_seed_capital.sql과 적용 뒤 확인 쿼리
#
# 이 칸은 시드 이력 도입(20261110000000_add_seed_capital_history.sql, #116)을 되돌릴 때를 대비해
# 남겨 둔 칸이다. 시드 이력 마이그레이션은 2026-11-10에 운영 DB에 적용했다.
# 시드 이력이 그 뒤 한동안 문제없이 돈 것을 확인한 뒤에만 칸을 지운다 - 칸을 지우면 #116 이전
# 배포로 되돌릴 수 없다.
#
# 운영 DB에는 마이그레이션이 자동 적용되지 않는다. 사람이 아래 순서로 직접 실행한다.
#   1. PR 머지 뒤 Vercel 운영 배포가 끝나, 칸을 지운 코드가 지금 서비스되고 있는지 확인한다
#   2. bash scripts/drop-seed-capital-deploy.sh check    # 지금 상태 (읽기만)
#   3. 일일 마감 스케줄러가 돌지 않는 시간에(KST 09:30 전후를 피한다)
#      bash scripts/drop-seed-capital-deploy.sh dry-run  # 마이그레이션을 돌려 보고 되돌린다
#   4. 같은 시간대에
#      bash scripts/drop-seed-capital-deploy.sh apply --confirm-deployed  # 적용 (한 트랜잭션)
#   5. bash scripts/drop-seed-capital-deploy.sh verify   # 적용 뒤 확인 쿼리
#
# dry-run과 apply는 칸을 지우면서 trading_accounts에 가장 강한 잠금(ACCESS EXCLUSIVE)을 잡고
# 트랜잭션이 끝날 때까지 놓지 않는다. dry-run도 ROLLBACK 전까지 잠그므로 둘 다 스케줄러 시간을
# 피한다. 잠금을 5초 안에 얻지 못하면 기다리지 않고 실패한다(lock_timeout) - 기다리는 동안 다른
# 조회까지 막히지 않게 한다.
#
# 머지 전 코드는 drizzle 스키마의 모든 칸을 SQL에 적는다. 계좌를 만들 때(createTradingAccount의
# insert는 넣지 않는 칸까지 default로 적는다)와 계좌를 지울 때(deleteTradingAccount의 .returning())
# seed_capital이 들어가므로, 칸을 먼저 지우면 계좌 생성과 삭제가 실패한다. 그래서 머지한 코드가
# 운영에 나간 뒤에 적용하고, apply 뒤에는 이 PR 이전 배포로 되돌리지 않는다.
#
# check와 verify는 시드 이력 줄이 없는 계좌를 보인다. 그런 계좌가 있으면 마이그레이션은 칸을
# 지우지 않고 실패한다 - 칸을 지우면 그 계좌의 시드를 되살릴 곳이 없다. 사람이 이력을 채운 뒤
# 다시 dry-run부터 한다.
#
# 접속 정보와 psql은 scripts/lib/prod-psql.sh를 따른다 (DB_URL, PSQL, CONTAINER).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$SCRIPT_DIR/../supabase/migrations/20261111000000_drop_trading_accounts_seed_capital.sql"
USAGE="사용법: bash $0 check|dry-run|apply --confirm-deployed|verify"

MODE="${1:-}"
case "$MODE" in
  check | dry-run | apply | verify) ;;
  *)
    echo "$USAGE" >&2
    exit 1
    ;;
esac

# shellcheck source=SCRIPTDIR/lib/prod-psql.sh
source "$SCRIPT_DIR/lib/prod-psql.sh"

# 이 세션에서 쓰는 확인용 뷰. 임시 뷰라 세션이 끝나면 사라진다.
VIEWS_SQL=$(
  cat <<'SQL'
-- 시드 이력 줄이 없는 계좌
CREATE TEMP VIEW accounts_without_seed_history AS
SELECT a.id AS account_id, a.created_at
FROM public.trading_accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.seed_capital_history h WHERE h.account_id = a.id
);

-- 계좌에 seed_capital 칸이 남아 있는지
CREATE TEMP VIEW seed_capital_column AS
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trading_accounts'
    AND column_name = 'seed_capital'
) AS seed_capital_column_exists;
SQL
)

# 적용 뒤 확인 쿼리. 칸이 남아 있거나 시드 이력 줄이 없는 계좌가 있으면 예외로 끝난다.
VERIFY_SQL=$(
  cat <<'SQL'
SELECT * FROM pg_temp.accounts_without_seed_history ORDER BY created_at;

DO $$
DECLARE
  missing integer;
BEGIN
  IF (SELECT seed_capital_column_exists FROM pg_temp.seed_capital_column) THEN
    RAISE EXCEPTION 'drop seed_capital verify failed: trading_accounts.seed_capital still exists';
  END IF;
  SELECT count(*) INTO missing FROM pg_temp.accounts_without_seed_history;
  IF missing > 0 THEN
    RAISE EXCEPTION 'drop seed_capital verify failed: % account(s) have no seed_capital_history row', missing;
  END IF;
  RAISE NOTICE 'drop seed_capital verify passed';
END
$$;
SQL
)

# 칸을 지우는 트랜잭션의 첫 문장
LOCK_TIMEOUT_SQL="SET LOCAL lock_timeout = '5s';"

warn_scheduler_window() {
  echo "주의: trading_accounts를 트랜잭션 끝까지 잠급니다. 일일 마감 스케줄러 시간(KST 09:30 전후)을 피하세요." >&2
}

case "$MODE" in
  check)
    { echo "$VIEWS_SQL"
      echo "SELECT count(*) AS accounts FROM public.trading_accounts;"
      echo "SELECT * FROM pg_temp.seed_capital_column;"
      echo "SELECT * FROM pg_temp.accounts_without_seed_history ORDER BY created_at;"; } | run_psql -q
    ;;
  dry-run)
    warn_scheduler_window
    # 한 트랜잭션 안에서 적용하고 확인한 뒤 되돌린다
    { echo "BEGIN;"
      echo "$LOCK_TIMEOUT_SQL"
      echo "$VIEWS_SQL"
      cat "$MIGRATION"
      echo "$VERIFY_SQL"
      echo "ROLLBACK;"; } | run_psql -q
    echo "dry-run 완료: 적용과 확인이 통과했고 모두 되돌렸습니다."
    ;;
  apply)
    cat >&2 <<'MSG'
apply 전에 확인하세요.
  - 칸을 지운 코드(#120)가 Vercel 운영 배포로 나가 지금 서비스되고 있다.
    머지만 하고 배포가 끝나기 전에 적용하면, 아직 도는 옛 코드의 계좌 생성과 삭제가 실패한다.
  - 시드 이력(#116, 2026-11-10 운영 DB 적용)이 그 뒤 한동안 문제없이 돌았다.
    칸을 지우면 #116 이전 배포로 되돌릴 수 없다.
  - 일일 마감 스케줄러 시간(KST 09:30 전후)이 아니다.
  - 같은 시간대에 dry-run이 통과했다.
MSG
    if [[ "${2:-}" != "--confirm-deployed" ]]; then
      echo "모두 확인했으면 다시 실행하세요: bash $0 apply --confirm-deployed" >&2
      exit 1
    fi
    warn_scheduler_window
    # 적용하고 같은 트랜잭션 안에서 확인한다 - 확인이 실패하면 적용도 되돌린다
    { echo "BEGIN;"
      echo "$LOCK_TIMEOUT_SQL"
      echo "$VIEWS_SQL"
      cat "$MIGRATION"
      echo "$VERIFY_SQL"
      echo "COMMIT;"; } | run_psql -q
    echo "적용 완료: seed_capital 칸을 지웠습니다. 이어서 verify를 실행하세요."
    ;;
  verify)
    { echo "$VIEWS_SQL"; echo "$VERIFY_SQL"; } | run_psql -q
    ;;
esac
