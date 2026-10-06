-- Base schema for the LOVELEEDAY client portal (project eydcfgoklajcztpoprsl), reconstructed 2026-10-05 from the LIVE catalog
-- (information_schema, pg_catalog, pg_get_functiondef, pg_policies, pg_get_constraintdef, pg_indexes, ACLs).
-- Purpose (G24): the schema rebuilds from an empty database. Against live it is idempotent: every statement is CREATE ... IF NOT EXISTS,
-- CREATE OR REPLACE with the live body, or a guarded policy create, so applying it to live changes nothing.
-- Not reconstructable from the catalog: row data (public.connectors seed rows, tenants, memberships, documents, ...), the Supabase-managed
-- schemas (auth, vault, extensions), and the postgres-17-only "m" (MAINTAIN) table privilege that live grants to authenticated.
-- Prerequisites on a fresh Supabase-style database: schema auth (auth.users, auth.uid(), auth.jwt(), auth.mfa_factors), schema vault
-- (vault.create_secret, vault.decrypted_secrets, vault.secrets), roles anon/authenticated/service_role.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists citext with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- ── public tables ──────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid not null default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active',
  plan text,
  created_at timestamptz not null default now(),
  stripe_customer_id text,
  data_class text not null default 'standard',
  external_sharing boolean not null default true,
  provisioning_key text,
  provisioning_key_digest text,
  provisioning_actor uuid,
  provisioning_invite_id uuid,
  constraint tenants_pkey primary key (id),
  constraint tenants_slug_key unique (slug),
  constraint tenants_data_class_check check (data_class = any (array['standard','regulated']))
);
create unique index if not exists tenants_provisioning_key_digest_uq on public.tenants using btree (provisioning_key_digest) where (provisioning_key_digest is not null);

create table if not exists public.connectors (
  key text not null,
  name text not null,
  category text not null,
  method text not null,
  uses text not null,
  never text not null,
  read_scope text not null,
  write_scope text,
  invite_steps text,
  key_fields jsonb,
  key_help text,
  sort integer not null default 0,
  oneclick_ready boolean not null default false,
  constraint connectors_pkey primary key (key),
  constraint connectors_method_check check (method = any (array['oauth','invite','key']))
);

