#!/bin/sh
# Stage (not deploy) the Stripe secrets on the portal Fly app. Values come from the child env set by arthur-cred; nothing is printed.
#   arthur-cred run --use fly,stripe,stripe-loveleeday-webhook-test -- sh scripts/stripe-stage-fly-secrets.sh
# Going live: use the live key + live webhook vault file and STRIPE_MODE=live (docs/billing/go-live.md).
set -e
MODE="${STRIPE_MODE_TO_STAGE:-test}"
flyctl secrets set --stage -a arthur-online \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  STRIPE_MODE="$MODE" \
  PUBLIC_PRICING_ENABLED=0
