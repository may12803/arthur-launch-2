# Connector platform contract (2026-10-05)

Shared interface for the parallel build of ~/arthur/briefs/loveleeday-full-review-2026-10-05/BUILD-BRIEF.md.
Every theme branch builds against this file. Change it only on feat/connector-platform.

## House patterns (already live in project eydcfgoklajcztpoprsl, keep them)
- Every tenant table: RLS on; a RESTRICTIVE `require_mfa_aal2` policy (`(select public.session_is_strong())`) plus a
  `<table>_member_select` policy `public.is_tenant_member(tenant_id)`. No direct client INSERT/UPDATE/DELETE grants.
- Client writes go through `SECURITY DEFINER ... SET search_path = ''` RPCs that check `private.member_role(p_tenant)`
  with `public.role_rank()`, and write `public.audit_log (tenant_id, actor, action, target, meta)`.
- Server jobs (sync runner, OAuth callback token store, prober) call RPCs that take `p_secret text` and check
  `private.server_ok_named(p_secret, '<name>')`. New server name for this build: `connectors-server`
  (env `LOVELEEDAY_CONNECTORS_SERVER_SECRET`). No service-role key exists or is introduced.
- Secrets: `extensions.pgp_sym_encrypt(payload::text, private.tenant_key(tenant, true))`; the per-tenant key lives
  in Supabase Vault. `tenant_crypto_shred` deletes the key, so every new ciphertext must use the same key.
- Customer UI copy: never "Arthur", no prices, examples span industries. Status words follow Rule 41.

## Schema (supabase/loveleeday/20261005_*.sql, owner: theme A)
- `20261005_00_base_schema.sql`: CREATE IF NOT EXISTS for every table/function that exists live today
  (tenants, memberships, invites, audit_log, connectors, tenant_connections, documents, contracts, deliverables,
  coverage_areas, workstreams, workstream_tasks, workstream_grades, workstream_decisions, private.*), so the
  schema rebuilds from empty (G24). Reconstructed from the live catalog, idempotent against live.