create table if not exists public.memberships (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  role text not null,
  accepted_at timestamptz,
  invited_by uuid,
  created_at timestamptz not null default now(),
  constraint memberships_pkey primary key (id),
  constraint memberships_tenant_id_user_id_key unique (tenant_id, user_id),
  constraint memberships_role_check check (role = any (array['owner','admin','member','viewer'])),
  constraint memberships_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint memberships_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
create index if not exists idx_memberships_user on public.memberships using btree (user_id);
create index if not exists idx_memberships_tenant on public.memberships using btree (tenant_id);

create table if not exists public.invites (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  email extensions.citext not null,
  role text not null default 'member',
  token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_pkey primary key (id),
  constraint invites_token_key unique (token),
  constraint invites_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create index if not exists idx_invites_tenant on public.invites using btree (tenant_id);
create index if not exists idx_invites_email on public.invites using btree (email);

create table if not exists public.audit_log (
  id bigint generated always as identity,
  tenant_id uuid,
  actor uuid,
  action text not null,
  target text,
  meta jsonb,
  at timestamptz not null default now(),
  constraint audit_log_pkey primary key (id)
);
create index if not exists idx_audit_log_tenant on public.audit_log using btree (tenant_id, at desc);

create table if not exists public.tenant_connections (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  connector_key text not null,
  status text not null default 'not_connected',
  access text not null default 'read',
  managed_by text not null default 'client',
  connected_by uuid,
  note text,
  proof text,
  error text,
  last_probe_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_connections_pkey primary key (id),
  constraint tenant_connections_tenant_id_connector_key_key unique (tenant_id, connector_key),
  constraint tenant_connections_access_check check (access = any (array['read','read_write'])),
  constraint tenant_connections_managed_by_check check (managed_by = any (array['client','loveleeday'])),
  constraint tenant_connections_status_check check (status = any (array['not_connected','requested','invited','key_received','connected','live','error','paused','disconnected'])),
  constraint tenant_connections_connector_key_fkey foreign key (connector_key) references public.connectors(key),
  constraint tenant_connections_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);

create table if not exists public.documents (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null,
  sha256 text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  by_staff boolean not null default false,
  constraint documents_pkey primary key (id),
  constraint documents_name_check check (length(name) >= 1 and length(name) <= 255),
  constraint documents_size_bytes_check check (size_bytes > 0),
  constraint documents_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create index if not exists documents_tenant_idx on public.documents using btree (tenant_id, created_at desc);

create table if not exists public.document_shares (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  document_id uuid not null,
  recipient_email text not null,
  token_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  open_count integer not null default 0,
  last_opened_at timestamptz,
  constraint document_shares_pkey primary key (id),
  constraint document_shares_token_hash_key unique (token_hash),
  constraint document_shares_document_id_fkey foreign key (document_id) references public.documents(id) on delete cascade,
  constraint document_shares_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create index if not exists document_shares_doc_idx on public.document_shares using btree (document_id);

create table if not exists public.contracts (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null,
  status text not null default 'draft',
  signwell_document_id text,
  signed_url text,
  created_at timestamptz not null default now(),
  constraint contracts_pkey primary key (id),
  constraint contracts_status_check check (status = any (array['draft','sent','signed','void'])),
  constraint contracts_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create index if not exists contracts_tenant_idx on public.contracts using btree (tenant_id);

create table if not exists public.coverage_areas (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  grp text not null,
  area text not null,
  status text not null,
  note text,
  rank integer,
  sort integer not null default 0,
  constraint coverage_areas_pkey primary key (id),
  constraint coverage_areas_tenant_id_area_key unique (tenant_id, area),
  constraint coverage_areas_status_check check (status = any (array['reviewed','partial','none'])),
  constraint coverage_areas_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);

create table if not exists public.deliverables (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null default 'study',
  title text not null,
  slug text not null,
  content jsonb not null default '{}'::jsonb,
  share_token text,
  status text not null default 'draft',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverables_pkey primary key (id),
  constraint deliverables_share_token_key unique (share_token),
  constraint deliverables_tenant_id_slug_key unique (tenant_id, slug),
  constraint deliverables_kind_check check (kind = any (array['study','portfolio','compliance','other'])),
  constraint deliverables_status_check check (status = any (array['draft','published','archived'])),
  constraint deliverables_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create index if not exists deliverables_tenant_idx on public.deliverables using btree (tenant_id);

create table if not exists public.staff_grants (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  staff_user_id uuid not null,
  staff_email text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  constraint staff_grants_pkey primary key (id),
  constraint staff_grants_reason_check check (length(trim(both from reason)) >= 10),
  constraint staff_grants_staff_user_id_fkey foreign key (staff_user_id) references auth.users(id) on delete cascade,
  constraint staff_grants_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create index if not exists staff_grants_active_idx on public.staff_grants using btree (staff_user_id, expires_at desc);

create table if not exists public.workstreams (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null,
  name text not null,
  summary text,
  grade_start text,
  grade_now text,
  grade_target text,
  review_slug text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workstreams_pkey primary key (id),
  constraint workstreams_tenant_id_key_key unique (tenant_id, key),
  constraint workstreams_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);

create table if not exists public.workstream_tasks (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  workstream_id uuid not null,
  title text not null,
  detail text,
  recommendation text,
  status text not null,
  kind text not null default 'decide',
  evidence jsonb,
  outcome text,
  was text,
  proof text,
  rank integer not null default 100,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  internal boolean not null default false,
  constraint workstream_tasks_pkey primary key (id),
  constraint done_needs_outcome check (status <> 'done' or outcome is not null),
  constraint workstream_tasks_kind_check check (kind = any (array['fix','decide','plan'])),
  constraint workstream_tasks_status_check check (status = any (array['needs_you','in_progress','planned','done'])),
  constraint workstream_tasks_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint workstream_tasks_workstream_id_fkey foreign key (workstream_id) references public.workstreams(id) on delete cascade
);
create index if not exists workstream_tasks_tenant_id_status_rank_idx on public.workstream_tasks using btree (tenant_id, status, rank);

create table if not exists public.workstream_grades (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  workstream_id uuid not null,
  dimension text not null,
  grade_start text,
  grade_now text,
  grade_target text,
  sort integer not null default 0,
  constraint workstream_grades_pkey primary key (id),
  constraint workstream_grades_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint workstream_grades_workstream_id_fkey foreign key (workstream_id) references public.workstreams(id) on delete cascade
);

create table if not exists public.workstream_decisions (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  task_id uuid not null,
  user_id uuid not null,
  decision text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint workstream_decisions_pkey primary key (id),
  constraint workstream_decisions_decision_check check (decision = any (array['approve','approve_with_changes','not_now'])),
  constraint workstream_decisions_task_id_fkey foreign key (task_id) references public.workstream_tasks(id) on delete cascade,
  constraint workstream_decisions_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create index if not exists workstream_decisions_task_id_created_at_idx on public.workstream_decisions using btree (task_id, created_at desc);

-- ── private tables (no RLS; reachable only through SECURITY DEFINER functions) ─
create table if not exists private.staff (
  user_id uuid not null,
  added_at timestamptz not null default now(),
  constraint staff_pkey primary key (user_id),
  constraint staff_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
create table if not exists private.tenant_keys (
  tenant_id uuid not null,
  secret_id uuid not null,
  created_at timestamptz not null default now(),
  constraint tenant_keys_pkey primary key (tenant_id),
  constraint tenant_keys_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create table if not exists private.document_blobs (
  document_id uuid not null,
  ciphertext bytea not null,
  constraint document_blobs_pkey primary key (document_id),
  constraint document_blobs_document_id_fkey foreign key (document_id) references public.documents(id) on delete cascade
);
create table if not exists private.connection_secrets (
  connection_id uuid not null,
  ciphertext bytea not null,
  fields text[] not null,
  created_at timestamptz not null default now(),
  constraint connection_secrets_pkey primary key (connection_id),
  constraint connection_secrets_connection_id_fkey foreign key (connection_id) references public.tenant_connections(id) on delete cascade
);
create table if not exists private.server_secrets (
  name text not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  constraint server_secrets_pkey primary key (name),
  constraint server_secrets_sha256_check check (sha256 ~ '^[0-9a-f]{64}$')
);
create table if not exists private.share_codes (
  share_id uuid not null,
  code_hash text,
  code_expires_at timestamptz,
  attempts integer not null default 0,
  window_start timestamptz not null default now(),
  issued_in_window integer not null default 0,
  constraint share_codes_pkey primary key (share_id),
  constraint share_codes_share_id_fkey foreign key (share_id) references public.document_shares(id) on delete cascade
);
create table if not exists private.mfa_recovery_codes (
  id bigint generated always as identity,
  user_id uuid not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  constraint mfa_recovery_codes_pkey primary key (id),
  constraint mfa_recovery_codes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
create index if not exists mfa_recovery_codes_user on private.mfa_recovery_codes using btree (user_id) where (used_at is null);
create table if not exists private.mfa_recovery_attempts (
  user_id uuid not null,
  at timestamptz not null default now(),
  ok boolean not null
);
create index if not exists mfa_recovery_attempts_user on private.mfa_recovery_attempts using btree (user_id, at);
-- Live carries this one-off QA backup table; kept so the live catalog and a rebuild match.
create table if not exists private.qa_membership_backup (
  id uuid, tenant_id uuid, user_id uuid, role text, accepted_at timestamptz, invited_by uuid, created_at timestamptz
);

-- ── functions (dependency order; bodies are the live definitions) ──────────
create or replace function public.role_rank(p_role text)
 returns integer language sql immutable set search_path to ''
as $function$
  select case p_role when 'viewer' then 1 when 'member' then 2 when 'admin' then 3 when 'owner' then 4 else null end
$function$;

create or replace function public.session_is_strong()
 returns boolean language sql stable set search_path to ''
as $function$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
      or exists (
        select 1 from jsonb_array_elements(coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)) a
        where a ->> 'method' = 'sso/saml'
      );
$function$;

create or replace function private.server_ok(p_secret text)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select p_secret is not null and length(p_secret) >= 32 and exists (
    select 1 from private.server_secrets
    where name = 'share-server' and sha256 = encode(extensions.digest(p_secret, 'sha256'), 'hex'))
$function$;

create or replace function private.server_ok_named(p_secret text, p_name text)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select p_secret is not null and length(p_secret) >= 32 and exists (
    select 1 from private.server_secrets where name = p_name and sha256 = encode(extensions.digest(p_secret, 'sha256'), 'hex'))
$function$;

create or replace function private.tenant_key(p_tenant uuid, p_create boolean default false)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v_secret uuid; v_key text;
begin
  select secret_id into v_secret from private.tenant_keys where tenant_id = p_tenant;
  if v_secret is null then
    if not p_create then raise exception 'no key for this client'; end if;
    v_secret := vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                                    'tenant-dek-' || p_tenant::text, 'LOVELEEDAY per-client document key');
    insert into private.tenant_keys(tenant_id, secret_id) values (p_tenant, v_secret);
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where id = v_secret;
  if v_key is null then raise exception 'client key unavailable'; end if;
  return v_key;
end $function$;

create or replace function private.active_grant(p_tenant uuid)
 returns uuid language sql stable security definer set search_path to ''
as $function$
  select g.id from public.staff_grants g
  where g.tenant_id = p_tenant and g.staff_user_id = auth.uid()
    and g.revoked_at is null and g.expires_at > now()
    and exists (select 1 from private.staff s where s.user_id = auth.uid())
  order by g.expires_at desc limit 1
$function$;

create or replace function private.member_role(p_tenant uuid)
 returns text language sql stable security definer set search_path to ''
as $function$
  select coalesce(
    (select role from public.memberships where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null),
    case when private.active_grant(p_tenant) is not null then 'staff' end)
$function$;

create or replace function public.is_staff()
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (select 1 from private.staff where user_id = auth.uid())
$function$;

create or replace function public.is_tenant_member(p_tenant uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.memberships
    where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null
  ) or private.active_grant(p_tenant) is not null;
$function$;

create or replace function private.share_by_token(p_token text)
 returns public.document_shares language sql stable security definer set search_path to ''
as $function$
  select * from public.document_shares
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$function$;

create or replace function private.conn_for(p_tenant uuid, p_connector text)
 returns public.tenant_connections language plpgsql security definer set search_path to ''
as $function$
declare v public.tenant_connections%rowtype; v_role text;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  v_role := coalesce(private.member_role(p_tenant), '');
  if v_role not in ('owner','admin','staff') then raise exception 'only an owner or admin can manage connections'; end if;
  if not exists (select 1 from public.connectors where key = p_connector) then raise exception 'unknown platform'; end if;
  insert into public.tenant_connections (tenant_id, connector_key) values (p_tenant, p_connector)
    on conflict (tenant_id, connector_key) do nothing;
  select * into v from public.tenant_connections where tenant_id = p_tenant and connector_key = p_connector;
  return v;
end $function$;

create or replace function public.accept_invite(p_token text)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_invite public.invites%rowtype; v_membership_id uuid; v_uid uuid := auth.uid(); v_email text; v_confirmed timestamptz;
  v_before text; v_after text;
begin
  if v_uid is null then raise exception 'must be authenticated to accept an invite'; end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  select * into v_invite from public.invites where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'invite not found, already used, or expired'; end if;
  if v_email is null or v_email <> lower(v_invite.email) then raise exception 'this invite was sent to a different email address'; end if;
  if v_confirmed is null then raise exception 'confirm your email address before accepting this invite'; end if;
  if public.role_rank(v_invite.role) is null then raise exception 'invite carries an unknown role'; end if;
  select role into v_before from public.memberships where tenant_id = v_invite.tenant_id and user_id = v_uid for update;
  if v_before is not null and public.role_rank(v_before) is null then raise exception 'existing membership has an unknown role'; end if;
  insert into public.memberships (tenant_id, user_id, role, accepted_at, invited_by) values (v_invite.tenant_id, v_uid, v_invite.role, now(), null)
  on conflict (tenant_id, user_id) do update set
    role = case when public.role_rank(excluded.role) > public.role_rank(public.memberships.role) then excluded.role else public.memberships.role end,
    accepted_at = coalesce(public.memberships.accepted_at, excluded.accepted_at)
  returning id, role into v_membership_id, v_after;
  update public.invites set accepted_at = now() where id = v_invite.id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values
    (v_invite.tenant_id, v_uid, 'invite.accepted', 'membership:' || v_membership_id::text,
     jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role, 'role_before', v_before, 'role_after', v_after));
  return v_membership_id;
end; $function$;

create or replace function public.connection_disconnect(p_tenant uuid, p_connector text)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v public.tenant_connections%rowtype;
begin
  v := private.conn_for(p_tenant, p_connector);
  delete from private.connection_secrets where connection_id = v.id;
  update public.tenant_connections set status = 'disconnected', proof = null, error = null, updated_at = now() where id = v.id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (p_tenant, auth.uid(), 'connection.disconnect', p_connector, '{}'::jsonb);
  return 'disconnected';
end $function$;

create or replace function public.connection_record(p_secret text, p_tenant_slug text, p_connector text, p_status text, p_proof text, p_error text default null::text, p_managed_by text default null::text, p_access text default null::text, p_note text default null::text)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_t uuid;
begin
  if not private.server_ok_named(p_secret, 'connections-server') then raise exception 'server only'; end if;
  select id into v_t from public.tenants where slug = p_tenant_slug;
  if v_t is null then raise exception 'unknown client'; end if;
  insert into public.tenant_connections (tenant_id, connector_key, status, proof, error, last_probe_at, managed_by, access, note)
    values (v_t, p_connector, p_status, p_proof, p_error, now(), coalesce(p_managed_by, 'client'), coalesce(p_access, 'read'), p_note)
  on conflict (tenant_id, connector_key) do update set status = excluded.status, proof = excluded.proof, error = excluded.error,
    last_probe_at = now(), updated_at = now(),
    managed_by = coalesce(p_managed_by, public.tenant_connections.managed_by), access = coalesce(p_access, public.tenant_connections.access),
    note = coalesce(p_note, public.tenant_connections.note);
end $function$;

create or replace function public.connection_request(p_tenant uuid, p_connector text, p_kind text)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v public.tenant_connections%rowtype; v_status text;
begin
  v := private.conn_for(p_tenant, p_connector);
  v_status := case p_kind when 'invited' then 'invited' when 'request' then 'requested' else null end;
  if v_status is null then raise exception 'unknown request'; end if;
  update public.tenant_connections set status = v_status, managed_by = 'client', connected_by = auth.uid(), error = null, updated_at = now() where id = v.id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (p_tenant, auth.uid(), 'connection.' || p_kind, p_connector, '{}'::jsonb);
  return v_status;
end $function$;

create or replace function public.connection_secret(p_secret text, p_connection uuid)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v_t uuid; v_c bytea;
begin
  if not private.server_ok_named(p_secret, 'connections-server') then raise exception 'server only'; end if;
  select c.tenant_id, s.ciphertext into v_t, v_c from public.tenant_connections c join private.connection_secrets s on s.connection_id = c.id where c.id = p_connection;
  if v_c is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_c, private.tenant_key(v_t));
end $function$;

create or replace function public.connection_set_key(p_tenant uuid, p_connector text, p_payload jsonb)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v public.tenant_connections%rowtype; v_fields text[];
begin
  v := private.conn_for(p_tenant, p_connector);
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_payload = '{}'::jsonb then raise exception 'missing key'; end if;
  select array_agg(k) into v_fields from jsonb_object_keys(p_payload) k;
  insert into private.connection_secrets (connection_id, ciphertext, fields)
    values (v.id, extensions.pgp_sym_encrypt(p_payload::text, private.tenant_key(p_tenant, true)), v_fields)
    on conflict (connection_id) do update set ciphertext = excluded.ciphertext, fields = excluded.fields, created_at = now();
  update public.tenant_connections set status = 'key_received', managed_by = 'client', connected_by = auth.uid(), error = null, proof = null, updated_at = now() where id = v.id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (p_tenant, auth.uid(), 'connection.key', p_connector, jsonb_build_object('fields', v_fields));
  return 'key_received';
end $function$;

create or replace function public.connections_for_probe(p_secret text)
 returns table(id uuid, tenant_id uuid, tenant_slug text, connector_key text, status text, managed_by text, has_secret boolean)
 language plpgsql security definer set search_path to ''
as $function$
begin
  if not private.server_ok_named(p_secret, 'connections-server') then raise exception 'server only'; end if;
  return query select c.id, c.tenant_id, t.slug, c.connector_key, c.status, c.managed_by, exists (select 1 from private.connection_secrets s where s.connection_id = c.id)
    from public.tenant_connections c join public.tenants t on t.id = c.tenant_id where c.status not in ('not_connected','disconnected');
end $function$;

create or replace function public.create_tenant(p_name text, p_slug text)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant_id uuid;
  v_uid       uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'must be authenticated to create a tenant';
  end if;

  insert into public.tenants (name, slug)
  values (p_name, p_slug)
  returning id into v_tenant_id;

  insert into public.memberships (tenant_id, user_id, role, accepted_at)
  values (v_tenant_id, v_uid, 'owner', now());

  insert into public.audit_log (tenant_id, actor, action, target, meta)
  values (
    v_tenant_id, v_uid, 'tenant.created',
    'tenant:' || v_tenant_id::text,
    jsonb_build_object('name', p_name, 'slug', p_slug)
  );

  return v_tenant_id;
end;
$function$;

create or replace function public.document_delete(p_id uuid, p_ip text default null::text)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_doc public.documents%rowtype;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_doc from public.documents d where d.id = p_id;
  if not found or coalesce(private.member_role(v_doc.tenant_id), '') not in ('owner','admin') then
    raise exception 'only an owner or admin can delete documents';
  end if;
  delete from public.documents where id = p_id; -- cascades the ciphertext
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_doc.tenant_id, auth.uid(), 'document.deleted', 'document:' || p_id,
          jsonb_build_object('name', v_doc.name, 'ip', p_ip));
end $function$;

create or replace function public.document_download(p_id uuid, p_ip text default null::text)
 returns table(name text, content_type text, data_b64 text)
 language plpgsql security definer set search_path to ''
as $function$
declare v_doc public.documents%rowtype; v_plain bytea; v_role text;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_doc from public.documents d where d.id = p_id;
  if not found then raise exception 'document not found'; end if;
  v_role := private.member_role(v_doc.tenant_id);
  if v_role is null then raise exception 'document not found'; end if;
  select extensions.pgp_sym_decrypt_bytea(b.ciphertext, private.tenant_key(v_doc.tenant_id))
    into v_plain from private.document_blobs b where b.document_id = p_id;
  if v_plain is null then raise exception 'document not found'; end if;
  if encode(extensions.digest(v_plain, 'sha256'), 'hex') <> v_doc.sha256 then raise exception 'document failed its integrity check'; end if;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_doc.tenant_id, auth.uid(), 'document.downloaded', 'document:' || p_id,
          jsonb_build_object('name', v_doc.name, 'ip', p_ip,
                             'staff_email', case when v_role = 'staff' then (select email from auth.users where id = auth.uid()) end));
  return query select v_doc.name, v_doc.content_type, encode(v_plain, 'base64');
end $function$;

create or replace function public.document_upload(p_tenant uuid, p_name text, p_content_type text, p_data_b64 text, p_ip text default null::text)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_role text; v_bytes bytea; v_id uuid; v_key text;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  v_role := private.member_role(p_tenant);
  if v_role is null or v_role not in ('owner','admin','member','staff') then raise exception 'not allowed to add documents here'; end if;
  v_bytes := decode(p_data_b64, 'base64');
  if length(v_bytes) = 0 then raise exception 'empty file'; end if;
  if length(v_bytes) > 20 * 1024 * 1024 then raise exception 'file is larger than 20 MB'; end if;
  v_key := private.tenant_key(p_tenant, true);
  insert into public.documents(tenant_id, name, content_type, size_bytes, sha256, created_by, by_staff)
  values (p_tenant, left(p_name, 255), coalesce(nullif(p_content_type, ''), 'application/octet-stream'),
          length(v_bytes), encode(extensions.digest(v_bytes, 'sha256'), 'hex'), auth.uid(), v_role = 'staff')
  returning id into v_id;
  insert into private.document_blobs(document_id, ciphertext)
  values (v_id, extensions.pgp_sym_encrypt_bytea(v_bytes, v_key, 'cipher-algo=aes256, compress-algo=0'));
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), 'document.uploaded', 'document:' || v_id,
          jsonb_build_object('name', left(p_name, 255), 'size', length(v_bytes), 'ip', p_ip,
                             'staff_email', case when v_role = 'staff' then (select email from auth.users where id = auth.uid()) end));
  return v_id;
end $function$;

create or replace function public.get_deliverable_by_token(p_token text)
 returns setof public.deliverables language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_token is null or length(p_token) < 16 then return; end if;
  return query
    select * from public.deliverables
    where share_token = p_token
      and status = 'published'
      and (expires_at is null or expires_at > now());
end;
$function$;

create or replace function public.get_invite_preview(p_token text)
 returns table(tenant_name text, role text, expired boolean, email_hint text)
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_token is null or length(p_token) < 12 then return; end if;
  return query
    select t.name, i.role, (i.expires_at <= now()) as expired,
           -- Masked so the invitee knows which address to use, without a leaked
           -- link revealing it: j•••s@northfield.org
           case when position('@' in i.email::text) > 2
             then left(split_part(i.email::text, '@', 1), 1) || '•••' ||
                  right(split_part(i.email::text, '@', 1), 1) || '@' || split_part(i.email::text, '@', 2)
             else '•••@' || split_part(i.email::text, '@', 2) end as email_hint
    from public.invites i
    join public.tenants t on t.id = i.tenant_id
    where i.token = p_token and i.accepted_at is null;
end;
$function$;

-- Shape matches 20261005_29_membership_lifecycle.sql (membership_id added) so re-applying the base never fights it.
drop function if exists public.list_tenant_team(uuid);
create function public.list_tenant_team(p_tenant uuid)
 returns table(user_id uuid, email text, role text, accepted boolean, membership_id uuid)
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_tenant_member(p_tenant) then return; end if;
  return query
    select m.user_id, u.email::text, m.role, (m.accepted_at is not null) as accepted, m.id
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant
    order by m.created_at;
end;
$function$;

create or replace function public.mfa_recovery_codes_generate()
 returns text[] language plpgsql security definer set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  codes text[] := '{}';
  c text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.session_is_strong() then raise exception 'two-factor required'; end if;
  delete from private.mfa_recovery_codes where user_id = uid;
  for i in 1..10 loop
    c := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 5) || '-' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 5));
    insert into private.mfa_recovery_codes(user_id, code_hash) values (uid, extensions.crypt(c, extensions.gen_salt('bf', 10)));
    codes := codes || c;
  end loop;
  insert into public.audit_log(actor, action, target, meta) values (uid, 'mfa.recovery_codes.generated', uid::text, jsonb_build_object('count', 10));
  return codes;
