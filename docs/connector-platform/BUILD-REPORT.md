# LOVELEEDAY connector platform: build report (2026-10-05)

Brief: ~/arthur/briefs/loveleeday-full-review-2026-10-05/BUILD-BRIEF.md. Branch: `feat/connector-platform` (portal, pushed) and
`feat/tenant-scoped-engine` (engine, pushed). Nothing is deployed and nothing has been written to the live Supabase project by this
build. Every result below was produced on this branch on 2026-10-05; re-run the commands rather than trusting the numbers later.

## Where it stands, in one paragraph

The infrastructure the brief asked for exists in code and passes its tests: a connector registry for all 48 researched systems,
the tables and row-level security to hold tenant connections, credentials, sync runs, cursors, ingested records and health, every
auth method in the matrix, a sync runner that is idempotent and resumable, a health status the database computes from real runs,
26 working adapters, a CSV/XLSX upload with column mapping, an approvals inbox, an audit trail with export, entities and scoped
roles, security, developer and status pages, a trust center, and a tenant-scoped engine pipeline. What it is not yet: connected to
any customer. No connector has moved a customer's data, so every connector reads CONFIGURED or lower, and the live database has
none of the new tables until Daniel approves the diff in the last section.

## Proof (re-run with these commands)

| check | command | result on this branch |
|---|---|---|
| unit tests (portal + connector engine) | `npm test` | 192 passed, 0 failed |
| database tests on a scratch Postgres 14 | `npm run test:db` | 314 passed, 0 failed (`supabase/loveleeday/__tests__/LAST-RUN.txt`) |
| type check | `npm run typecheck` | clean |
| every portal RPC call matches the SQL | `node scripts/check-rpc-contract.mjs` | 58 calls against 71 functions, 0 drift |
| production build | `npm run build` | green, 151/151 pages |
| engine tests (feat/tenant-scoped-engine) | `node scripts/run-tests.mjs` in the engine worktree | 45/45 files; new tenant suite 11/11 |

The tests were checked to be able to fail, not only to pass: the RLS isolation test goes red when one policy is replaced with
`using (true)`; 26 of 27 deliberate breaks of the SSRF, zip and formula guards turned a test red (the survivor is a memory-only cap);
19 breaks of the runner, OAuth, crypto and signing code were caught; the redirect-URI test goes red when the old host-derived URI
is restored; the RPC drift checker flags a call with a wrong argument name.

What the database tests cover: tenant A cannot read tenant B in any new table; a password-only session sees nothing; the same
records ingested twice make no new rows and a changed payload makes exactly one; health reads stale when the last success is old
or the last run moved nothing, failing when the last run failed, not_running when it never ran; an OAuth state is single use,
expires, and cannot be consumed for another tenant; an older refresh-token write cannot overwrite a newer one; every server RPC
refuses a wrong secret; API keys are stored only as a hash; a destroyed tenant key makes its credentials unreadable; entity-scoped
members see and decide only approvals inside their entities; staff with a live grant may do admin connection and document work but
nothing that moves data out or changes access; the Harbor & Vine seed touches no other tenant; the rollback removes every new
object, keeps base data, and the migration re-applies afterwards.

Production-server probes (built app, local): `/client/*` pages send `Cache-Control: private, no-store`; no served page contains the
word Arthur; the dev-only fixture route returns 404; the OAuth callback answers at the one registered URI; the old callback path is
gone; the sync cron refuses a wrong or missing secret with 403; anonymous `POST /api/client/staff` returns 401.

Screenshots: 19 new pages at 1440 and 390 in `docs/connector-platform/shots/`, rendered from fixture data because the live database
does not have the new tables yet. They were looked at; two fixture-only text defects remain (a NetSuite sync history that lists
property objects, one date written "8 Oct"). Route audit screenshots: `docs/connector-platform/audit-shots/` and the brief folder.

## What was built, by brief step

1. Connector framework. `supabase/loveleeday/20261005_00_base_schema.sql` rebuilds the existing portal schema from empty (G24);
   `20261005_10_connector_platform.sql` adds connector_definitions, the tenant_connections additions, private.oauth_states,
   sync_runs, sync_cursors, ingested_records, connection_health, upload_mappings, entities, membership_scopes, approvals, api_keys,
   webhook_endpoints, webhook_deliveries and tenant_security, all with the house RLS pattern; `20261005_11` seeds the 48 definitions
   (never "live"); `20261005_12` makes staff permissions consistent. Rollbacks for 10 and 12 are tested.
