#!/bin/bash
# End-to-end TEST-MODE billing proof against a local portal: Checkout Session via the real route, test card in Stripe's
# hosted page, real Stripe event delivery through `stripe listen`, then a SQL readback of tenant_subscriptions.
# Needs a throwaway tenant (slug billing-e2e-throwaway) with the QA login as admin. Prints no secrets.
#   arthur-cred run --use stripe,loveleeday-connectors-server,loveleeday-portal-qa,supabase -- bash scripts/billing-e2e.sh
set -u
cd "$(dirname "$0")/.." || exit 1
PORT=3418
[ "${STRIPE_SECRET_KEY#sk_test_}" != "$STRIPE_SECRET_KEY" ] || { echo "refusing: not a test key"; exit 2; }
export NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL="$(grep 'NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL' fly.toml | awk -F'"' '{print $2}')"
export NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY="$(grep 'NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY' fly.toml | awk -F'"' '{print $2}')"
export STRIPE_WEBHOOK_SECRET="$(stripe listen --print-secret --api-key "$STRIPE_SECRET_KEY")"
export STRIPE_MODE=test
stripe listen --api-key "$STRIPE_SECRET_KEY" --forward-to "localhost:$PORT/api/stripe/webhook" >/private/tmp/claude-501/stripe-listen.log 2>&1 &
LISTEN=$!
PORTAL_ORIGIN="http://localhost:$PORT" npx next dev -p $PORT >/private/tmp/claude-501/billing-dev.log 2>&1 &
DEV=$!
trap 'kill $LISTEN $DEV 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "localhost:$PORT/client/login" && break; sleep 2; done
PORTAL_BASE="http://localhost:$PORT" node scripts/billing-e2e.mjs
echo "e2e exit=$?"