end;
$function$;

create or replace function public.mfa_recovery_codes_remaining()
 returns integer language sql security definer set search_path to ''
as $function$
  select count(*)::int from private.mfa_recovery_codes where user_id = auth.uid() and used_at is null;
$function$;

create or replace function public.mfa_recovery_redeem(p_code text)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  hit bigint;
  norm text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Fa-f]', '', 'g'));
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from private.mfa_recovery_attempts where user_id = uid and not ok and at > now() - interval '15 minutes') >= 5 then
    raise exception 'too many attempts';
  end if;
  if length(norm) = 10 then norm := substr(norm, 1, 5) || '-' || substr(norm, 6, 5); end if;
  select id into hit from private.mfa_recovery_codes
   where user_id = uid and used_at is null and code_hash = extensions.crypt(norm, code_hash)
   limit 1;
  insert into private.mfa_recovery_attempts(user_id, ok) values (uid, hit is not null);
  if hit is null then return false; end if;
  update private.mfa_recovery_codes set used_at = now() where id = hit;
  delete from auth.mfa_factors where user_id = uid;
  insert into public.audit_log(actor, action, target, meta) values (uid, 'mfa.recovery_code.redeemed', uid::text, jsonb_build_object('authenticators_removed', true));
  return true;
end;
$function$;

