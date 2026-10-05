-- LOVELEEDAY connector platform schema (theme A). Rollback: supabase/loveleeday/rollback/20261005_10_connector_platform.sql
-- Interface contract: docs/connector-platform/CONTRACT.md. Applies on top of 20261005_00_base_schema.sql.
-- House patterns: RLS on every table, restrictive require_mfa_aal2 + a member (or admin) select policy, no client write grants,
-- client writes through SECURITY DEFINER ... SET search_path = '' RPCs that check the role and write audit_log, server jobs through
-- RPCs gated by private.server_ok_named(p_secret, 'connectors-server'). No service-role key is introduced.
-- Status words follow Rule 41: nothing here can write 'live' except the health probe (private.refresh_connection_health).

-- ── catalog ────────────────────────────────────────────────────────────────
create table if not exists public.connector_definitions (
  key text primary key,
  name text not null,
  vendor text,
  category text,
  auth_method text not null,
  access_gate text,
  recommended_path text,
  partner_program text,
  sandbox jsonb not null default '{}'::jsonb,
  objects text[] not null default '{}',
  incremental_sync text,
  rate_limits text,
  scopes text[] not null default '{}',
  build_status text not null default 'catalog_only',
  logo text,
  source_file text,
  constraint connector_definitions_auth_method_check check (auth_method = any (array['oauth2_authcode','oauth2_client_credentials','oauth1_tba','api_key','basic','service_account','key_pair','jwt','sftp','upload','none'])),
  constraint connector_definitions_build_status_check check (build_status = any (array['catalog_only','adapter_built','sandbox_verified','partner_gated','blocked']))
);
alter table public.connector_definitions enable row level security;
revoke all on public.connector_definitions from anon, authenticated;
grant select on public.connector_definitions to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connector_definitions' and policyname = 'connector_definitions_read') then
    create policy connector_definitions_read on public.connector_definitions as permissive for select to authenticated using (true);
  end if;
end $$;

-- ── tenant_connections additions ───────────────────────────────────────────
-- New definition keys are not rows of the legacy public.connectors catalog, so the FK to connectors is replaced by a guard that
-- accepts a key from either catalog.
alter table public.tenant_connections
  add column if not exists definition_key text references public.connector_definitions(key),
  add column if not exists auth_method text,
  add column if not exists external_account_id text,
  add column if not exists scopes text[],
  add column if not exists token_expires_at timestamptz,
  add column if not exists health text not null default 'unknown',
  add column if not exists last_success_at timestamptz,
  add column if not exists last_rows integer,
  add column if not exists stale_after interval not null default '26 hours';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tenant_connections_health_check') then
    alter table public.tenant_connections add constraint tenant_connections_health_check
      check (health = any (array['unknown','healthy','stale','failing','not_running']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenant_connections_auth_method_check') then
    alter table public.tenant_connections add constraint tenant_connections_auth_method_check
      check (auth_method is null or auth_method = any (array['oauth2_authcode','oauth2_client_credentials','oauth1_tba','api_key','basic','service_account','key_pair','jwt','sftp','upload','none']));
  end if;
end $$;
alter table public.tenant_connections drop constraint if exists tenant_connections_connector_key_fkey;
create or replace function private.tc_key_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.connectors where key = new.connector_key)
     and not exists (select 1 from public.connector_definitions where key = new.connector_key) then
    raise exception 'unknown platform';
  end if;
  return new;
end $$;
revoke all on function private.tc_key_guard() from public, anon, authenticated, service_role;
drop trigger if exists tenant_connections_key_guard on public.tenant_connections;
create trigger tenant_connections_key_guard before insert or update of connector_key on public.tenant_connections
  for each row execute function private.tc_key_guard();

-- ── tenant-scoped tables ───────────────────────────────────────────────────
create table if not exists private.oauth_states (
  state_hash text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  connector_key text not null,
  code_verifier_ct bytea,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);
revoke all on private.oauth_states from public, anon, authenticated, service_role;

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.tenant_connections(id) on delete cascade,
  object text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status = any (array['running','succeeded','failed','partial'])),
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  error text,
  cursor_before text,
  cursor_after text,
  attempt integer not null default 1
);
create index if not exists sync_runs_conn_idx on public.sync_runs (connection_id, started_at desc);
create index if not exists sync_runs_tenant_idx on public.sync_runs (tenant_id, started_at desc);

create table if not exists public.sync_cursors (
  connection_id uuid not null references public.tenant_connections(id) on delete cascade,
  object text not null,
  cursor text,
  updated_at timestamptz not null default now(),
  primary key (connection_id, object)
);

create table if not exists public.ingested_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.tenant_connections(id) on delete cascade,
  source_system text not null,
  object text not null,
  source_ref text not null,
  payload jsonb not null,
  payload_sha256 text not null,
  observed_at timestamptz not null default now(),
  valid_from timestamptz,
  ingested_run uuid references public.sync_runs(id) on delete set null,
  seq bigint generated always as identity,
  constraint ingested_records_idem_key unique (connection_id, object, source_ref, payload_sha256)
);
create index if not exists ingested_records_tenant_idx on public.ingested_records (tenant_id, connection_id, observed_at desc);

create table if not exists public.connection_health (
  connection_id uuid primary key references public.tenant_connections(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null check (status = any (array['unknown','healthy','stale','failing','not_running'])),
  rows_last_24h integer not null default 0,
  freshest_observed_at timestamptz,
  reason text
);

create table if not exists public.upload_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  target_object text not null,
  mapping jsonb not null default '{}'::jsonb,
  row_count integer,
  status text not null default 'draft' check (status = any (array['draft','validated','imported','failed'])),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists upload_mappings_tenant_idx on public.upload_mappings (tenant_id, created_at desc);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  parent_id uuid references public.entities(id) on delete restrict,
  kind text not null check (kind = any (array['org','entity','location','department'])),
  name text not null check (length(trim(name)) between 1 and 200),
  code text,
  meta jsonb not null default '{}'::jsonb
);
create unique index if not exists entities_tenant_code_uq on public.entities (tenant_id, code) where code is not null;
create index if not exists entities_tenant_idx on public.entities (tenant_id, parent_id);

