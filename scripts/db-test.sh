#!/usr/bin/env bash
# DB test harness for the LOVELEEDAY portal schema. Builds a scratch Postgres 14 cluster in a temp dir (unix socket only, free port),
# stubs the Supabase-only pieces (scripts/db-test-stubs.sql), applies the base + connector migrations (twice, to prove idempotency),
# runs supabase/loveleeday/__tests__/*.sql, proves the RLS test can fail by mutating one policy, then tears everything down.
# Never touches a real Supabase project. Exit code is non-zero on any FAIL or unexpected SQL error.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/loveleeday"
TESTS="$MIG/__tests__"
BIN="${PGBIN:-/opt/homebrew/bin}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/lld-dbtest.XXXXXX")"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
DB=lld_test
FAILS=0
PASSES=0

cleanup() {
  "$BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

psqlq() { "$BIN/psql" -X -q -t -A -h "$TMP" -p "$PORT" -U postgres -d "$DB" "$@" 2>&1; }

# Prints PASS/FAIL lines from psql output; any other ERROR line is an unexpected SQL error and counts as a failure.
report() {
  local line
  while IFS= read -r line; do
    line="${line#psql:*NOTICE:  }"
    case "$line" in
      PASS:*) echo "$line"; PASSES=$((PASSES + 1)) ;;
      FAIL:*) echo "$line"; FAILS=$((FAILS + 1)) ;;
      *ERROR:*|*FATAL:*) echo "FAIL: unexpected SQL error in ${CURRENT:-setup}: ${line#*ERROR:  }"; FAILS=$((FAILS + 1)) ;;
    esac
  done
}

"$BIN/initdb" -D "$TMP/data" -U postgres --auth=trust -E UTF8 --no-locale >/dev/null 2>"$TMP/initdb.err" || { cat "$TMP/initdb.err"; echo "FAIL: initdb"; exit 1; }
"$BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null || { cat "$TMP/pg.log"; echo "FAIL: pg_ctl start"; exit 1; }
"$BIN/createdb" -h "$TMP" -p "$PORT" -U postgres "$DB" || { echo "FAIL: createdb"; exit 1; }
echo "scratch cluster: $("$BIN/psql" -X -t -A -h "$TMP" -p "$PORT" -U postgres -d "$DB" -c 'show server_version') on port $PORT (temp dir removed on exit)"

out="$(psqlq -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-test-stubs.sql")" || { echo "$out"; echo "FAIL: stubs did not apply"; exit 1; }
echo "PASS: stubs applied (roles, auth, vault, extensions)"; PASSES=$((PASSES + 1))

for f in "$MIG"/20261005_00_*.sql "$MIG"/20261005_10_*.sql "$MIG"/20261005_11_*.sql; do
  name="$(basename "$f")"
  out="$(psqlq -v ON_ERROR_STOP=1 -1 -f "$f")" || { echo "$out" | tail -5; echo "FAIL: migration $name did not apply on an empty database"; FAILS=$((FAILS + 1)); echo "RESULT: $PASSES passed, $FAILS failed"; exit 1; }
  echo "PASS: applied $name to an empty database"; PASSES=$((PASSES + 1))
done
for f in "$MIG"/20261005_00_*.sql "$MIG"/20261005_10_*.sql "$MIG"/20261005_11_*.sql; do
  name="$(basename "$f")"
  out="$(psqlq -v ON_ERROR_STOP=1 -1 -f "$f")" || { echo "$out" | tail -5; echo "FAIL: migration $name is not idempotent (second apply failed)"; FAILS=$((FAILS + 1)); continue; }
  echo "PASS: re-applied $name (idempotent)"; PASSES=$((PASSES + 1))
done

for f in "$TESTS"/*.sql; do
  name="$(basename "$f")"; CURRENT="$name"
  [ "$name" = "00_fixtures.sql" ] && { report < <(psqlq -v ON_ERROR_STOP=1 -f "$f"); continue; }
  report < <(psqlq -v ON_ERROR_STOP=0 -f "$f")
done

# Prove the isolation test can fail: swap one member policy for using (true), expect FAIL lines, then restore and expect none.
RLS="$TESTS/10_rls_isolation.sql"
psqlq -v ON_ERROR_STOP=1 -c "drop policy tenant_connections_member_select on public.tenant_connections; create policy tenant_connections_member_select on public.tenant_connections for select using (true);" >/dev/null
mut="$(psqlq -v ON_ERROR_STOP=0 -f "$RLS" | sed -E 's/^psql:[^ ]+ NOTICE:  //' | grep '^FAIL:.*tenant_connections' || true)"
psqlq -v ON_ERROR_STOP=1 -c "drop policy tenant_connections_member_select on public.tenant_connections; create policy tenant_connections_member_select on public.tenant_connections for select using (public.is_tenant_member(tenant_id));" >/dev/null
if [ -n "$mut" ]; then
  echo "PASS: mutation caught: with tenant_connections_member_select = using (true) the RLS test reports -> $(echo "$mut" | head -1)"; PASSES=$((PASSES + 1))
else
  echo "FAIL: mutation NOT caught: the RLS test stayed green with using (true) on tenant_connections"; FAILS=$((FAILS + 1))
fi
after="$(psqlq -v ON_ERROR_STOP=0 -f "$RLS" | sed -E 's/^psql:[^ ]+ NOTICE:  //' | grep -c '^FAIL' || true)"
if [ "${after:-1}" = "0" ]; then echo "PASS: policy restored, RLS test green again"; PASSES=$((PASSES + 1)); else echo "FAIL: RLS test still failing after the policy was restored"; FAILS=$((FAILS + 1)); fi

echo "RESULT: $PASSES passed, $FAILS failed"
[ "$FAILS" -eq 0 ]