create or replace function public.share_create(p_document uuid, p_email text, p_days integer)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v_doc public.documents%rowtype; v_t public.tenants%rowtype; v_role text; v_token text; v_max integer; v_email text; v_id uuid;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_doc from public.documents where id = p_document;
  if not found then raise exception 'document not found'; end if;
  v_role := private.member_role(v_doc.tenant_id);
  if v_role is null or v_role = 'viewer' then raise exception 'not allowed to share this document'; end if;
  select * into v_t from public.tenants where id = v_doc.tenant_id;
  if not v_t.external_sharing then raise exception 'sharing outside your company is turned off for this account'; end if;
  v_email := lower(trim(p_email));
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'enter a valid email address'; end if;
  v_max := case when v_t.data_class = 'regulated' then 7 else 30 end;
  if p_days is null or p_days < 1 or p_days > v_max then raise exception 'links can last 1 to % days for this account', v_max; end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.document_shares(tenant_id, document_id, recipient_email, token_hash, created_by, expires_at)
  values (v_doc.tenant_id, p_document, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + make_interval(days => p_days))
  returning id into v_id;
  insert into private.share_codes(share_id) values (v_id);
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_doc.tenant_id, auth.uid(), 'share.created', 'share:' || v_id,
          jsonb_build_object('name', v_doc.name, 'recipient', v_email, 'days', p_days));
  return v_token;