create table if not exists public.membership_scopes (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  primary key (membership_id, entity_id)
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete set null,
  gate text not null check (gate = any (array['auto','money','send','legal'])),
  title text not null,
  detail text,
  proposed jsonb not null default '{}'::jsonb,
  source_ref text,
  status text not null default 'pending' check (status = any (array['pending','approved','rejected','edited','expired'])),
  decided_by uuid,
  decided_at timestamptz,
  reason text,
  proof text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  executed_proof text
);
alter table public.approvals add column if not exists claimed_at timestamptz, add column if not exists executed_proof text;
create index if not exists approvals_tenant_idx on public.approvals (tenant_id, status, created_at desc);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_tenant_idx on public.api_keys (tenant_id);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  url text not null,
  events text[] not null default '{}',
  secret_ct bytea not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhook_endpoints_tenant_idx on public.webhook_endpoints (tenant_id);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event text not null,
  status text not null,
  response_code integer,
  attempt integer not null default 1,
  at timestamptz not null default now()
);
create index if not exists webhook_deliveries_endpoint_idx on public.webhook_deliveries (endpoint_id, at desc);

create table if not exists public.tenant_security (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  sso_enforced boolean not null default false,
  sso_domains text[] not null default '{}',
  scim_enabled boolean not null default false,
  session_hours integer not null default 12 check (session_hours between 1 and 720),
  retention_days integer not null default 365 check (retention_days between 30 and 3650)
);

-- ── helper functions ───────────────────────────────────────────────────────
create or replace function public.is_tenant_admin(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.member_role(p_tenant), '') in ('owner', 'admin')
$$;
revoke all on function public.is_tenant_admin(uuid) from public, anon;
grant execute on function public.is_tenant_admin(uuid) to authenticated, service_role;