2. Auth flows (`lib/connectors/auth/`): OAuth2 authorization code with PKCE S256 and tenant- and user-bound single-use state,
   refresh rotation with compare-and-set, client credentials, OAuth 1.0a TBA signing (NetSuite), API key and basic with a validation
   call, JWT bearer and service accounts, Snowflake key-pair JWT, SFTP credential issuance, S3 cross-account AssumeRole with SigV4.
   One OAuth redirect URI for every vendor: `https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback`
   (`http://localhost:3000/...` in development), fixed in `lib/client-portal/oauth-redirect.ts`.
3. Sync runner (`lib/connectors/runner/`): advances a cursor only after its page is stored, resumes after a crash, rate-limits per
   connection, backs off with jitter and honors Retry-After. Health is computed in the database from sync_runs; the runner cannot
   type a status. The cron entry is `POST /api/cron/sync` with the `x-connectors-secret` header.
4. Connectors: 26 implemented, 12 on the SFTP/CSV path, 10 planned (table below). 13 partner checklists in
   `docs/connector-platform/partner/`, each with an interim CSV column layout that the mapper ingests with zero errors.
5. Engine tenant scoping (`feat/tenant-scoped-engine`): tenant context threaded through send gate, send broker, job postconditions
   and rule writer (default-tenant behavior unchanged, proved by the existing suites); a per-tenant pipeline from ingested records
   through the ontology to task proposals with lineage and gated approvals; an approval-backed broker mode that a cloud job can use
   without the Mac token store. Registered as `pipe.tenant_connected_data`, which reads CONFIGURED_NOT_RUNNING until a tenant
   connection moves data.
6. Pages: connector catalog with logos, connect flow and connection health, data upload and mapping, data health, approvals inbox,
   audit trail with CSV/JSONL export past 200 rows, organization and entities, team with scoped roles, security center, developer
   settings, billing and usage, status, public trust center at `/trust`.