end $function$;

create or replace function public.share_issue_code(p_token text, p_secret text)
 returns table(code text, recipient_email text, document_name text, company text)
 language plpgsql security definer set search_path to ''
as $function$
declare v_s public.document_shares%rowtype; v_c private.share_codes%rowtype; v_code text; v_t public.tenants%rowtype;
begin
  if not private.server_ok(p_secret) then raise exception 'not allowed'; end if;
  v_s := private.share_by_token(p_token);
  if v_s.id is null then raise exception 'link not found'; end if;
  select * into v_t from public.tenants where id = v_s.tenant_id;
  if v_s.revoked_at is not null or v_s.expires_at <= now() or not v_t.external_sharing then raise exception 'this link is no longer active'; end if;
  select * into v_c from private.share_codes where share_id = v_s.id for update;
  if v_c.window_start < now() - interval '1 hour' then
    update private.share_codes set window_start = now(), issued_in_window = 0 where share_id = v_s.id;
    v_c.issued_in_window := 0;
  end if;
  if v_c.issued_in_window >= 5 then raise exception 'too many codes requested; try again in an hour'; end if;
  -- 6 digits from the CSPRNG (never random(), which is predictable)
  v_code := lpad((abs(('x' || encode(extensions.gen_random_bytes(8), 'hex'))::bit(64)::bigint) % 1000000)::text, 6, '0');
  update private.share_codes set code_hash = encode(extensions.digest(v_s.id::text || ':' || v_code, 'sha256'), 'hex'),
    code_expires_at = now() + interval '10 minutes', attempts = 0, issued_in_window = issued_in_window + 1
  where share_id = v_s.id;
  return query select v_code, v_s.recipient_email, d.name, v_t.name from public.documents d where d.id = v_s.document_id;
end $function$;

create or replace function public.share_preview(p_token text)
 returns table(document_name text, company text, recipient_hint text, state text)
 language plpgsql security definer set search_path to ''
as $function$
declare v_s public.document_shares%rowtype; v_local text;
begin
  v_s := private.share_by_token(p_token);
  if v_s.id is null then return; end if;
  v_local := split_part(v_s.recipient_email, '@', 1);
  return query select d.name, t.name,
    left(v_local, 1) || '•••' || right(v_local, 1) || '@' || split_part(v_s.recipient_email, '@', 2),
    case when v_s.revoked_at is not null then 'revoked' when v_s.expires_at <= now() then 'expired'
         when not t.external_sharing then 'revoked' else 'active' end
  from public.documents d join public.tenants t on t.id = d.tenant_id where d.id = v_s.document_id;
end $function$;

create or replace function public.share_redeem(p_token text, p_code text, p_secret text, p_ip text default null::text)
 returns table(status text, name text, content_type text, data_b64 text, recipient_email text)
 language plpgsql security definer set search_path to ''
