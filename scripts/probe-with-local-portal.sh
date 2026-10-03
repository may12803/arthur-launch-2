#!/bin/bash
# Start the portal locally against the bar7-isolation Supabase branch, run the isolation probe
# against it, then stop the server. Branch URL and anon key come from run-probe-on-branch.sh so
# no secret is printed or duplicated.
#   scripts/probe-with-local-portal.sh [port]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3917}"
eval "$(grep -E '^export PROBE_(URL|ANON_KEY)=' scripts/run-probe-on-branch.sh)"
NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL="$PROBE_URL" \
NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY="$PROBE_ANON_KEY" \
NEXT_PUBLIC_SUPABASE_LOVELEEDAY_PUBLISHABLE_KEY="$PROBE_ANON_KEY" \
  npx next dev -p "$PORT" > /tmp/bar7-portal-dev.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null' EXIT
for _ in $(seq 1 90); do
  curl -s -o /dev/null "http://localhost:$PORT/client/login" && break
  sleep 2
done
bash scripts/run-probe-on-branch.sh "http://localhost:$PORT"
