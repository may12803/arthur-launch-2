# LOVELEEDAY connector platform: build report (2026-10-05, final)

Brief: ~/arthur/briefs/loveleeday-full-review-2026-10-05/BUILD-BRIEF.md. Branches: `feat/connector-platform` (portal) and
`feat/tenant-scoped-engine` (engine, head 1d9af382), both pushed. Nothing is deployed and nothing has been written to the live
Supabase project. Every number below was produced on this branch on 2026-10-05; re-run the commands rather than trusting them later.

## Where it stands

The infrastructure in the brief exists and is tested: a registry of all 48 researched systems; tables and row-level security for
connections, encrypted credentials, sync runs, cursors, ingested records and health; every auth method in the matrix; a sync runner
that is idempotent, resumable and refreshes expiring tokens; health the database computes from real runs; 34 adapters; CSV/XLSX
upload with mapping; approvals; audit export; entities and scoped roles; SSO enforcement; a public API with customer keys; signed
webhooks; security, developer, status and trust pages; and a tenant-scoped engine. Five vendor apps are proven against the vendors'
real APIs and one (Snowflake) has moved real sample data through the production code path. No connector is live at a customer:
that needs a customer's authorization and the migrations below applied.

## Proof (re-run with these commands)

| check | command | result |
|---|---|---|
| unit tests | `npm test` | 223 passed, 0 failed |
| database tests, scratch Postgres 14 | `npm run test:db` | 376 passed, 0 failed (`supabase/loveleeday/__tests__/LAST-RUN.txt`) |
| type check | `npm run typecheck` | clean |
| every portal RPC call matches the SQL | `node scripts/check-rpc-contract.mjs` | 65 calls against 81 functions, 0 drift |
| production build | `npm run build` | green, 151/151 pages |
| engine tests (feat/tenant-scoped-engine) | `node scripts/run-tests.mjs` | 45/45 files; tenant suite 14/14 |
| vendor sandboxes | `node scripts/connector-sandbox-probe.mjs --all` | table below |

Tests were checked to be able to fail. Each guard below was removed once and its tests went red, then restored:
RLS isolation; SSRF (27 mutations, 26 caught, the survivor bounds memory only); the pinned DNS lookup; webhook event filtering,
delivery isolation and lease; atomic token rotation; SSO enforcement inside the database and the SSO lockout guard; the seed's tenant
guard; the redirect URI; the engine's tenant path validation. `scripts/sql-mutation-check.mjs` reruns any SQL mutation.

## Vendor credentials, probed against the vendors' real APIs

| connector | status | what proved it |
|---|---|---|
| Snowflake | DATA_FLOWED_SANDBOX | key-pair JWT validated as LOVELEEDAY_SVC; 1,000 rows of SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS through the SQL API and the pinned production connector |
| Dropbox Business | CLIENT_VERIFIED | token endpoint answered a bogus code with invalid_grant (our client accepted) |
| Procore (sandbox) | CLIENT_VERIFIED | invalid_grant |
| Esri ArcGIS | CLIENT_VERIFIED | client_credentials issued an app token |
| Blackbaud SKY | CLIENT_VERIFIED | invalid_grant; the app has no SKY environment yet, so no data |
| Shopify | CONFIGURED | the token endpoint is per shop; needs a development store |
| Gusto, Salesforce, Square, Xero | NOT_CONFIGURED | the vault holds sign-in names only, no app credentials yet |

The probe was itself tested: fake HubSpot and Xero apps once read verified when it trusted invalid_request; it now requires
invalid_grant, and a sentinel secret appears 0 times in its console output and saved JSON.

## What was built, by brief step

1. Framework. Migrations `20261005_00` (rebuilds the existing schema from empty, G24), `_10` (connector platform), `_11` (48 catalog
   rows), `_12` (consistent staff permissions), `_13` (notification preferences and SSO enforcement), `_14` (public API reads, webhook
   queue and delivery, atomic token rotation). Rollbacks for 10, 12, 13 and 14 are applied and re-applied in the test run.