as $function$
declare v_s public.document_shares%rowtype; v_c private.share_codes%rowtype; v_doc public.documents%rowtype; v_plain bytea; v_t public.tenants%rowtype;
begin
  if not private.server_ok(p_secret) then raise exception 'not allowed'; end if;
  v_s := private.share_by_token(p_token);
  if v_s.id is null then return query select 'not_found'::text, null::text, null::text, null::text, null::text; return; end if;
  select * into v_t from public.tenants where id = v_s.tenant_id;
  if v_s.revoked_at is not null or v_s.expires_at <= now() or not v_t.external_sharing then
    return query select 'inactive'::text, null::text, null::text, null::text, null::text; return;
  end if;
  select * into v_c from private.share_codes where share_id = v_s.id for update;
  if v_c.code_hash is null or v_c.code_expires_at <= now() then
    return query select 'code_expired'::text, null::text, null::text, null::text, null::text; return;
  end if;
  if v_c.attempts >= 5 then
    update private.share_codes set code_hash = null where share_id = v_s.id;
    return query select 'too_many_attempts'::text, null::text, null::text, null::text, null::text; return;
  end if;
  if encode(extensions.digest(v_s.id::text || ':' || coalesce(p_code, ''), 'sha256'), 'hex') <> v_c.code_hash then
    update private.share_codes set attempts = attempts + 1 where share_id = v_s.id;
    return query select 'wrong_code'::text, null::text, null::text, null::text, null::text; return;
  end if;
  update private.share_codes set code_hash = null, attempts = 0 where share_id = v_s.id;
  select * into v_doc from public.documents where id = v_s.document_id;
  select extensions.pgp_sym_decrypt_bytea(b.ciphertext, private.tenant_key(v_doc.tenant_id)) into v_plain
    from private.document_blobs b where b.document_id = v_doc.id;
  if v_plain is null or encode(extensions.digest(v_plain, 'sha256'), 'hex') <> v_doc.sha256 then
    return query select 'integrity'::text, null::text, null::text, null::text, null::text; return;
  end if;
  update public.document_shares set open_count = open_count + 1, last_opened_at = now() where id = v_s.id;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_s.tenant_id, null, 'share.opened', 'share:' || v_s.id,
          jsonb_build_object('name', v_doc.name, 'recipient', v_s.recipient_email, 'ip', p_ip));
  return query select 'ok'::text, v_doc.name, v_doc.content_type, encode(v_plain, 'base64'), v_s.recipient_email;
end $function$;

create or replace function public.share_revoke(p_share uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_s public.document_shares%rowtype; v_role text;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_s from public.document_shares where id = p_share;
  if not found then raise exception 'share not found'; end if;
  v_role := private.member_role(v_s.tenant_id);
  if v_role is null or (v_role not in ('owner', 'admin') and v_s.created_by is distinct from auth.uid()) then
    raise exception 'not allowed to revoke this link';
  end if;
  update public.document_shares set revoked_at = now() where id = p_share and revoked_at is null;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_s.tenant_id, auth.uid(), 'share.revoked', 'share:' || p_share, jsonb_build_object('recipient', v_s.recipient_email));
end $function$;

create or replace function public.staff_close_access(p_grant uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_g public.staff_grants%rowtype;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_g from public.staff_grants where id = p_grant;
  if not found then raise exception 'access grant not found'; end if;
  if v_g.staff_user_id <> auth.uid()
     and coalesce((select role from public.memberships where tenant_id = v_g.tenant_id and user_id = auth.uid() and accepted_at is not null), '') not in ('owner', 'admin') then
    raise exception 'not allowed to close this access';
  end if;
  update public.staff_grants set revoked_at = now(), revoked_by = auth.uid() where id = p_grant and revoked_at is null;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_g.tenant_id, auth.uid(), 'staff.access_closed', 'grant:' || p_grant, jsonb_build_object('staff_email', v_g.staff_email));
end $function$;

create or replace function public.staff_list_tenants()
 returns table(id uuid, name text, data_class text, grant_expires_at timestamptz)
 language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  return query
    select t.id, t.name, t.data_class,
           (select max(g.expires_at) from public.staff_grants g where g.tenant_id = t.id and g.staff_user_id = auth.uid()
              and g.revoked_at is null and g.expires_at > now())
    from public.tenants t order by t.name;
end $function$;

create or replace function public.staff_open_access(p_tenant uuid, p_reason text, p_hours integer)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_class text; v_max integer; v_id uuid; v_email text;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'give a reason of at least 10 characters'; end if;
  select data_class into v_class from public.tenants where id = p_tenant;
  if v_class is null then raise exception 'client not found'; end if;
  v_max := case when v_class = 'regulated' then 4 else 8 end;
  if p_hours is null or p_hours < 1 or p_hours > v_max then raise exception 'access can be opened for 1 to % hours for this client', v_max; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.staff_grants(tenant_id, staff_user_id, staff_email, reason, expires_at)
  values (p_tenant, auth.uid(), v_email, trim(p_reason), now() + make_interval(hours => p_hours))
  returning id into v_id;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), 'staff.access_opened', 'grant:' || v_id,
          jsonb_build_object('staff_email', v_email, 'reason', trim(p_reason), 'hours', p_hours));
  return v_id;
end $function$;

create or replace function public.staff_provision_tenant(p_name text, p_slug text, p_owner_email text, p_key text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_slug text := lower(trim(coalesce(p_slug, ''))); v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_tenant uuid; v_inv public.invites%rowtype; v_created boolean := false; v_digest text; v_t public.tenants%rowtype;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'business name must be 2 to 120 characters'; end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'slug must be 3 to 40 lowercase letters, digits or hyphens'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'owner email is not valid'; end if;
  if p_key is null or length(p_key) < 8 or length(p_key) > 128 then raise exception 'provisioning key must be 8 to 128 characters'; end if;
  v_digest := encode(sha256(convert_to(auth.uid()::text || ':' || p_key, 'utf8')), 'hex');

  perform pg_advisory_xact_lock(hashtext('provision:' || v_slug));
  perform pg_advisory_xact_lock(hashtext('provision-key:' || v_digest));
  select * into v_t from public.tenants where slug = v_slug;
  if found then
    if v_t.provisioning_key_digest is distinct from v_digest or v_t.provisioning_actor is distinct from auth.uid() or v_t.provisioning_invite_id is null then
      raise exception 'slug already in use';
    end if;
    v_tenant := v_t.id;
    select * into v_inv from public.invites where id = v_t.provisioning_invite_id and tenant_id = v_tenant and role = 'owner' and lower(email::text) = v_email for update;
    if not found then raise exception 'slug already in use'; end if;
    if v_inv.accepted_at is null and v_inv.expires_at <= now() then
      update public.invites set expires_at = now() + interval '7 days' where id = v_inv.id returning * into v_inv;
      insert into public.audit_log (tenant_id, actor, action, target, meta)
      values (v_tenant, auth.uid(), 'tenant.provision_invite_renewed', 'invite:' || v_inv.id::text, jsonb_build_object('invite_id', v_inv.id));
    end if;
  else
    if exists (select 1 from public.tenants where provisioning_key_digest = v_digest) then raise exception 'provisioning key already used for another business'; end if;
    insert into public.tenants (name, slug, provisioning_key_digest, provisioning_actor) values (v_name, v_slug, v_digest, auth.uid()) returning id into v_tenant;
    insert into public.invites (tenant_id, email, role) values (v_tenant, v_email, 'owner') returning * into v_inv;
    update public.tenants set provisioning_invite_id = v_inv.id where id = v_tenant;
    insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'tenant.provisioned', 'tenant:' || v_tenant::text,
            jsonb_build_object('name', v_name, 'slug', v_slug, 'owner_email', v_email, 'invite_id', v_inv.id));
    v_created := true;
  end if;
  return jsonb_build_object('tenant_id', v_tenant, 'invite_id', v_inv.id, 'token', v_inv.token, 'created', v_created, 'accepted', v_inv.accepted_at is not null);
