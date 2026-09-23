-- Phase 2 (verified outside sharing) + Phase 3 (time-limited staff access,
-- data classification) for the LOVELEEDAY client portal. Builds on
-- encrypted_documents_phase1: private.tenant_key, private.document_blobs.

-- ── Phase 3a: classification + the sharing switch ─────────────────────────
alter table public.tenants
  add column if not exists data_class text not null default 'standard' check (data_class in ('standard', 'regulated')),
  add column if not exists external_sharing boolean not null default true;

-- ── Phase 3b: staff directory + time-limited grants ───────────────────────
create table if not exists private.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
revoke all on private.staff from public, anon, authenticated;

create table if not exists public.staff_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  staff_email text not null,
  reason text not null check (length(trim(reason)) >= 10),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid
);
create index if not exists staff_grants_active_idx on public.staff_grants(staff_user_id, expires_at desc);
alter table public.staff_grants enable row level security;
revoke all on public.staff_grants from anon;
grant select on public.staff_grants to authenticated;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.staff where user_id = auth.uid())
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create or replace function private.active_grant(p_tenant uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select g.id from public.staff_grants g
  where g.tenant_id = p_tenant and g.staff_user_id = auth.uid()
    and g.revoked_at is null and g.expires_at > now()
    and exists (select 1 from private.staff s where s.user_id = auth.uid())
  order by g.expires_at desc limit 1
$$;
revoke all on function private.active_grant(uuid) from public, anon, authenticated;

-- Members, or LOVELEEDAY staff holding a live grant, count as "in" the tenant.
create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = 'public', 'pg_temp' as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null
  ) or private.active_grant(p_tenant) is not null;
$$;

create or replace function private.member_role(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select role from public.memberships where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null),
    case when private.active_grant(p_tenant) is not null then 'staff' end)
$$;

drop policy if exists staff_grants_visible on public.staff_grants;
create policy staff_grants_visible on public.staff_grants for select to authenticated
  using (staff_user_id = auth.uid() or exists (
    select 1 from public.memberships m where m.tenant_id = staff_grants.tenant_id and m.user_id = auth.uid() and m.accepted_at is not null));
drop policy if exists require_mfa_aal2 on public.staff_grants;
create policy require_mfa_aal2 on public.staff_grants as restrictive for all to authenticated
  using ((select public.session_is_strong())) with check ((select public.session_is_strong()));

create or replace function public.staff_list_tenants()
returns table(id uuid, name text, data_class text, grant_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  return query
    select t.id, t.name, t.data_class,
           (select max(g.expires_at) from public.staff_grants g where g.tenant_id = t.id and g.staff_user_id = auth.uid()
              and g.revoked_at is null and g.expires_at > now())
    from public.tenants t order by t.name;
end $$;

create or replace function public.staff_open_access(p_tenant uuid, p_reason text, p_hours integer)
returns uuid language plpgsql security definer set search_path = '' as $$
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
end $$;

-- Staff close their own grant; a client owner/admin can cut any grant off.
create or replace function public.staff_close_access(p_grant uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function public.staff_set_data_class(p_tenant uuid, p_class text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if p_class not in ('standard', 'regulated') then raise exception 'unknown classification'; end if;
  update public.tenants set data_class = p_class,
    external_sharing = case when p_class = 'regulated' then false else external_sharing end
  where id = p_tenant;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), 'tenant.data_class_set', 'tenant:' || p_tenant, jsonb_build_object('class', p_class));
end $$;

create or replace function public.tenant_set_external_sharing(p_tenant uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  if coalesce(private.member_role(p_tenant), '') not in ('owner', 'admin') then raise exception 'only an owner or admin can change sharing'; end if;
  update public.tenants set external_sharing = p_enabled where id = p_tenant;
  if not p_enabled then
    update public.document_shares set revoked_at = now() where tenant_id = p_tenant and revoked_at is null;
  end if;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), case when p_enabled then 'sharing.enabled' else 'sharing.disabled' end, 'tenant:' || p_tenant, '{}'::jsonb);
end $$;

-- ── Phase 2: verified outside sharing ─────────────────────────────────────
create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  recipient_email text not null,
  token_hash text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  open_count integer not null default 0,
  last_opened_at timestamptz
);
create index if not exists document_shares_doc_idx on public.document_shares(document_id);
alter table public.document_shares enable row level security;
revoke all on public.document_shares from anon;
grant select on public.document_shares to authenticated;
drop policy if exists document_shares_member_select on public.document_shares;
create policy document_shares_member_select on public.document_shares for select to authenticated using (public.is_tenant_member(tenant_id));
drop policy if exists require_mfa_aal2 on public.document_shares;
create policy require_mfa_aal2 on public.document_shares as restrictive for all to authenticated
  using ((select public.session_is_strong())) with check ((select public.session_is_strong()));