-- Two-factor + minimum role. Non-members get the same 'not allowed' as an under-privileged member (no tenant oracle).
create or replace function private.require_role(p_tenant uuid, p_min text, p_staff boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  v_role := private.member_role(p_tenant);
  if v_role is null then raise exception 'not allowed'; end if;
  if v_role = 'staff' then
    if not p_staff then raise exception 'not allowed'; end if;
    return v_role;
  end if;
  if public.role_rank(v_role) < public.role_rank(p_min) then raise exception 'not allowed'; end if;
  return v_role;
end $$;
revoke all on function private.require_role(uuid, text, boolean) from public, anon, authenticated, service_role;

-- True when the caller may act on this entity: no scopes on their membership = whole tenant; otherwise the entity or an ancestor
-- must be one of their scoped entities.
create or replace function private.entity_in_scope(p_tenant uuid, p_entity uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_m uuid;
begin
  select id into v_m from public.memberships where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null;
  if v_m is null then return true; end if;
  if not exists (select 1 from public.membership_scopes where membership_id = v_m) then return true; end if;
  if p_entity is null then return false; end if;
  return exists (
    with recursive up as (
      select e.id, e.parent_id from public.entities e where e.id = p_entity and e.tenant_id = p_tenant
      union all
      select e.id, e.parent_id from public.entities e join up on e.id = up.parent_id
    )
    select 1 from up join public.membership_scopes s on s.entity_id = up.id and s.membership_id = v_m);
end $$;
revoke all on function private.entity_in_scope(uuid, uuid) from public, anon, authenticated, service_role;

-- ── RLS ────────────────────────────────────────────────────────────────────
create or replace function pg_temp.mk_rls(p_table regclass, p_select_name text, p_select_using text) returns void language plpgsql as $f$
declare v_schema text; v_rel text;
begin
  select n.nspname, c.relname into v_schema, v_rel from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.oid = p_table;
  execute format('alter table %s enable row level security', p_table);
  execute format('revoke all on %s from anon', p_table);
  execute format('revoke all on %s from authenticated', p_table);
  if not exists (select 1 from pg_policies where schemaname = v_schema and tablename = v_rel and policyname = 'require_mfa_aal2') then
    execute format('create policy require_mfa_aal2 on %s as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()))', p_table);
  end if;
  if not exists (select 1 from pg_policies where schemaname = v_schema and tablename = v_rel and policyname = p_select_name) then
    execute format('create policy %I on %s as permissive for select to authenticated using (%s)', p_select_name, p_table, p_select_using);
  end if;
end $f$;

select pg_temp.mk_rls('public.sync_runs', 'sync_runs_member_select', 'public.is_tenant_member(tenant_id)');
select pg_temp.mk_rls('public.sync_cursors', 'sync_cursors_member_select',
  'exists (select 1 from public.tenant_connections c where c.id = sync_cursors.connection_id and public.is_tenant_member(c.tenant_id))');
select pg_temp.mk_rls('public.ingested_records', 'ingested_records_member_select', 'public.is_tenant_member(tenant_id)');
select pg_temp.mk_rls('public.connection_health', 'connection_health_member_select', 'public.is_tenant_member(tenant_id)');
select pg_temp.mk_rls('public.upload_mappings', 'upload_mappings_member_select', 'public.is_tenant_member(tenant_id)');
select pg_temp.mk_rls('public.entities', 'entities_member_select', 'public.is_tenant_member(tenant_id)');
select pg_temp.mk_rls('public.membership_scopes', 'membership_scopes_member_select',
  'exists (select 1 from public.memberships m where m.id = membership_scopes.membership_id and public.is_tenant_member(m.tenant_id))');
select pg_temp.mk_rls('public.approvals', 'approvals_member_select', 'public.is_tenant_member(tenant_id)');
select pg_temp.mk_rls('public.tenant_security', 'tenant_security_member_select', 'public.is_tenant_member(tenant_id)');
select pg_temp.mk_rls('public.api_keys', 'api_keys_admin_select', 'public.is_tenant_admin(tenant_id)');
select pg_temp.mk_rls('public.webhook_endpoints', 'webhook_endpoints_admin_select', 'public.is_tenant_admin(tenant_id)');
select pg_temp.mk_rls('public.webhook_deliveries', 'webhook_deliveries_admin_select', 'public.is_tenant_admin(tenant_id)');

grant select on public.sync_runs, public.sync_cursors, public.ingested_records, public.connection_health, public.upload_mappings,
  public.entities, public.membership_scopes, public.approvals, public.tenant_security, public.webhook_deliveries to authenticated;
-- Secret-bearing columns are never granted: the hash and the encrypted signing secret cannot be read through the API.
grant select (id, tenant_id, name, prefix, scopes, created_by, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
grant select (id, tenant_id, url, events, active, created_at) on public.webhook_endpoints to authenticated;

-- ── health: computed from data, never typed ────────────────────────────────
-- not_running : no finished run exists
-- failing     : the most recent finished run failed
-- stale       : last success older than stale_after, no success at all, the latest run was partial, or the latest successful run
--               moved zero rows (read 0 and wrote 0): an empty feed is not a working feed
-- healthy     : otherwise
create or replace function private.compute_connection_health(p_conn uuid, p_now timestamptz default now())
returns table(status text, reason text, rows_last_24h integer, freshest_observed_at timestamptz, last_success_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_stale interval; v_last public.sync_runs%rowtype; v_succ public.sync_runs%rowtype;
  v_rows integer; v_fresh timestamptz; v_last_success timestamptz;
begin
  select c.stale_after into v_stale from public.tenant_connections c where c.id = p_conn;
  if not found then raise exception 'unknown connection'; end if;
  select count(*)::integer into v_rows from public.ingested_records r where r.connection_id = p_conn and r.observed_at > p_now - interval '24 hours';
  select max(r.observed_at) into v_fresh from public.ingested_records r where r.connection_id = p_conn;
  select * into v_succ from public.sync_runs r where r.connection_id = p_conn and r.status = 'succeeded' order by r.finished_at desc nulls last limit 1;
  v_last_success := v_succ.finished_at;
  select * into v_last from public.sync_runs r where r.connection_id = p_conn and r.status <> 'running'
    order by coalesce(r.finished_at, r.started_at) desc, r.started_at desc limit 1;
  if v_last.id is null then
    return query select 'not_running'::text, 'no sync has finished yet'::text, v_rows, v_fresh, v_last_success; return;
  end if;
  if v_last.status = 'failed' then
    return query select 'failing'::text, ('last run failed: ' || coalesce(left(v_last.error, 200), 'no error recorded'))::text, v_rows, v_fresh, v_last_success; return;
  end if;
  if v_last_success is null then
    return query select 'stale'::text, 'no run has succeeded yet'::text, v_rows, v_fresh, v_last_success; return;
  end if;
  if v_last.status = 'partial' then
    return query select 'stale'::text, 'last run was partial'::text, v_rows, v_fresh, v_last_success; return;
  end if;
  if p_now - v_last_success > v_stale then
    return query select 'stale'::text, ('last success ' || to_char(v_last_success at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC is older than ' || v_stale::text)::text, v_rows, v_fresh, v_last_success; return;
  end if;
  if v_succ.rows_read = 0 and v_succ.rows_written = 0 then
    return query select 'stale'::text, 'latest successful run moved 0 rows'::text, v_rows, v_fresh, v_last_success; return;
  end if;
  return query select 'healthy'::text, 'last run succeeded and moved rows'::text, v_rows, v_fresh, v_last_success;
end $$;
revoke all on function private.compute_connection_health(uuid, timestamptz) from public, anon, authenticated, service_role;

-- Writes the computed result. The only code path that can move a connection to 'live', and it also downgrades.
create or replace function private.refresh_connection_health(p_conn uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare h record; c public.tenant_connections%rowtype; v_status text;
begin
  select * into c from public.tenant_connections where id = p_conn;
  if not found then raise exception 'unknown connection'; end if;
  select * into h from private.compute_connection_health(p_conn);
  insert into public.connection_health (connection_id, tenant_id, checked_at, status, rows_last_24h, freshest_observed_at, reason)
    values (p_conn, c.tenant_id, now(), h.status, h.rows_last_24h, h.freshest_observed_at, h.reason)
  on conflict (connection_id) do update set checked_at = now(), status = excluded.status, rows_last_24h = excluded.rows_last_24h,
    freshest_observed_at = excluded.freshest_observed_at, reason = excluded.reason;
  v_status := case
    when h.status = 'healthy' and c.status in ('connected', 'live', 'error') then 'live'
    when h.status = 'failing' and c.status in ('connected', 'live') then 'error'
    when h.status in ('stale', 'not_running') and c.status = 'live' then 'connected'
    else c.status end;
  update public.tenant_connections set health = h.status, status = v_status, last_success_at = h.last_success_at,
    error = case when h.status = 'failing' then left(h.reason, 300) when h.status = 'healthy' then null else error end,
    last_probe_at = now(), updated_at = now()
  where id = p_conn;
  return h.status;
end $$;
revoke all on function private.refresh_connection_health(uuid) from public, anon, authenticated, service_role;

-- ── client RPCs (role check + two-factor + audit_log) ──────────────────────
create or replace function public.connector_oauth_begin(p_tenant uuid, p_connector text, p_state text, p_code_verifier text, p_redirect_uri text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_def public.connector_definitions%rowtype; v_exp timestamptz := now() + interval '10 minutes';
begin
  perform private.require_role(p_tenant, 'admin', true);
  select * into v_def from public.connector_definitions where key = p_connector;
  if not found or v_def.auth_method <> 'oauth2_authcode' then raise exception 'this platform does not use one-click sign-in'; end if;
  if p_state is null or length(p_state) < 32 then raise exception 'state is too short'; end if;
  if p_redirect_uri is null or p_redirect_uri !~ '^https://' then raise exception 'redirect address must be https'; end if;
  delete from private.oauth_states where tenant_id = p_tenant and (expires_at < now() - interval '1 day' or used_at < now() - interval '1 day');
  insert into public.tenant_connections (tenant_id, connector_key, definition_key, auth_method, status, connected_by)
    values (p_tenant, p_connector, p_connector, v_def.auth_method, 'requested', auth.uid())
  on conflict (tenant_id, connector_key) do update set definition_key = excluded.definition_key, auth_method = excluded.auth_method,
    status = case when public.tenant_connections.status in ('not_connected', 'disconnected') then 'requested' else public.tenant_connections.status end,
    connected_by = auth.uid(), updated_at = now();
  insert into private.oauth_states (state_hash, tenant_id, user_id, connector_key, code_verifier_ct, redirect_uri, expires_at)
    values (encode(extensions.digest(p_state, 'sha256'), 'hex'), p_tenant, auth.uid(), p_connector,
            case when p_code_verifier is null then null else extensions.pgp_sym_encrypt(p_code_verifier, private.tenant_key(p_tenant, true)) end,
            p_redirect_uri, v_exp);
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (p_tenant, auth.uid(), 'connector.oauth_begin', p_connector, '{}'::jsonb);
  return v_exp;
end $$;

create or replace function public.connection_upload_mapping(p_tenant uuid, p_document uuid, p_target_object text, p_mapping jsonb, p_row_count integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_role(p_tenant, 'member', true);
  if not exists (select 1 from public.documents where id = p_document and tenant_id = p_tenant) then raise exception 'document not found'; end if;
  if p_target_object is null or length(trim(p_target_object)) = 0 then raise exception 'choose where this data should go'; end if;
  if p_mapping is null or jsonb_typeof(p_mapping) <> 'object' then raise exception 'mapping must be an object'; end if;
  if p_row_count is not null and p_row_count < 0 then raise exception 'row count is invalid'; end if;
  insert into public.upload_mappings (tenant_id, document_id, target_object, mapping, row_count, created_by)
    values (p_tenant, p_document, trim(p_target_object), p_mapping, p_row_count, auth.uid()) returning id into v_id;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (p_tenant, auth.uid(), 'upload.mapping_saved', 'mapping:' || v_id, jsonb_build_object('document_id', p_document, 'target', trim(p_target_object), 'rows', p_row_count));
  return v_id;
end $$;

create or replace function public.entity_upsert(p_tenant uuid, p_id uuid, p_parent uuid, p_kind text, p_name text, p_code text, p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_cycle boolean;
begin
  perform private.require_role(p_tenant, 'admin', true);
  if p_kind is null or p_kind not in ('org', 'entity', 'location', 'department') then raise exception 'unknown entity kind'; end if;
  if p_parent is not null and not exists (select 1 from public.entities where id = p_parent and tenant_id = p_tenant) then raise exception 'parent not found'; end if;
  if p_id is not null then
    if not exists (select 1 from public.entities where id = p_id and tenant_id = p_tenant) then raise exception 'entity not found'; end if;
    if p_parent is not null then
      with recursive up as (
        select e.id, e.parent_id from public.entities e where e.id = p_parent
        union all select e.id, e.parent_id from public.entities e join up on e.id = up.parent_id)
      select exists (select 1 from up where id = p_id) into v_cycle;
      if v_cycle then raise exception 'an entity cannot sit under itself'; end if;
    end if;
    update public.entities set parent_id = p_parent, kind = p_kind, name = trim(p_name), code = nullif(trim(coalesce(p_code, '')), ''), meta = coalesce(p_meta, '{}'::jsonb)
      where id = p_id;
  else
    insert into public.entities (tenant_id, parent_id, kind, name, code, meta)
      values (p_tenant, p_parent, p_kind, trim(p_name), nullif(trim(coalesce(p_code, '')), ''), coalesce(p_meta, '{}'::jsonb)) returning id into v_id;
  end if;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (p_tenant, auth.uid(), case when p_id is null then 'entity.created' else 'entity.updated' end, 'entity:' || v_id, jsonb_build_object('kind', p_kind, 'name', trim(p_name)));
  return v_id;
end $$;

create or replace function public.entity_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.entities%rowtype;
begin
  select * into v from public.entities where id = p_id;
  if not found then raise exception 'entity not found'; end if;
  perform private.require_role(v.tenant_id, 'admin', true);
  if exists (select 1 from public.entities where parent_id = p_id) then raise exception 'move or remove the entities inside this one first'; end if;
  delete from public.entities where id = p_id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (v.tenant_id, auth.uid(), 'entity.deleted', 'entity:' || p_id, jsonb_build_object('name', v.name));
end $$;

create or replace function public.membership_scope_set(p_membership uuid, p_entities uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_n integer;
begin
  select tenant_id into v_tenant from public.memberships where id = p_membership;
  if v_tenant is null then raise exception 'member not found'; end if;
  perform private.require_role(v_tenant, 'admin', true);
  p_entities := coalesce(p_entities, '{}'::uuid[]);
  select count(*) into v_n from public.entities where id = any (p_entities) and tenant_id = v_tenant;
  if v_n <> (select count(distinct x) from unnest(p_entities) x) then raise exception 'entity not found'; end if;
  delete from public.membership_scopes where membership_id = p_membership;
  insert into public.membership_scopes (membership_id, entity_id) select p_membership, x from (select distinct unnest(p_entities) x) s;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'membership.scope_set', 'membership:' || p_membership, jsonb_build_object('entities', p_entities));
end $$;

-- Money and legal decisions need an owner or admin; send and auto decisions need at least a member. A scoped member can only decide
-- approvals inside their entities.
create or replace function public.approval_decide(p_id uuid, p_decision text, p_reason text default null, p_edit jsonb default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.approvals%rowtype; v_status text;
begin
  select * into v from public.approvals where id = p_id for update;
  if not found then raise exception 'approval not found'; end if;
  perform private.require_role(v.tenant_id, case when v.gate in ('money', 'legal') then 'admin' else 'member' end, false);
  if not private.entity_in_scope(v.tenant_id, v.entity_id) then raise exception 'not allowed'; end if;
  v_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'edit' then 'edited' else null end;
  if v_status is null then raise exception 'unknown decision'; end if;
  if v.status <> 'pending' then raise exception 'this request was already decided'; end if;
  if p_decision = 'edit' and (p_edit is null or jsonb_typeof(p_edit) <> 'object') then raise exception 'send the edited details'; end if;
  if p_decision = 'reject' and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'say why this was declined'; end if;
  update public.approvals set status = v_status, decided_by = auth.uid(), decided_at = now(), reason = nullif(trim(coalesce(p_reason, '')), ''),
    proposed = case when p_decision = 'edit' then v.proposed || p_edit else v.proposed end
  where id = p_id;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v.tenant_id, auth.uid(), 'approval.' || v_status, 'approval:' || p_id, jsonb_build_object('gate', v.gate, 'title', v.title));
  return v_status;
end $$;

-- Plaintext is returned exactly once; only a sha256 of it is stored.
create or replace function public.api_key_create(p_tenant uuid, p_name text, p_scopes text[])
returns table(id uuid, prefix text, api_key text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_key text; v_id uuid;
begin
  perform private.require_role(p_tenant, 'admin', false);
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'name the key'; end if;
  if p_scopes is null or cardinality(p_scopes) = 0
     or exists (select 1 from unnest(p_scopes) s where s <> all (array['records:read', 'records:write', 'approvals:read', 'connections:read'])) then
    raise exception 'choose valid scopes';
  end if;
  if (select count(*) from public.api_keys k where k.tenant_id = p_tenant and k.revoked_at is null) >= 25 then raise exception 'too many active keys'; end if;
  v_key := 'lld_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (tenant_id, name, prefix, key_hash, scopes, created_by)
    values (p_tenant, trim(p_name), left(v_key, 12), encode(extensions.digest(v_key, 'sha256'), 'hex'), p_scopes, auth.uid()) returning api_keys.id into v_id;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (p_tenant, auth.uid(), 'api_key.created', 'api_key:' || v_id, jsonb_build_object('name', trim(p_name), 'scopes', p_scopes));
  return query select v_id, left(v_key, 12), v_key;
end $$;

create or replace function public.api_key_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.api_keys%rowtype;
begin
  select * into v from public.api_keys where id = p_id;
  if not found then raise exception 'key not found'; end if;
  perform private.require_role(v.tenant_id, 'admin', false);
  update public.api_keys set revoked_at = now() where id = p_id and revoked_at is null;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (v.tenant_id, auth.uid(), 'api_key.revoked', 'api_key:' || p_id, jsonb_build_object('name', v.name));
end $$;

-- Creating an endpoint returns its signing secret once (encrypted at rest with the tenant key); updating returns null.
create or replace function public.webhook_upsert(p_tenant uuid, p_id uuid, p_url text, p_events text[], p_active boolean default true)
returns table(id uuid, signing_secret text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_id uuid := p_id; v_secret text;
begin
  perform private.require_role(p_tenant, 'admin', false);
  if p_url is null or length(p_url) > 2048 or p_url !~ '^https://[^\s/]+' then raise exception 'webhook address must be an https URL'; end if;
  if p_url ~* '^https://(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.|\[)' then raise exception 'webhook address must be a public host'; end if;
  if p_events is null or cardinality(p_events) = 0
     or exists (select 1 from unnest(p_events) e where e <> all (array['sync.failed', 'sync.succeeded', 'approval.proposed', 'approval.decided', 'connection.health_changed', 'record.ingested'])) then
    raise exception 'choose valid events';
  end if;
  if p_id is null then
    if (select count(*) from public.webhook_endpoints w where w.tenant_id = p_tenant) >= 20 then raise exception 'too many endpoints'; end if;
    v_secret := 'whsec_' || encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.webhook_endpoints (tenant_id, url, events, secret_ct, active)
      values (p_tenant, p_url, p_events, extensions.pgp_sym_encrypt(v_secret, private.tenant_key(p_tenant, true)), coalesce(p_active, true)) returning webhook_endpoints.id into v_id;
  else
    update public.webhook_endpoints set url = p_url, events = p_events, active = coalesce(p_active, true) where webhook_endpoints.id = p_id and tenant_id = p_tenant;
    if not found then raise exception 'endpoint not found'; end if;
  end if;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (p_tenant, auth.uid(), case when p_id is null then 'webhook.created' else 'webhook.updated' end, 'webhook:' || v_id, jsonb_build_object('events', p_events, 'active', coalesce(p_active, true)));
  return query select v_id, v_secret;
end $$;

create or replace function public.webhook_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.webhook_endpoints%rowtype;
begin
  select * into v from public.webhook_endpoints where id = p_id;
  if not found then raise exception 'endpoint not found'; end if;
  perform private.require_role(v.tenant_id, 'admin', false);
  delete from public.webhook_endpoints where id = p_id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (v.tenant_id, auth.uid(), 'webhook.deleted', 'webhook:' || p_id, '{}'::jsonb);
end $$;

-- Owner only: SSO enforcement and retention can lock people out or shorten evidence.
create or replace function public.tenant_security_set(p_tenant uuid, p_sso_enforced boolean, p_sso_domains text[], p_scim_enabled boolean, p_session_hours integer, p_retention_days integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(p_tenant, 'owner', false);
  if p_session_hours is null or p_session_hours not between 1 and 720 then raise exception 'session length must be 1 to 720 hours'; end if;
  if p_retention_days is null or p_retention_days not between 30 and 3650 then raise exception 'retention must be 30 to 3650 days'; end if;
  if exists (select 1 from unnest(coalesce(p_sso_domains, '{}'::text[])) d where d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') then
    raise exception 'enter domains like example.com';
  end if;
  if coalesce(p_sso_enforced, false) and cardinality(coalesce(p_sso_domains, '{}'::text[])) = 0 then raise exception 'add at least one domain before enforcing single sign-on'; end if;
  insert into public.tenant_security (tenant_id, sso_enforced, sso_domains, scim_enabled, session_hours, retention_days)
    values (p_tenant, coalesce(p_sso_enforced, false), coalesce(p_sso_domains, '{}'::text[]), coalesce(p_scim_enabled, false), p_session_hours, p_retention_days)
  on conflict (tenant_id) do update set sso_enforced = excluded.sso_enforced, sso_domains = excluded.sso_domains, scim_enabled = excluded.scim_enabled,
    session_hours = excluded.session_hours, retention_days = excluded.retention_days;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (p_tenant, auth.uid(), 'security.settings_changed', 'tenant:' || p_tenant,
            jsonb_build_object('sso_enforced', coalesce(p_sso_enforced, false), 'scim_enabled', coalesce(p_scim_enabled, false), 'session_hours', p_session_hours, 'retention_days', p_retention_days));
end $$;

-- Pages by id (keyset): pass the last id you received as p_after_id. Admin or owner only. The export itself is audited on the first page.
create or replace function public.audit_export(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_after_id bigint default null, p_limit integer default 500)
returns table(id bigint, at timestamptz, actor uuid, action text, target text, meta jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
begin
  perform private.require_role(p_tenant, 'admin', false);
  if p_after_id is null then
    insert into public.audit_log (tenant_id, actor, action, target, meta)
      values (p_tenant, auth.uid(), 'audit.exported', 'tenant:' || p_tenant, jsonb_build_object('from', p_from, 'to', p_to));
  end if;
  return query select a.id, a.at, a.actor, a.action, a.target, a.meta from public.audit_log a
    where a.tenant_id = p_tenant and a.id > coalesce(p_after_id, 0)
      and (p_from is null or a.at >= p_from) and (p_to is null or a.at < p_to)
    order by a.id limit v_limit;
end $$;

-- ── server RPCs (connectors-server) ────────────────────────────────────────
create or replace function public.oauth_state_consume(p_secret text, p_state text, p_tenant uuid, p_user uuid)
returns table(connection_id uuid, connector_key text, code_verifier text, redirect_uri text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare s private.oauth_states%rowtype; v_conn uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_state is null or p_tenant is null or p_user is null then raise exception 'invalid or expired sign-in state'; end if;
  -- One statement: single use, unexpired, bound to this tenant AND this user. A mismatch consumes nothing.
  update private.oauth_states o set used_at = now()
    where o.state_hash = encode(extensions.digest(p_state, 'sha256'), 'hex') and o.used_at is null and o.expires_at > now()
      and o.tenant_id = p_tenant and o.user_id = p_user
    returning o.* into s;
  if not found then raise exception 'invalid or expired sign-in state'; end if;
  select c.id into v_conn from public.tenant_connections c where c.tenant_id = s.tenant_id and c.connector_key = s.connector_key;
  return query select v_conn, s.connector_key,
    case when s.code_verifier_ct is null then null else extensions.pgp_sym_decrypt(s.code_verifier_ct, private.tenant_key(s.tenant_id)) end,
    s.redirect_uri;
end $$;

-- Rotating refresh tokens: one INSERT .. ON CONFLICT DO UPDATE of the ciphertext whose WHERE compares the rotated_at stored inside the
-- existing ciphertext. A writer holding an older (or equal) token set matches no row and changes nothing; returns false.
create or replace function public.connection_store_tokens(p_secret text, p_connection uuid, p_tokens jsonb, p_rotated_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_key text; v_set jsonb; v_n integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_rotated_at is null then raise exception 'rotated_at is required'; end if;
  if p_tokens is null or jsonb_typeof(p_tokens) <> 'object' or coalesce(p_tokens ->> 'access_token', '') = '' then raise exception 'access_token is required'; end if;
  select tenant_id into v_tenant from public.tenant_connections where id = p_connection;
  if v_tenant is null then raise exception 'unknown connection'; end if;
  v_key := private.tenant_key(v_tenant, true);
  v_set := (p_tokens - 'rotated_at') || jsonb_build_object('rotated_at', p_rotated_at);
  insert into private.connection_secrets as s (connection_id, ciphertext, fields)
    values (p_connection, extensions.pgp_sym_encrypt(v_set::text, v_key), (select array_agg(k order by k) from jsonb_object_keys(v_set) k))
  on conflict (connection_id) do update set ciphertext = excluded.ciphertext, fields = excluded.fields, created_at = now()
    where coalesce(((extensions.pgp_sym_decrypt(s.ciphertext, v_key)::jsonb) ->> 'rotated_at')::timestamptz, '-infinity'::timestamptz) < p_rotated_at;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  update public.tenant_connections set status = case when status in ('not_connected', 'requested', 'invited', 'key_received', 'disconnected') then 'connected' else status end,
    token_expires_at = nullif(p_tokens ->> 'expires_at', '')::timestamptz,
    scopes = case when coalesce(p_tokens ->> 'scope', '') = '' then scopes else regexp_split_to_array(trim(p_tokens ->> 'scope'), '[\s,]+') end,
    error = null, updated_at = now()
  where id = p_connection;
  return true;
end $$;

create or replace function public.connections_due(p_secret text)
returns table(id uuid, tenant_id uuid, connector_key text, definition_key text, auth_method text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query select c.id, c.tenant_id, c.connector_key, c.definition_key, c.auth_method from public.tenant_connections c
    where c.status in ('connected', 'live', 'error') and exists (select 1 from private.connection_secrets s where s.connection_id = c.id)
      and not exists (select 1 from public.sync_runs r where r.connection_id = c.id and r.status = 'running' and r.started_at > now() - interval '30 minutes')
      and coalesce((select max(r.started_at) from public.sync_runs r where r.connection_id = c.id), '-infinity'::timestamptz) < now() - interval '1 hour'
    order by c.id;
end $$;

create or replace function public.sync_run_start(p_secret text, p_connection uuid, p_object text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.tenant_connections%rowtype; v_id uuid; v_cursor text; v_attempt integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select * into c from public.tenant_connections where id = p_connection;
  if not found then raise exception 'unknown connection'; end if;
  if c.status in ('not_connected', 'disconnected', 'paused') then raise exception 'connection is not active'; end if;
  if p_object is null or length(trim(p_object)) = 0 then raise exception 'object is required'; end if;
  select cursor into v_cursor from public.sync_cursors where connection_id = p_connection and object = p_object;
  select 1 + count(*)::integer into v_attempt from public.sync_runs r
    where r.connection_id = p_connection and r.object = p_object and r.status = 'failed'
      and r.started_at > coalesce((select max(x.finished_at) from public.sync_runs x where x.connection_id = p_connection and x.object = p_object and x.status = 'succeeded'), '-infinity'::timestamptz);
  insert into public.sync_runs (tenant_id, connection_id, object, cursor_before, attempt)
    values (c.tenant_id, p_connection, p_object, v_cursor, v_attempt) returning id into v_id;
  return v_id;
end $$;

create or replace function public.sync_cursor_set(p_secret text, p_connection uuid, p_object text, p_cursor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if not exists (select 1 from public.tenant_connections where id = p_connection) then raise exception 'unknown connection'; end if;
  insert into public.sync_cursors (connection_id, object, cursor, updated_at) values (p_connection, p_object, p_cursor, now())
  on conflict (connection_id, object) do update set cursor = excluded.cursor, updated_at = now();
end $$;

-- Counters accumulate through ingest_records; p_rows_* only override when supplied. The cursor advances only on success or partial.
create or replace function public.sync_run_finish(p_secret text, p_run uuid, p_status text, p_rows_read integer default null, p_rows_written integer default null, p_error text default null, p_cursor_after text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.sync_runs%rowtype;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_status is null or p_status not in ('succeeded', 'failed', 'partial') then raise exception 'unknown run status'; end if;
  select * into r from public.sync_runs where id = p_run for update;
  if not found then raise exception 'unknown run'; end if;
  if r.status <> 'running' then raise exception 'run already finished'; end if;
  update public.sync_runs set status = p_status, finished_at = now(), rows_read = coalesce(p_rows_read, rows_read),
    rows_written = coalesce(p_rows_written, rows_written), error = case when p_status = 'failed' then left(coalesce(p_error, 'failed'), 1000) else null end,
    cursor_after = case when p_status = 'failed' then null else p_cursor_after end
  where id = p_run;
  if p_status <> 'failed' and p_cursor_after is not null then
    insert into public.sync_cursors (connection_id, object, cursor, updated_at) values (r.connection_id, r.object, p_cursor_after, now())
    on conflict (connection_id, object) do update set cursor = excluded.cursor, updated_at = now();
  end if;
  if p_status = 'succeeded' then
    update public.tenant_connections set last_rows = (select rows_written from public.sync_runs where id = p_run) where id = r.connection_id;
  end if;
  return private.refresh_connection_health(r.connection_id);
end $$;

-- p_records: [{ "source_ref": "...", "payload": {...}, "object": "...", "observed_at": "...", "valid_from": "..." }]. Same record with the same
-- content (sha256 of the canonical jsonb text) is a no-op; changed content is a new row. Returns the number of NEW rows.
create or replace function public.ingest_records(p_secret text, p_run uuid, p_records jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.sync_runs%rowtype; c public.tenant_connections%rowtype; v_n integer; v_total integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then raise exception 'records must be an array'; end if;
  v_total := jsonb_array_length(p_records);
  if v_total > 5000 then raise exception 'send at most 5000 records per call'; end if;
  select * into r from public.sync_runs where id = p_run for update;
  if not found or r.status <> 'running' then raise exception 'run is not open'; end if;
  select * into c from public.tenant_connections where id = r.connection_id;
  if exists (select 1 from jsonb_array_elements(p_records) e where jsonb_typeof(e -> 'payload') is distinct from 'object' or coalesce(e ->> 'source_ref', '') = '') then
    raise exception 'every record needs a source_ref and an object payload';
  end if;
  insert into public.ingested_records (tenant_id, connection_id, source_system, object, source_ref, payload, payload_sha256, observed_at, valid_from, ingested_run)
    select r.tenant_id, r.connection_id, coalesce(c.definition_key, c.connector_key), coalesce(nullif(e ->> 'object', ''), r.object), e ->> 'source_ref', e -> 'payload',
           encode(extensions.digest((e -> 'payload')::text, 'sha256'), 'hex'), coalesce((e ->> 'observed_at')::timestamptz, now()), (e ->> 'valid_from')::timestamptz, p_run
    from jsonb_array_elements(p_records) e
  on conflict (connection_id, object, source_ref, payload_sha256) do nothing;
  get diagnostics v_n = row_count;
  update public.sync_runs set rows_read = rows_read + v_total, rows_written = rows_written + v_n where id = p_run;
  return v_n;
end $$;

create or replace function public.connection_health_record(p_secret text, p_connection uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return private.refresh_connection_health(p_connection);
end $$;

create or replace function public.approval_propose(p_secret text, p_tenant uuid, p_gate text, p_title text, p_detail text, p_proposed jsonb, p_source_ref text default null, p_entity uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'unknown client'; end if;
  if p_gate is null or p_gate not in ('auto', 'money', 'send', 'legal') then raise exception 'unknown gate'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required'; end if;
  if p_entity is not null and not exists (select 1 from public.entities where id = p_entity and tenant_id = p_tenant) then raise exception 'entity not found'; end if;
  if p_source_ref is not null then
    select id into v_id from public.approvals where tenant_id = p_tenant and source_ref = p_source_ref and status = 'pending';
    if found then return v_id; end if;
  end if;
  insert into public.approvals (tenant_id, entity_id, gate, title, detail, proposed, source_ref)
    values (p_tenant, p_entity, p_gate, trim(p_title), p_detail, coalesce(p_proposed, '{}'::jsonb), p_source_ref) returning id into v_id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (p_tenant, null, 'approval.proposed', 'approval:' || v_id, jsonb_build_object('gate', p_gate, 'title', trim(p_title)));
  return v_id;
end $$;

-- Verifies a presented API key without ever reading plaintext from storage. Returns no row for unknown or revoked keys.
create or replace function public.api_key_verify(p_secret text, p_key text)
returns table(key_id uuid, tenant_id uuid, scopes text[]) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query update public.api_keys k set last_used_at = now()
    where k.key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') and k.revoked_at is null
    returning k.id, k.tenant_id, k.scopes;
end $$;

-- ── engine-facing server RPCs (contract 5d4627d) ──────────────────────────
-- Keyset feed for the tenant pipeline: p_after_id is the last seq received (0/null = from the start). Scoped by tenant slug.
create or replace function public.ingested_records_since(p_secret text, p_tenant_slug text, p_after_id bigint default null, p_limit integer default 500)
returns table(seq bigint, id uuid, connection_id uuid, source_system text, object text, source_ref text, payload jsonb, observed_at timestamptz, valid_from timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_t uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select t.id into v_t from public.tenants t where t.slug = p_tenant_slug;
  if v_t is null then raise exception 'unknown client'; end if;
  return query select r.seq, r.id, r.connection_id, r.source_system, r.object, r.source_ref, r.payload, r.observed_at, r.valid_from
    from public.ingested_records r where r.tenant_id = v_t and r.seq > coalesce(p_after_id, 0)
    order by r.seq limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end $$;

-- A finding from the engine lands as a task that needs the client's decision; a still-open task with the same title is reused.
create or replace function public.workstream_task_propose(p_secret text, p_tenant_slug text, p_workstream_key text, p_title text, p_detail text, p_recommendation text, p_evidence jsonb, p_proof text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_t uuid; v_w uuid; v_id uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select id into v_t from public.tenants where slug = p_tenant_slug;
  if v_t is null then raise exception 'unknown client'; end if;
  select id into v_w from public.workstreams where tenant_id = v_t and key = p_workstream_key;
  if v_w is null then raise exception 'unknown workstream'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required'; end if;
  select id into v_id from public.workstream_tasks where tenant_id = v_t and workstream_id = v_w and title = trim(p_title) and status <> 'done';
  if found then return v_id; end if;
  insert into public.workstream_tasks (tenant_id, workstream_id, title, detail, recommendation, status, kind, evidence, proof)
    values (v_t, v_w, trim(p_title), p_detail, p_recommendation, 'needs_you', 'decide', p_evidence, p_proof) returning id into v_id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (v_t, null, 'workstream.task_proposed', 'task:' || v_id, jsonb_build_object('title', trim(p_title)));
  return v_id;
end $$;

-- Approved and not yet claimed, oldest decision first.
create or replace function public.approvals_approved(p_secret text, p_tenant_slug text, p_limit integer default 100)
returns setof public.approvals language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select id into v_t from public.tenants where slug = p_tenant_slug;
  if v_t is null then raise exception 'unknown client'; end if;
  return query select a.* from public.approvals a where a.tenant_id = v_t and a.status = 'approved' and a.claimed_at is null
    order by a.decided_at, a.id limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- Atomic, single use: one UPDATE sets claimed_at only while it is null and the status is approved. The loser of a race, a pending,
-- rejected or already-claimed approval all get NULL.
create or replace function public.approval_claim(p_secret text, p_id uuid) returns public.approvals
language plpgsql security definer set search_path = '' as $$
declare v public.approvals%rowtype;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  update public.approvals set claimed_at = now() where id = p_id and status = 'approved' and claimed_at is null returning * into v;
  if not found then return null; end if;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (v.tenant_id, null, 'approval.claimed', 'approval:' || p_id, jsonb_build_object('gate', v.gate));
  return v;
end $$;

-- The observed result of carrying out a claimed approval; written once.
create or replace function public.approval_record_proof(p_secret text, p_id uuid, p_proof text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.approvals%rowtype;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_proof is null or length(trim(p_proof)) = 0 then raise exception 'proof is required'; end if;
  update public.approvals set executed_proof = left(trim(p_proof), 4000) where id = p_id and claimed_at is not null and executed_proof is null returning * into v;
  if not found then raise exception 'approval is not claimed or already has proof'; end if;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (v.tenant_id, null, 'approval.executed', 'approval:' || p_id, jsonb_build_object('gate', v.gate));
end $$;

-- The sync runner reads credentials through the existing connection_secret(); accept the new server name as well as the old one.
create or replace function public.connection_secret(p_secret text, p_connection uuid)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v_t uuid; v_c bytea;
begin
  if not (private.server_ok_named(p_secret, 'connections-server') or private.server_ok_named(p_secret, 'connectors-server')) then raise exception 'server only'; end if;
  select c.tenant_id, s.ciphertext into v_t, v_c from public.tenant_connections c join private.connection_secrets s on s.connection_id = c.id where c.id = p_connection;
  if v_c is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_c, private.tenant_key(v_t));
end $function$;

-- ── grants ─────────────────────────────────────────────────────────────────
-- Client RPCs: signed-in users (and service_role) only.
revoke all on function public.connector_oauth_begin(uuid, text, text, text, text), public.connection_upload_mapping(uuid, uuid, text, jsonb, integer),
  public.entity_upsert(uuid, uuid, uuid, text, text, text, jsonb), public.entity_delete(uuid), public.membership_scope_set(uuid, uuid[]),
  public.approval_decide(uuid, text, text, jsonb), public.api_key_create(uuid, text, text[]), public.api_key_revoke(uuid),
  public.webhook_upsert(uuid, uuid, text, text[], boolean), public.webhook_delete(uuid),
  public.tenant_security_set(uuid, boolean, text[], boolean, integer, integer), public.audit_export(uuid, timestamptz, timestamptz, bigint, integer)
  from public, anon;
grant execute on function public.connector_oauth_begin(uuid, text, text, text, text), public.connection_upload_mapping(uuid, uuid, text, jsonb, integer),
  public.entity_upsert(uuid, uuid, uuid, text, text, text, jsonb), public.entity_delete(uuid), public.membership_scope_set(uuid, uuid[]),
  public.approval_decide(uuid, text, text, jsonb), public.api_key_create(uuid, text, text[]), public.api_key_revoke(uuid),
  public.webhook_upsert(uuid, uuid, text, text[], boolean), public.webhook_delete(uuid),
  public.tenant_security_set(uuid, boolean, text[], boolean, integer, integer), public.audit_export(uuid, timestamptz, timestamptz, bigint, integer)
  to authenticated, service_role;
-- Server RPCs: callable with the anon key because the p_secret check is the gate (same as connection_record).
revoke all on function public.oauth_state_consume(text, text, uuid, uuid), public.connection_store_tokens(text, uuid, jsonb, timestamptz),
  public.connections_due(text), public.sync_run_start(text, uuid, text), public.sync_cursor_set(text, uuid, text, text),
  public.sync_run_finish(text, uuid, text, integer, integer, text, text), public.ingest_records(text, uuid, jsonb),
  public.connection_health_record(text, uuid), public.approval_propose(text, uuid, text, text, text, jsonb, text, uuid),
  public.api_key_verify(text, text), public.ingested_records_since(text, text, bigint, integer),
  public.workstream_task_propose(text, text, text, text, text, text, jsonb, text), public.approvals_approved(text, text, integer),
  public.approval_claim(text, uuid), public.approval_record_proof(text, uuid, text) from public;
grant execute on function public.oauth_state_consume(text, text, uuid, uuid), public.connection_store_tokens(text, uuid, jsonb, timestamptz),
  public.connections_due(text), public.sync_run_start(text, uuid, text), public.sync_cursor_set(text, uuid, text, text),
  public.sync_run_finish(text, uuid, text, integer, integer, text, text), public.ingest_records(text, uuid, jsonb),
  public.connection_health_record(text, uuid), public.approval_propose(text, uuid, text, text, text, jsonb, text, uuid),
  public.api_key_verify(text, text), public.ingested_records_since(text, text, bigint, integer),
  public.workstream_task_propose(text, text, text, text, text, text, jsonb, text), public.approvals_approved(text, text, integer),
  public.approval_claim(text, uuid), public.approval_record_proof(text, uuid, text) to anon, authenticated, service_role;
