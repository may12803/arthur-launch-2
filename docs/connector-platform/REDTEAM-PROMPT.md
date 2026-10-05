You are red-teaming branch feat/connector-platform of the LOVELEEDAY client portal (Next.js 14 + Supabase). READ-ONLY: do not edit files, do not run git commands that change state, do not touch the network or any Supabase project. You may run `npm test`, `npm run typecheck`, `node scripts/check-rpc-contract.mjs`, and `bash scripts/db-test.sh` (local scratch Postgres only).

Scope, diffed against origin/main (`git diff origin/main --stat`):
- supabase/loveleeday/20261005_00_base_schema.sql, 20261005_10_connector_platform.sql, 20261005_11_*, rollback/
- lib/connectors/** (crypto, auth: oauth2/pkce/oauth1/jwt/sigv4/sftp, runner, upload, adapters)
- app/api/client/** (new routes), app/api/connectors/oauth/callback, app/api/cron/sync, app/client/(portal)/** new pages, app/trust, middleware.ts changes
- docs/connector-platform/CONTRACT.md is the intended design.

Hunt for real, exploitable or data-corrupting defects. Priorities:
1. Tenant isolation: any path where tenant A reads/writes tenant B data (RLS policies, SECURITY DEFINER RPCs that trust a caller-supplied tenant/connection/run id, server RPCs reachable with the anon key, routes that pass ids from the request body).
2. OAuth: state binding to tenant+user, PKCE, redirect_uri validation, open redirect in callback, token storage, refresh rotation races.
3. Secrets: anything that logs or returns credentials, API key plaintext, webhook secrets; constant-time compares; the x-connectors-secret cron gate.
4. Upload: CSV/XLSX formula injection, size/zip bombs, row caps, mapping to arbitrary objects.
5. Health/status honesty: any path that can show "Live" without data having moved.
6. Role checks: viewer/member/admin/owner on every write; entity-scoped members (G09).
7. The dev-only fixture route /client/dev-preview/*: confirm it cannot render in a production build.
8. SSRF in webhook URLs or adapter base URLs built from customer input.

Output: a markdown table — id | severity (critical/high/medium/low) | file:line | defect | exploit or failure scenario | fix. Only report what you verified by reading the code or running a test; mark anything unverified as such. End with a list of things you checked and found sound.