7. Route audits (two runs, `docs/connector-platform/route-audit.md` and the brief folder): 0 blockers. Every major is fixed,
   including M01 (a failed read shown as "No contracts yet") and the same pattern elsewhere (9 portal pages now show a load error instead of an empty state), a deliverable that could open
   under the wrong company, the billing portal open to viewers, and inconsistent staff permissions. Every minor is fixed except
   three outside this repo or intentional: the /work/* marketing pages and the served-site path (the loveleeday site repo), and the
   demo host's 401 without its link key (deliberate).
8. Red team: Codex round 1 found 4 issues; F-01 SSRF, F-02 XLSX decompression bomb and F-03 formula cells on import are fixed and
   mutation-tested; F-04 was left as designed (reading rows on an incremental sync is real flow). Round 2
   (`REDTEAM-CODEX-R2.md`) confirmed those fixes hold and found 3 more, all fixed: R2-01 the Harbor seed's fixed-id upserts could
   update another tenant's row on an id collision (every upsert and update now requires the same tenant; a collision test goes red
   without the guard); R2-02 a formula behind leading spaces (" =HYPERLINK") slipped past the import check (now caught); R2-03 the
   sandbox probe could echo vendor error text that may contain a submitted credential (it now prints only RFC 6749 error codes and
   HTTP statuses; a sentinel secret appears 0 times in console and saved JSON).

## Connectors: what each still needs before it can be live

Nothing below is live. The ladder is: definition, then adapter, then app credentials (`node scripts/connector-sandbox-probe.mjs
<key>` proves the vendor accepts our client), then data from the vendor sandbox, then a customer's authorization with a sync run in
the portal. Only the last step is "live at a customer".

Implemented, waiting on our app registration or a customer credential:
- QuickBooks Online: Intuit developer app; production keys need the app assessment questionnaire.
- Xero: developer app; above 50 connected organizations the 2026 tier and certification gate applies.
- HubSpot: developer app; a Super Admin installs it.
- Shopify: Partner app with protected customer data approval for public install; a merchant custom-app token works meanwhile.
- Square, Stripe (Connect), Salesforce, Box, Dropbox Business, Mailchimp, Clio Manage: an OAuth app each.
- Google Workspace: OAuth app; restricted Gmail and Drive scopes need verification plus the yearly CASA assessment.
- Clover: developer app; App Market approval to serve arbitrary merchants.
- Blackbaud Raiser's Edge NXT: SKY developer app plus the customer's subscription key.
- Microsoft 365 and Dynamics 365 Business Central: Entra app and tenant admin consent (BC also needs the app added inside BC).
- Snowflake: customer registers our public key on a service user and allows our egress IPs.
- Databricks, Google BigQuery, Esri ArcGIS, Laserfiche, Brevo, Buildium: customer supplies a token, key or service account
  (Buildium needs Premium with Open API enabled).
- Amazon S3: our platform AWS identity, then the customer's role ARN; the ExternalId is generated per customer.
- SFTP drop: the SFTP host (`sftp.loveleedaystudios.com`) is not provisioned yet.
- CSV and Excel upload: ready once migration 10 is applied.

SFTP/CSV path now, partner application pending (checklists in `docs/connector-platform/partner/`): Yardi Voyager, MRI Software,
Tyler Munis, AppFolio, Workday, ADP Workforce Now, Toast (multi-location), Sage Intacct, Procore, Gusto, Bloomerang, Infor
CloudSuite. Clover and Xero have working adapters but their checklists cover the marketplace and tier gates.

Planned (no adapter yet): NetSuite (the TBA signer is built; the adapter is not), Acumatica, Oracle Fusion Cloud ERP, SAP Business
One, Dynamics 365 Finance and Operations, Epicor Prophet 21, QAD Adaptive ERP, Cityworks, Azure Synapse (TDS only, no HTTP list
endpoint), Homebase. All of these can use the CSV/SFTP path today.

Vendor credentials: a separate session is creating our developer apps; credentials land in `~/.arthur/vault/connectors/<key>.env`
under the names `CONNECTOR_OAUTH_<KEY>_*` and `CONNECTOR_CREDS_<KEY>_*`. Each one is probed with the script above as it arrives.
At the time of this report the folder does not exist, so 0 of 48 have been probed against a sandbox.

## Open items (known, not hidden)

- DNS rebinding: the SSRF guard checks one DNS answer and the HTTP client resolves again. Closing it needs a dispatcher pinned to the
  checked address.
- `sso_enforced` is stored and shown but no sign-in path enforces it yet; SCIM is shown honestly as not enabled.
- API keys can be created and revoked, but no public API endpoint accepts them yet.
- The cron runner passes stored credentials to adapters without refreshing expired OAuth tokens first.
- No notification preferences RPC; the status page says so.
- Demo member emails read `arthur+...@` (shared with real QA logins), so the word shows on Team, Documents and Access for the demo.
- Still single-tenant in the engine: send broker storage paths, the figures gate and ontology defaults, memory and heartbeat.
- Member and viewer roles were walked live in the second audit only; the new pages have not been walked signed-in because the live
  database lacks their tables.
- Subprocessor list on `/trust` (Supabase, Fly.io, Stripe, Resend, Anthropic) is inferred from the stack; confirm before publishing.

## What needs Daniel: the live database diff

Nothing here has been applied. In order, on project `eydcfgoklajcztpoprsl`:

1. `20261005_00_base_schema.sql` is meant to change nothing on live (functions re-created with identical bodies, policies created only
   when missing, grants restated). It has only been proven on an empty database, not diffed against live.
2. `20261005_10_connector_platform.sql`: adds the 14 tables, nine columns on tenant_connections, 38 functions; replaces
   `connection_secret` so it also accepts the `connectors-server` secret; replaces the tenant_connections foreign key to `connectors`
   with a trigger that accepts either catalog.
3. `20261005_11_connector_definitions_seed.sql`: 48 catalog rows.
4. `20261005_12_staff_permissions.sql`: staff may delete documents; staff may no longer create or revoke external shares or set
   member scopes.
5. Data, not schema: one `private.server_secrets` row named `connectors-server` holding the sha256 of a new
   `LOVELEEDAY_CONNECTORS_SERVER_SECRET`; without it every server RPC refuses. The same secret must then be set on the portal app,
   which is a Fly secret on arthur-online and is not done.
6. Optional data: `seed/harbor-vine-demo.sql` (4 workstreams, 12 tasks, 9 grades, 3 deliverables, 14 coverage areas, 2 contracts,
   a requested Mailchimp connection; after step 2 also 5 entities, 5 approvals, Square and Shopify connections with honest health)
   and `seed/harbor-vine-qa-cleanup.sql` (removes 8 qa-*.txt documents, 2 shares and 3 invites to arthur+harborqa addresses, and 2
   test connection rows). Both are scoped to harbor-vine-demo and tested to leave every other tenant unchanged.

Rollback: `rollback/20261005_10_connector_platform.sql` and `rollback/20261005_12_staff_permissions.sql`, both tested. Rolling back
10 deletes any connection whose key is not in the original 14-connector catalog, because the original foreign key cannot be
restored otherwise.

Then: deploy `feat/connector-platform` to arthur-online after review (not done; production deploys wait for Daniel).