2. Auth: OAuth2 code + PKCE with tenant- and user-bound single-use state; refresh with atomic rotation; client credentials; OAuth 1.0a
   TBA (NetSuite); key and basic with validation; JWT and service accounts; Snowflake key pair; SFTP issuance; S3 AssumeRole (SigV4).
   One registered redirect URI: `https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback` (localhost:3000 in dev).
3. Sync runner: cursor advances only after its page is stored; resumes after a crash; rate limits and backoff; refreshes expiring
   OAuth tokens first; a vendor sign-in that expired records a failed run telling the client to re-authorize.
4. Connectors: 34 implemented, 12 on the SFTP/CSV path, 2 planned (QAD has no public API; Azure Synapse needs a TDS driver that is
   not bundled). 13 partner checklists in `docs/connector-platform/partner/`.
5. Engine (`feat/tenant-scoped-engine`): tenant threaded through the send gate, send broker, postconditions, rule writer, figures
   gate, ontology functions and the outward figure CLI; per-tenant broker storage; a pipeline from ingested records to task proposals
   with lineage and gated approvals; an approval-backed broker for cloud jobs. Default-tenant behavior unchanged (existing suites
   identical before and after). The capability reads CONFIGURED_NOT_RUNNING until a tenant connection moves data.
6. Pages: connector catalog, connect flow and health, data upload and mapping, data health, approvals, audit trail with export,
   organization and entities, team with scoped roles, security center, developer settings (API keys, webhooks with signature docs),
   billing, status with notification preferences, public trust center (subprocessors derived from the code).
7. Route audits: 0 blockers; every major and minor fixed except the /work/* marketing pages and served-site path (the site repo) and
   the demo host's intentional 401.
8. Red team: three Codex rounds. Round 1 (4 findings) and round 2 (3) fixed. Round 3 found 6, all fixed: the SSRF pin could be
   skipped with an injected fetch; SSO was enforced only in the portal gate, not in the database (a password session could read an
   enforced tenant directly); an anonymous lookup revealed which domains enforce SSO; webhook signatures survived a redirect; aborts
   did not end native requests; the probe saved a source reference. After merging round 3, the real-vendor probe caught a defect no
   test had: the pinned connector failed on every guarded adapter in production (Node's all-address lookup, plus no decompression);
   fixed with a regression test.

## Open items (known, not hidden)

- Shopify needs a development store; Blackbaud needs a SKY environment or a pilot nonprofit; Gusto, Salesforce, Square, Xero, Google,
  Microsoft and Intuit need their apps registered. Partner programs (Yardi, MRI, Tyler, AppFolio, Workday, ADP, Toast, Sage Intacct,
  Procore marketplace, Gusto, Clover, Laserfiche, Acumatica, NetSuite) remain applications, tracked in the partner files.
- The new pages have only been screenshotted with fixture data, because the live database lacks their tables. Walk them signed in
  after the migrations are applied.
- The webhook timeout was verified with an abort-aware fake and a source check; a stalled real TLS server was not run in a test.
- Demo member emails read `arthur+...@` (shared with real QA logins).

## What needs Daniel

1. Apply to project eydcfgoklajcztpoprsl, in order: `20261005_00` (intended no-op on live, proven only on an empty database), `_10`,
   `_11`, `_12`, `_13`, `_14`. Note `_13` changes `is_tenant_member` and `member_role`, which every policy uses: members of a tenant
   that enforces SSO must then sign in through SSO (no tenant enforces it today, so nothing changes until an owner turns it on, and
   turning it on now requires being signed in through SSO).
2. Insert one `private.server_secrets` row named `connectors-server` (sha256 of a new `LOVELEEDAY_CONNECTORS_SERVER_SECRET`) and set
   the same secret, plus the `CONNECTOR_OAUTH_<KEY>_*` names for each verified vendor, as Fly secrets on arthur-online.
3. Optional data: `seed/harbor-vine-demo.sql` and `seed/harbor-vine-qa-cleanup.sql` (scoped to harbor-vine-demo; an id collision
   with another tenant is tested to change nothing).
4. Deploy `feat/connector-platform` to arthur-online, then schedule `POST /api/cron/sync` and `POST /api/cron/webhooks` with the
   `x-connectors-secret` header.
Rollback of `_10` deletes connections whose key is not in the original 14-connector catalog; roll back `_14` before `_10`.