end $function$;

create or replace function public.staff_set_data_class(p_tenant uuid, p_class text)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_n integer := 0;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if p_class not in ('standard', 'regulated') then raise exception 'unknown classification'; end if;
  update public.tenants set data_class = p_class,
    external_sharing = case when p_class = 'regulated' then false else external_sharing end
  where id = p_tenant;
  if p_class = 'regulated' then
    update public.document_shares set revoked_at = now() where tenant_id = p_tenant and revoked_at is null;
    get diagnostics v_n = row_count;
  end if;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), 'tenant.data_class_set', 'tenant:' || p_tenant,
          jsonb_build_object('class', p_class, 'links_revoked', v_n));
end $function$;

create or replace function public.tenant_crypto_shred(p_tenant uuid)
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_secret uuid; v_n integer;
begin
  select count(*) into v_n from public.documents where tenant_id = p_tenant;
  delete from public.documents where tenant_id = p_tenant;
  select secret_id into v_secret from private.tenant_keys where tenant_id = p_tenant;
  delete from private.tenant_keys where tenant_id = p_tenant;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), 'tenant.crypto_shredded', 'tenant:' || p_tenant, jsonb_build_object('documents', v_n));
  return v_n;
end $function$;

create or replace function public.tenant_set_external_sharing(p_tenant uuid, p_enabled boolean)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  if coalesce(private.member_role(p_tenant), '') not in ('owner', 'admin') then raise exception 'only an owner or admin can change sharing'; end if;
  update public.tenants set external_sharing = p_enabled where id = p_tenant;
  if not p_enabled then
    update public.document_shares set revoked_at = now() where tenant_id = p_tenant and revoked_at is null;
  end if;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), case when p_enabled then 'sharing.enabled' else 'sharing.disabled' end, 'tenant:' || p_tenant, '{}'::jsonb);
end $function$;

create or replace function public.workstream_decide(p_task uuid, p_decision text, p_note text default null::text)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_task public.workstream_tasks%rowtype; v_role text; v_id uuid;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_task from public.workstream_tasks where id = p_task;
  if not found then raise exception 'task not found'; end if;
  v_role := coalesce(private.member_role(v_task.tenant_id), '');
  if v_role not in ('owner','admin','member') then raise exception 'only owners, admins and members can decide'; end if;
  if p_decision not in ('approve','approve_with_changes','not_now') then raise exception 'unknown decision'; end if;
  if v_task.status = 'done' then raise exception 'this task is already done'; end if;
  insert into public.workstream_decisions (tenant_id, task_id, user_id, decision, note)
    values (v_task.tenant_id, p_task, auth.uid(), p_decision, nullif(trim(coalesce(p_note,'')), ''))
    returning id into v_id;
  update public.workstream_tasks
     set status = case when p_decision = 'not_now' then 'planned' else 'in_progress' end, updated_at = now()
   where id = p_task;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_task.tenant_id, auth.uid(), 'workstream.decide', p_task::text, jsonb_build_object('decision', p_decision, 'title', v_task.title));
  return v_id;
end $function$;

-- ── row level security and policies ────────────────────────────────────────
-- Guarded create: a policy that already exists (live) is left exactly as it is.
create or replace function pg_temp.ensure_policy(p_table regclass, p_name text, p_ddl text) returns void language plpgsql as $f$
begin
  if not exists (select 1 from pg_policies p
                  where p.schemaname = (select n.nspname from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.oid = p_table)
                    and p.tablename = (select relname from pg_class where oid = p_table) and p.policyname = p_name) then
    execute p_ddl;
  end if;
end $f$;

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;
alter table public.connectors enable row level security;
alter table public.tenant_connections enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;
alter table public.contracts enable row level security;
alter table public.coverage_areas enable row level security;
alter table public.deliverables enable row level security;
alter table public.staff_grants enable row level security;
alter table public.workstreams enable row level security;
alter table public.workstream_tasks enable row level security;
alter table public.workstream_grades enable row level security;
alter table public.workstream_decisions enable row level security;

-- Restrictive MFA gate on every tenant table (connectors has none live: it is a catalog).
select pg_temp.ensure_policy(v.t::regclass, 'require_mfa_aal2',
  format('create policy require_mfa_aal2 on %s as restrictive for all %s using ((select public.session_is_strong())) with check ((select public.session_is_strong()))', v.t, v.r))
from (values ('public.tenants','to authenticated'),('public.memberships','to authenticated'),('public.invites','to authenticated'),
  ('public.deliverables','to authenticated'),('public.contracts','to authenticated'),('public.audit_log','to authenticated'),
  ('public.documents','to authenticated'),('public.staff_grants','to authenticated'),('public.document_shares','to authenticated'),
  ('public.workstreams',''),('public.workstream_grades',''),('public.workstream_tasks',''),('public.workstream_decisions',''),
  ('public.coverage_areas',''),('public.tenant_connections','')) as v(t, r);

-- Permissive member-select policies.
select pg_temp.ensure_policy(v.t::regclass, v.p,
  format('create policy %I on %s as permissive for select %s using (public.is_tenant_member(tenant_id))', v.p, v.t, v.r))
