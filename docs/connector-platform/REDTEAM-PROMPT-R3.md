ROUND 3. Same rules and output format as docs/connector-platform/REDTEAM-PROMPT.md (read it first): READ-ONLY, no edits, no network, no Supabase; local tests allowed. Rounds 1 and 2 are in REDTEAM-CODEX.md and REDTEAM-CODEX-R2.md; do not re-report fixed items.

Review what changed since round 2 (`git log --oneline 9b22e93..HEAD`, `git diff 9b22e93..HEAD`):
- lib/connectors/net/safe-url.ts: connections pinned to the checked DNS answer (claimed fix for DNS rebinding). Try to bypass it: a second lookup, mixed public/private answers, IPv6, redirects, the TLS servername.
- app/api/cron/sync/route.ts, lib/connectors/auth/oauth2.ts, runner: token refresh before sync, and the new atomic connection_rotate_tokens.
- supabase/loveleeday/20261005_14_public_api_and_webhooks.sql: public API reads (must be bound to the key's tenant), webhook triggers (must queue only for the same tenant's active subscribed endpoints, in the same transaction), the leased delivery worker, the delivery record compare-and-set.
- app/api/v1/**, lib/client-portal/public-api.ts: API-key auth, scopes, rate limit, tenant binding, pagination cursor tampering.
- lib/client-portal/webhooks.ts, app/api/cron/webhooks: signature scheme, timing, SSRF at send time, retry schedule.
- supabase/loveleeday/20261005_13_notifications_and_sso.sql, app/client/login, lib/client-portal/{sso,session,api}.ts: SSO enforcement; can a password session for an enforced tenant still reach data? Does sso_required_for_email leak which domains or tenants exist?
- lib/connectors/adapters/planned-http.ts, qad-adaptive-erp.ts, azure-synapse.ts: SSRF, SQL injection through object/watermark names, credential leakage.
- scripts/connector-sandbox-probe.mjs: must never print or save a secret value.