- `public.connector_definitions` (key PK, name, vendor, category, auth_method, access_gate, recommended_path,
  partner_program, sandbox jsonb, objects text[], incremental_sync text, rate_limits text, scopes text[],
  build_status text, logo text, source_file text) — generated from systems/*.json.
- `public.tenant_connections` ADD: `definition_key text`, `auth_method text`, `external_account_id text`,
  `scopes text[]`, `token_expires_at timestamptz`, `health text default 'unknown'`
  (`unknown|healthy|stale|failing|not_running`), `last_success_at`, `last_rows int`, `stale_after interval default '26 hours'`.
- `private.connection_secrets`: unchanged shape; OAuth token sets are stored here as JSON
  `{access_token, refresh_token, expires_at, token_type, scope, rotated_at}`.
- `private.oauth_states` (state_hash PK, tenant_id, user_id, connector_key, code_verifier_ct bytea, redirect_uri,
  created_at, expires_at, used_at) — single use, 10 minute TTL, bound to tenant + user.
- `public.sync_runs` (id, tenant_id, connection_id, object, started_at, finished_at, status
  `running|succeeded|failed|partial`, rows_read, rows_written, error, cursor_before, cursor_after, attempt).
- `public.sync_cursors` (connection_id, object, cursor text, updated_at; PK connection_id+object).
- `public.ingested_records` (id, tenant_id, connection_id, source_system, object, source_ref, payload jsonb,
  payload_sha256, observed_at, valid_from, ingested_run uuid; UNIQUE (connection_id, object, source_ref, payload_sha256))
  — idempotent upsert target; same record + same content = no new row.
- `public.connection_health` (connection_id PK, tenant_id, checked_at, status, rows_last_24h, freshest_observed_at,
  reason) — written only by the health probe.
- `public.upload_mappings` (id, tenant_id, document_id, target_object, mapping jsonb, row_count, status, created_by, created_at).
- `public.entities` (id, tenant_id, parent_id, kind `org|entity|location|department`, name, code, meta) and
  `public.membership_scopes` (membership_id, entity_id) (G08/G09).
- `public.approvals` (id, tenant_id, entity_id, gate `auto|money|send|legal`, title, detail, proposed jsonb,
  source_ref, status `pending|approved|rejected|edited|expired`, decided_by, decided_at, reason, proof, created_at).
- `public.api_keys` (id, tenant_id, name, prefix, key_hash, scopes text[], created_by, created_at, last_used_at, revoked_at)
  and `public.webhook_endpoints` (id, tenant_id, url, events text[], secret_ct bytea, active, created_at)
  and `public.webhook_deliveries` (id, endpoint_id, tenant_id, event, status, response_code, attempt, at).
- `public.tenant_security` (tenant_id PK, sso_enforced bool, sso_domains text[], scim_enabled bool,
  session_hours int, retention_days int default 365).
- RPCs (client, audited): `connector_oauth_begin`, `connection_upload_mapping`, `entity_upsert`, `entity_delete`,
  `approval_decide(p_id, p_decision, p_reason, p_edit jsonb)`, `api_key_create` (returns plaintext once),
  `api_key_revoke`, `webhook_upsert`, `webhook_delete`, `tenant_security_set`, `audit_export(p_tenant, p_from, p_to, p_after_id, p_limit)`.
- RPCs (server, `connectors-server`): `oauth_state_consume`, `connection_store_tokens`, `connection_secret`
  (existing), `connections_due(p_secret)`, `sync_run_start`, `sync_run_finish`, `sync_cursor_set`,
  `ingest_records(p_secret, p_run, p_records jsonb)` returns inserted count, `connection_health_record`,
  `approval_propose`, `ingested_records_since(p_secret, p_tenant_slug, p_after_id, p_limit)`,
  `workstream_task_propose(p_secret, p_tenant_slug, p_workstream_key, p_title, p_detail, p_recommendation, p_evidence, p_proof)`,
  `approvals_approved(p_secret, p_tenant_slug, p_limit)`, `approval_claim(p_secret, p_id)` (atomic, single use: sets claimed_at
  only if null and status approved, returns the row or null), `approval_record_proof(p_secret, p_id, p_proof)`.
  `approvals` therefore also carries `claimed_at timestamptz` and `executed_proof text`.

## Code layout (owner: theme B unless noted)
- `lib/connectors/definitions.generated.ts` from `scripts/gen-connector-definitions.mjs` (reads the 48 JSON files,
  copied into `data/connectors/systems/`). `lib/connectors/types.ts`: `ConnectorDefinition`, `AuthMethod`
  (`oauth2_authcode|oauth2_client_credentials|oauth1_tba|api_key|basic|service_account|key_pair|jwt|sftp|upload|none`).
- `lib/connectors/crypto.ts`: AES-256-GCM envelope for anything held in app memory/at rest outside Postgres; round-trip tested.
- `lib/connectors/auth/{oauth2,pkce,oauth1,client-credentials,key-validate,jwt,sftp}.ts`.
- `lib/connectors/runner/{runner,backoff,rate-limit,health}.ts`: `runConnection(conn, adapter, store)` with an
  injectable `store` (Supabase RPC store in prod, in-memory in tests).
- `lib/connectors/adapters/<key>.ts`: `{ key, objects, validate(creds), pull(object, cursor, creds, fetch) -> {records, nextCursor, hasMore} }`.
- `lib/connectors/upload/{parse,map}.ts`: CSV/XLSX parse with formula-injection guard and column mapping.
- Routes (theme C): `app/api/client/connectors/[key]/oauth/start`, `app/api/connectors/oauth/callback`,
  `app/api/client/uploads`, `app/api/client/approvals`, `app/api/client/audit/export`, `app/api/client/entities`,
  `app/api/client/developer/{keys,webhooks}`, `app/api/client/security`, `app/api/cron/sync` (server secret header).
- Pages (theme C) under `app/client/(portal)/`: connections (catalog), connections/[key] (connect + detail/health),
  data/upload, data/health, approvals, audit, organization, organization/entities, team (extend), security,
  developer, billing (extend), status; public `app/trust`.
- Tests: `node --test` files under `lib/**/__tests__/*.test.mjs`; DB tests under `supabase/loveleeday/__tests__/`
  run against a scratch local Postgres 14 (`scripts/db-test.sh`), never the live project.

## Hard limits
- No `apply_migration` / write `execute_sql` against eydcfgoklajcztpoprsl. No `fly deploy`. Branch + push only.
- Never touch ~/arthur engine code except theme D, in its own worktree on branch `feat/tenant-scoped-engine`.