from (values
  ('public.deliverables','deliverables_member_select','to authenticated'),
  ('public.contracts','contracts_member_select','to authenticated'),
  ('public.documents','documents_member_select','to authenticated'),
  ('public.document_shares','document_shares_member_select','to authenticated'),
  ('public.workstreams','workstreams_member_select',''),
  ('public.workstream_grades','workstream_grades_member_select',''),
  ('public.workstream_tasks','workstream_tasks_member_select',''),
  ('public.workstream_decisions','workstream_decisions_member_select',''),
  ('public.coverage_areas','coverage_areas_member_select',''),
  ('public.tenant_connections','tenant_connections_member_select','')) as v(t, p, r);

select pg_temp.ensure_policy('public.audit_log', 'audit_log_select_members',
  'create policy audit_log_select_members on public.audit_log as permissive for select to authenticated using ((tenant_id is not null) and public.is_tenant_member(tenant_id))');
select pg_temp.ensure_policy('public.tenants', 'tenants_select_members',
  'create policy tenants_select_members on public.tenants as permissive for select to authenticated using (public.is_tenant_member(id))');
select pg_temp.ensure_policy('public.memberships', 'memberships_select_own',
  'create policy memberships_select_own on public.memberships as permissive for select to authenticated using (user_id = auth.uid())');
select pg_temp.ensure_policy('public.memberships', 'memberships_select_co_members',
  'create policy memberships_select_co_members on public.memberships as permissive for select to authenticated using (public.is_tenant_member(tenant_id))');
select pg_temp.ensure_policy('public.invites', 'invites_admin_manage',
  $p$create policy invites_admin_manage on public.invites as permissive for all to authenticated
     using (exists (select 1 from public.memberships m where m.tenant_id = invites.tenant_id and m.user_id = auth.uid() and m.role = any (array['owner','admin']) and m.accepted_at is not null))
     with check (exists (select 1 from public.memberships m where m.tenant_id = invites.tenant_id and m.user_id = auth.uid() and m.role = any (array['owner','admin']) and m.accepted_at is not null))$p$);
select pg_temp.ensure_policy('public.staff_grants', 'staff_grants_visible',
  $p$create policy staff_grants_visible on public.staff_grants as permissive for select to authenticated
     using (staff_user_id = auth.uid() or exists (select 1 from public.memberships m where m.tenant_id = staff_grants.tenant_id and m.user_id = auth.uid() and m.accepted_at is not null))$p$);
select pg_temp.ensure_policy('public.connectors', 'connectors_read',
  'create policy connectors_read on public.connectors as permissive for select to authenticated using (true)');

-- ── grants (match live ACLs) ───────────────────────────────────────────────
revoke all on all tables in schema public from anon;
-- Only the write-type privileges are revoked, so live's postgres-17 MAINTAIN grant (which this file cannot express on 14) is left alone.
revoke insert, update, delete, truncate, references, trigger on public.tenants, public.memberships, public.invites, public.audit_log, public.connectors,
  public.tenant_connections, public.documents, public.document_shares, public.contracts, public.coverage_areas, public.deliverables,
  public.staff_grants, public.workstreams, public.workstream_tasks, public.workstream_grades, public.workstream_decisions from authenticated;
grant select on public.tenants, public.memberships, public.audit_log, public.connectors, public.tenant_connections,
  public.documents, public.document_shares, public.contracts, public.coverage_areas, public.deliverables, public.staff_grants,
  public.workstreams, public.workstream_tasks, public.workstream_grades, public.workstream_decisions to authenticated;
grant select, insert, update, delete on public.invites to authenticated;

revoke all on private.staff, private.tenant_keys, private.document_blobs, private.connection_secrets, private.server_secrets,
  private.share_codes, private.mfa_recovery_codes, private.mfa_recovery_attempts, private.qa_membership_backup from public, anon, authenticated, service_role;

-- postgres only
revoke all on function private.server_ok(text), private.tenant_key(uuid, boolean), private.active_grant(uuid), private.member_role(uuid),
  private.share_by_token(text) from public, anon, authenticated, service_role;
-- authenticated + service_role
revoke all on function public.accept_invite(text), public.connection_disconnect(uuid, text), public.connection_request(uuid, text, text),
  public.connection_set_key(uuid, text, jsonb), public.document_delete(uuid, text), public.document_download(uuid, text),
  public.document_upload(uuid, text, text, text, text), public.is_staff(), public.is_tenant_member(uuid), public.list_tenant_team(uuid),
  public.mfa_recovery_codes_generate(), public.mfa_recovery_codes_remaining(), public.mfa_recovery_redeem(text), public.role_rank(text),
  public.session_is_strong(), public.share_create(uuid, text, integer), public.share_revoke(uuid), public.staff_close_access(uuid),
  public.staff_list_tenants(), public.staff_open_access(uuid, text, integer), public.staff_provision_tenant(text, text, text, text),
  public.staff_set_data_class(uuid, text), public.tenant_set_external_sharing(uuid, boolean), public.workstream_decide(uuid, text, text)
  from public, anon;
grant execute on function public.accept_invite(text), public.connection_disconnect(uuid, text), public.connection_request(uuid, text, text),
  public.connection_set_key(uuid, text, jsonb), public.document_delete(uuid, text), public.document_download(uuid, text),
  public.document_upload(uuid, text, text, text, text), public.is_staff(), public.is_tenant_member(uuid), public.list_tenant_team(uuid),
  public.mfa_recovery_codes_generate(), public.mfa_recovery_codes_remaining(), public.mfa_recovery_redeem(text), public.role_rank(text),
  public.session_is_strong(), public.share_create(uuid, text, integer), public.share_revoke(uuid), public.staff_close_access(uuid),
  public.staff_list_tenants(), public.staff_open_access(uuid, text, integer), public.staff_provision_tenant(text, text, text, text),
  public.staff_set_data_class(uuid, text), public.tenant_set_external_sharing(uuid, boolean), public.workstream_decide(uuid, text, text)
  to authenticated, service_role;
-- service_role only
revoke all on function public.create_tenant(text, text), public.get_deliverable_by_token(text), public.tenant_crypto_shred(uuid) from public, anon, authenticated;
grant execute on function public.create_tenant(text, text), public.get_deliverable_by_token(text), public.tenant_crypto_shred(uuid) to service_role;
-- anon + authenticated + service_role (each gated by its own secret / token check)
revoke all on function public.get_invite_preview(text), public.share_issue_code(text, text), public.share_preview(text), public.share_redeem(text, text, text, text) from public;
grant execute on function public.get_invite_preview(text), public.share_issue_code(text, text), public.share_preview(text), public.share_redeem(text, text, text, text)
  to anon, authenticated, service_role;
-- public execute (live default ACL; each checks p_secret itself)
grant execute on function public.connection_record(text, text, text, text, text, text, text, text, text), public.connection_secret(text, uuid),
  public.connections_for_probe(text) to public, anon, authenticated, service_role;