create table if not exists private.share_codes (
  share_id uuid primary key references public.document_shares(id) on delete cascade,
  code_hash text,
  code_expires_at timestamptz,
  attempts integer not null default 0,
  window_start timestamptz not null default now(),
  issued_in_window integer not null default 0
);
revoke all on private.share_codes from public, anon, authenticated;

-- The web server proves itself with a secret held in Vault (name
-- 'share-server-secret') and in the server's own environment. Anonymous
-- callers can reach these functions but cannot pass this check.
create or replace function private.server_ok(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_secret is not null and length(p_secret) >= 32 and exists (
    select 1 from vault.decrypted_secrets where name = 'share-server-secret' and decrypted_secret = p_secret)
$$;
revoke all on function private.server_ok(text) from public, anon, authenticated;

create or replace function private.share_by_token(p_token text)
returns public.document_shares language sql stable security definer set search_path = '' as $$
  select * from public.document_shares
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
revoke all on function private.share_by_token(text) from public, anon, authenticated;

create or replace function public.share_create(p_document uuid, p_email text, p_days integer)
returns text language plpgsql security definer set search_path = '' as $$
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
  return v_token; -- shown once, to the server that emails it; only the hash is kept
end $$;

create or replace function public.share_revoke(p_share uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
end $$;

-- What the recipient's landing page may know before verifying: no file, no full address.
create or replace function public.share_preview(p_token text)
returns table(document_name text, company text, recipient_hint text, state text)
language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function public.share_issue_code(p_token text, p_secret text)
returns table(code text, recipient_email text, document_name text, company text)
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- Verify the code and hand back the decrypted file. Returns a status instead of
-- raising on a wrong code so the attempt counter is kept (a raise rolls it back).
create or replace function public.share_redeem(p_token text, p_code text, p_secret text, p_ip text default null)
returns table(status text, name text, content_type text, data_b64 text, recipient_email text)
language plpgsql security definer set search_path = '' as $$
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
  update private.share_codes set code_hash = null, attempts = 0 where share_id = v_s.id; -- single use
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
end $$;

-- ── Documents: let staff with a live grant deliver files; tag their actions ──
create or replace function public.document_upload(p_tenant uuid, p_name text, p_content_type text, p_data_b64 text, p_ip text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role text; v_bytes bytea; v_id uuid; v_key text;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  v_role := private.member_role(p_tenant);
  if v_role is null or v_role not in ('owner','admin','member','staff') then raise exception 'not allowed to add documents here'; end if;
  v_bytes := decode(p_data_b64, 'base64');
  if length(v_bytes) = 0 then raise exception 'empty file'; end if;
  if length(v_bytes) > 20 * 1024 * 1024 then raise exception 'file is larger than 20 MB'; end if;
  v_key := private.tenant_key(p_tenant, true);
  insert into public.documents(tenant_id, name, content_type, size_bytes, sha256, created_by)
  values (p_tenant, left(p_name, 255), coalesce(nullif(p_content_type, ''), 'application/octet-stream'),
          length(v_bytes), encode(extensions.digest(v_bytes, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;
  insert into private.document_blobs(document_id, ciphertext)
  values (v_id, extensions.pgp_sym_encrypt_bytea(v_bytes, v_key, 'cipher-algo=aes256, compress-algo=0'));
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (p_tenant, auth.uid(), 'document.uploaded', 'document:' || v_id,
          jsonb_build_object('name', left(p_name, 255), 'size', length(v_bytes), 'ip', p_ip,
                             'staff_email', case when v_role = 'staff' then (select email from auth.users where id = auth.uid()) end));
  return v_id;
end $$;

create or replace function public.document_download(p_id uuid, p_ip text default null)
returns table(name text, content_type text, data_b64 text) language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────
revoke all on function public.staff_list_tenants() from public, anon;
revoke all on function public.staff_open_access(uuid, text, integer) from public, anon;
revoke all on function public.staff_close_access(uuid) from public, anon;
revoke all on function public.staff_set_data_class(uuid, text) from public, anon;
revoke all on function public.tenant_set_external_sharing(uuid, boolean) from public, anon;
revoke all on function public.share_create(uuid, text, integer) from public, anon;
revoke all on function public.share_revoke(uuid) from public, anon;
grant execute on function public.staff_list_tenants(), public.staff_open_access(uuid, text, integer), public.staff_close_access(uuid),
  public.staff_set_data_class(uuid, text), public.tenant_set_external_sharing(uuid, boolean),
  public.share_create(uuid, text, integer), public.share_revoke(uuid) to authenticated;
-- The recipient has no account: these are anon-callable, and the two that
-- touch codes or files require the server secret.
revoke all on function public.share_preview(text), public.share_issue_code(text, text), public.share_redeem(text, text, text, text) from public;
grant execute on function public.share_preview(text), public.share_issue_code(text, text), public.share_redeem(text, text, text, text) to anon, authenticated;
