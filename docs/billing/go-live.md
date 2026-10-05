# Billing: going live

Billing runs in Stripe test mode until Daniel decides otherwise. One switch: `STRIPE_MODE=test|live` (default test). Public prices stay hidden: `PUBLIC_PRICING_ENABLED` (default off) is the flag any public page must check before showing a price.

Test mode today: catalog `scripts/stripe-catalog.mjs` (lookup keys `ll_<plan>_monthly|annual`, `ll_audit_standard|plus`), webhook endpoint at `https://portal.loveleedaystudios.com/api/stripe/webhook`, Fly secrets staged (not deployed): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE`, `PUBLIC_PRICING_ENABLED`. Tables: `tenant_subscriptions`, `stripe_events`, `tenant_cost_usage` (migration 23). Per-tenant LLM usage (provider, model, tokens, estimated cost) goes to `tenant_llm_usage` through `billing_record_llm_usage` (migration 28, rollback in `supabase/loveleeday/rollback/`); apply it before any tenant-scoped caller sets `usage` in the snapshot `Deps`.

Go live, in order, sequential:

1. Put the LIVE secret key in the vault (`stripe` file or a new `stripe-loveleeday-live.env`). Check the Stripe account branding (logo, name) so Checkout shows LOVELEEDAY.
2. `STRIPE_LIVE_CONFIRM=1 arthur-cred run --use <live-key-file> -- node scripts/stripe-catalog.mjs --live` (creates live products, prices and the customer-portal configuration; re-runnable).
3. `STRIPE_LIVE_CONFIRM=1 arthur-cred run --use <live-key-file> -- node scripts/stripe-webhook-setup.mjs --live` (creates the live endpoint, vaults its secret to `stripe-loveleeday-webhook-live.env`).
4. `STRIPE_MODE_TO_STAGE=live arthur-cred run --use fly,<live-key-file>,stripe-loveleeday-webhook-live -- sh scripts/stripe-stage-fly-secrets.sh`
5. Deploy `arthur-online` (from `~/Projects/arthur-launch`, `-c` full fly.toml path), then buy the cheapest plan with a real card, refund it, and read `tenant_subscriptions` back.
6. Only then, if Daniel confirms public prices, set `PUBLIC_PRICING_ENABLED=1`.

Rollback: set `STRIPE_MODE=test` and the test key again; migration rollback is `supabase/loveleeday/rollback/20261005_23_billing.sql`.

Proof of the test flow: `scripts/billing-e2e.sh` (needs a throwaway tenant with the QA login as admin).
