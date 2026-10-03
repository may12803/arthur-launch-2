-- Throwaway-database fixture for provision.test.mjs. Mirrors prod's tenants/memberships/invites/audit_log shape and the RLS policies
-- read from the live project on 2026-10-03 (tenants_select_members, memberships_select_*, audit_log_select_members, restrictive
-- require_mfa_aal2). accept_invite is copied verbatim from the live project (read from branch okaisjfkcvljggiabpkj). Not run against production.
create extension if not exists pgcrypto;
create role anon nologin; create role authenticated nologin;
create schema auth; create schema private;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz default now(), invited_at timestamptz, last_sign_in_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to authenticated; grant usage on schema public to authenticated, anon;

create table public.tenants (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, status text not null default 'active', plan text, created_at timestamptz not null default now(), stripe_customer_id text, data_class text not null default 'standard', external_sharing boolean not null default true);
create table public.memberships (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), user_id uuid not null, role text not null, accepted_at timestamptz, invited_by uuid, created_at timestamptz not null default now(), unique (tenant_id, user_id));
create table public.invites (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), email text not null, role text not null default 'member', token text not null unique default encode(gen_random_bytes(24), 'hex'), expires_at timestamptz not null default now() + interval '7 days', accepted_at timestamptz, created_at timestamptz not null default now());
create table public.audit_log (id bigserial primary key, tenant_id uuid, actor uuid, action text not null, target text, meta jsonb, at timestamptz not null default now());
create table private.staff (user_id uuid primary key, added_at timestamptz not null default now());
create table public.res (k text, v text);
grant select on public.tenants, public.memberships, public.audit_log to authenticated;
grant all on public.res to authenticated; grant usage on schema private to authenticated;

create function public.session_is_strong() returns boolean language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false) $$;
create function public.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.staff where user_id = auth.uid()) $$;
create function public.is_tenant_member(p_tenant uuid) returns boolean language sql stable security definer set search_path = 'public', 'pg_temp' as $$
  select exists (select 1 from public.memberships where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null) $$;
grant execute on function public.session_is_strong(), public.is_staff(), public.is_tenant_member(uuid) to authenticated;

create function public.accept_invite(p_token text) returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  v_invite public.invites%rowtype; v_membership_id uuid; v_uid uuid := auth.uid(); v_email text; v_confirmed timestamptz;
begin
  if v_uid is null then raise exception 'must be authenticated to accept an invite'; end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  select * into v_invite from public.invites where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'invite not found, already used, or expired'; end if;
  if v_email is null or v_email <> lower(v_invite.email) then raise exception 'this invite was sent to a different email address'; end if;
  if v_confirmed is null then raise exception 'confirm your email address before accepting this invite'; end if;
  insert into public.memberships (tenant_id, user_id, role, accepted_at, invited_by) values (v_invite.tenant_id, v_uid, v_invite.role, now(), null)
  on conflict (tenant_id, user_id) do update set accepted_at = coalesce(public.memberships.accepted_at, excluded.accepted_at) returning id into v_membership_id;
  update public.invites set accepted_at = now() where id = v_invite.id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values (v_invite.tenant_id, v_uid, 'invite.accepted', 'membership:' || v_membership_id::text, jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role));
  return v_membership_id;
end; $f$;
grant execute on function public.accept_invite(text) to authenticated;

alter table public.tenants enable row level security; alter table public.memberships enable row level security; alter table public.audit_log enable row level security;
create policy tenants_select_members on public.tenants for select to authenticated using (public.is_tenant_member(id));
create policy memberships_select_co_members on public.memberships for select to authenticated using (public.is_tenant_member(tenant_id));
create policy memberships_select_own on public.memberships for select to authenticated using (user_id = auth.uid());
create policy audit_log_select_members on public.audit_log for select to authenticated using (tenant_id is not null and public.is_tenant_member(tenant_id));
create policy require_mfa_aal2 on public.tenants as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
create policy require_mfa_aal2 on public.memberships as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
create policy require_mfa_aal2 on public.audit_log as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));

-- staff, a non-staff user and a long-standing account ('otherowner'). The new owner has NO account yet: it is created after the invite, as the signup route does.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'staff@l.test'), ('00000000-0000-0000-0000-00000000000b', 'plain@l.test'),
  ('00000000-0000-0000-0000-00000000000d', 'otherowner@y.test');
insert into private.staff values ('00000000-0000-0000-0000-00000000000a');
update auth.users set last_sign_in_at = now() - interval '30 days' where email = 'otherowner@y.test';
insert into public.tenants (id, name, slug) values ('11111111-1111-1111-1111-111111111111', 'Other Co', 'other-co');
insert into public.memberships (tenant_id, user_id, role, accepted_at) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'owner', now());
insert into public.audit_log (tenant_id, action) values ('11111111-1111-1111-1111-111111111111', 'tenant.created');

create function public.as_user(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal)::text, true); set local role authenticated; end $$;
grant execute on function public.as_user(text, text) to authenticated;

create function public.try_provision(uid text, aal text, nm text, slug text, email text, key text, request_key text default 'auto') returns void language plpgsql as $$
begin
  perform public.as_user(uid, aal);
  begin
    insert into public.res values (key, (public.staff_provision_tenant(nm, slug, email, case when request_key = 'auto' then 'key-' || lower(trim(slug)) else request_key end))::text);
  exception when others then insert into public.res values (key, 'refused:' || sqlerrm);
  end;
  reset role;
end $$;
create function public.try_accept(uid text, tok text, key text) returns void language plpgsql as $$
begin
  perform public.as_user(uid, 'aal2');
  begin perform public.accept_invite(tok); insert into public.res values (key, 'accepted');
  exception when others then insert into public.res values (key, 'refused:' || sqlerrm);
  end;
  reset role;
end $$;
-- SCENARIOS
-- 1. staff provisions for a brand-new owner: tenant + invite + audit, and NO membership and NO auth user are created.
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Harbor Bar', 'Harbor-Bar', 'NewOwner@x.test', 'first');
select 'RESULT|first_created|' || (v::jsonb ->> 'created') from public.res where k = 'first';
select 'RESULT|tenant_row|' || count(*) from public.tenants where slug = 'harbor-bar';
select 'RESULT|invite_row|' || i.role || '|' || i.email || '|' || (i.accepted_at is null)::text from public.invites i join public.tenants t on t.id = i.tenant_id where t.slug = 'harbor-bar';
select 'RESULT|memberships_created|' || count(*) from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'harbor-bar';
select 'RESULT|auth_users_created|' || count(*) from auth.users where email = 'newowner@x.test';
select 'RESULT|audit_row|' || action || '|' || (meta ? 'token')::text from public.audit_log where action = 'tenant.provisioned';

-- 2. lost response + retry: the same request again returns the SAME tenant and invite, creates nothing, deletes nothing.
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Harbor Bar', 'harbor-bar', 'newowner@x.test', 'retry');
select 'RESULT|retry_same_invite|' || ((a.v::jsonb ->> 'invite_id') = (b.v::jsonb ->> 'invite_id'))::text || '|' || ((a.v::jsonb ->> 'token') = (b.v::jsonb ->> 'token'))::text || '|created=' || (b.v::jsonb ->> 'created')
  from public.res a, public.res b where a.k = 'first' and b.k = 'retry';
select 'RESULT|after_retry_counts|' || (select count(*) from public.tenants where slug = 'harbor-bar') || '|' || (select count(*) from public.invites i join public.tenants t on t.id = i.tenant_id where t.slug = 'harbor-bar') || '|' || (select count(*) from public.audit_log where action = 'tenant.provisioned');

-- 3. new-account owner: the account is created after the invite (signup route), then accept_invite makes them owner.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'newowner@x.test');
select public.try_accept('00000000-0000-0000-0000-00000000000c', (select v::jsonb ->> 'token' from public.res where k = 'first'), 'new_accept');
select 'RESULT|new_accept|' || v from public.res where k = 'new_accept';
select 'RESULT|new_owner_role|' || m.role || '|' || (m.accepted_at is not null)::text from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'harbor-bar' and m.user_id = '00000000-0000-0000-0000-00000000000c';
-- a retry after acceptance reports accepted and does not re-open anything
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Harbor Bar', 'harbor-bar', 'newowner@x.test', 'retry_after_accept');
select 'RESULT|retry_after_accept|' || (v::jsonb ->> 'accepted') || '|created=' || (v::jsonb ->> 'created') from public.res where k = 'retry_after_accept';

-- 4. existing-account owner: invited by email, accepts with the token; no heuristic, so before accepting there is NO membership.
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Pending Co', 'pending-co', 'OtherOwner@y.test', 'existing');
select 'RESULT|existing_before_accept|' || count(*) from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'pending-co';
select public.try_accept('00000000-0000-0000-0000-00000000000d', (select v::jsonb ->> 'token' from public.res where k = 'existing'), 'existing_accept');
select 'RESULT|existing_accept|' || v from public.res where k = 'existing_accept';
select 'RESULT|existing_owner_role|' || m.role from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'pending-co' and m.user_id = '00000000-0000-0000-0000-00000000000d';

-- 5. P9: a recently invited_at / never-signed-in account is NOT treated as consent. Only accept_invite grants access.
update auth.users set invited_at = now(), last_sign_in_at = null where email = 'plain@l.test';
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Fresh Co', 'fresh-co', 'plain@l.test', 'fresh_invited_user');
select 'RESULT|fresh_invited_membership|' || count(*) from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'fresh-co';
-- the wrong account cannot use someone else's token
select public.try_accept('00000000-0000-0000-0000-00000000000d', (select v::jsonb ->> 'token' from public.res where k = 'fresh_invited_user'), 'wrong_account');
select 'RESULT|wrong_account|' || v from public.res where k = 'wrong_account';

-- 6. refusals
select public.try_provision('00000000-0000-0000-0000-00000000000b', 'aal2', 'Nope', 'plain-try', 'a@b.test', 'nonstaff');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal1', 'Nope', 'weak-try', 'a@b.test', 'weak_session');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Other Name', 'harbor-bar', 'someoneelse@z.test', 'dup_slug_other_owner');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Other Co', 'other-co', 'otherowner@y.test', 'dup_slug_preexisting');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Nope', 'Bad Slug!', 'a@b.test', 'bad_slug');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Nope', 'good-slug', 'not-an-email', 'bad_email');
select 'RESULT|' || k || '|' || v from public.res where k in ('nonstaff', 'weak_session', 'dup_slug_other_owner', 'dup_slug_preexisting', 'bad_slug', 'bad_email');
select 'RESULT|refused_created_nothing|' || count(*) from public.tenants where slug in ('plain-try', 'weak-try', 'good-slug');
select 'RESULT|anon_exec|' || has_function_privilege('anon', 'public.staff_provision_tenant(text,text,text,text)', 'execute');

-- 7. an expired, unaccepted invite is renewed in place by a retry (the resend path)
update public.invites set expires_at = now() - interval '1 day' where tenant_id = (select id from public.tenants where slug = 'fresh-co');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Fresh Co', 'fresh-co', 'plain@l.test', 'renew');
select 'RESULT|renewed|' || (i.expires_at > now())::text || '|' || ((r.v::jsonb ->> 'token') = i.token)::text from public.invites i join public.res r on r.k = 'renew' where i.tenant_id = (select id from public.tenants where slug = 'fresh-co');

-- 8. isolation: the new owner (aal2) sees only their own tenant; the other owner never sees the new one
do $$ begin
  perform public.as_user('00000000-0000-0000-0000-00000000000c', 'aal2');
  insert into public.res values ('new_owner_sees_tenants', (select count(*) from public.tenants)::text);
  insert into public.res values ('new_owner_sees_other_members', (select count(*) from public.memberships where tenant_id = '11111111-1111-1111-1111-111111111111')::text);
  insert into public.res values ('new_owner_sees_other_audit', (select count(*) from public.audit_log where tenant_id = '11111111-1111-1111-1111-111111111111')::text);
  reset role;
  perform public.as_user('00000000-0000-0000-0000-00000000000d', 'aal2');
  insert into public.res values ('other_owner_sees_new_tenant', (select count(*) from public.tenants where slug = 'harbor-bar')::text);
  insert into public.res values ('other_owner_sees_new_members', (select count(*) from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'harbor-bar')::text);
  reset role;
end $$;
select 'RESULT|' || k || '|' || v from public.res where k like '%sees%';

-- P12: upgrade active member and preserve pending owner.
insert into auth.users (id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000090','upgrade@x.test',now()), ('00000000-0000-0000-0000-000000000091','retain@x.test',now());
insert into public.tenants (name,slug) values ('Upgrade Co','upgrade-co'), ('Retain Co','retain-co');
insert into public.memberships (tenant_id,user_id,role,accepted_at) values
 ((select id from public.tenants where slug='upgrade-co'),'00000000-0000-0000-0000-000000000090','member',now()),
 ((select id from public.tenants where slug='retain-co'),'00000000-0000-0000-0000-000000000091','owner',null);
insert into public.invites (tenant_id,email,role,token) values
 ((select id from public.tenants where slug='upgrade-co'),'upgrade@x.test','owner','upgrade-token'),
 ((select id from public.tenants where slug='retain-co'),'retain@x.test','member','retain-token');
select public.try_accept('00000000-0000-0000-0000-000000000090','upgrade-token','upgrade_accept');
select public.try_accept('00000000-0000-0000-0000-000000000091','retain-token','retain_accept');
select 'RESULT|upgrade_role|' || m.role || '|' || (a.meta->>'role_before') || '|' || (a.meta->>'role_after') from public.memberships m join public.tenants t on t.id=m.tenant_id join public.audit_log a on a.tenant_id=t.id and a.action='invite.accepted' where t.slug='upgrade-co';
select 'RESULT|retain_role|' || m.role || '|' || (m.accepted_at is not null)::text || '|' || (a.meta->>'role_before') || '|' || (a.meta->>'role_after') from public.memberships m join public.tenants t on t.id=m.tenant_id join public.audit_log a on a.tenant_id=t.id and a.action='invite.accepted' where t.slug='retain-co';
select public.try_provision('00000000-0000-0000-0000-00000000000a','aal2','Harbor Bar','harbor-bar','newowner@x.test','wrong_key','different-key');
select 'RESULT|wrong_key|' || v from public.res where k='wrong_key';
select public.try_provision('00000000-0000-0000-0000-00000000000a','aal2','Harbor Bar','harbor-bar','newowner@x.test','missing_key',null);
select 'RESULT|missing_key|' || v from public.res where k='missing_key';

-- ROUND 4 (P16): role ordering includes admin; unknown roles refuse; nothing is lowered.
insert into auth.users (id,email,email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a1','v@x.test',now()),('00000000-0000-0000-0000-0000000000a2','adm@x.test',now()),('00000000-0000-0000-0000-0000000000a3','own@x.test',now()),('00000000-0000-0000-0000-0000000000a4','weird@x.test',now());
insert into public.tenants (name,slug) values ('Role Co','role-co');
insert into public.memberships (tenant_id,user_id,role,accepted_at) values
 ((select id from public.tenants where slug='role-co'),'00000000-0000-0000-0000-0000000000a1','viewer',now()),
 ((select id from public.tenants where slug='role-co'),'00000000-0000-0000-0000-0000000000a2','admin',now()),
 ((select id from public.tenants where slug='role-co'),'00000000-0000-0000-0000-0000000000a3','owner',now()),
 ((select id from public.tenants where slug='role-co'),'00000000-0000-0000-0000-0000000000a4','member',now());
insert into public.invites (tenant_id,email,role,token) values
 ((select id from public.tenants where slug='role-co'),'v@x.test','admin','r4-viewer-admin'),
 ((select id from public.tenants where slug='role-co'),'adm@x.test','owner','r4-admin-owner'),
 ((select id from public.tenants where slug='role-co'),'own@x.test','admin','r4-owner-admin'),
 ((select id from public.tenants where slug='role-co'),'weird@x.test','superuser','r4-weird');
select public.try_accept('00000000-0000-0000-0000-0000000000a1','r4-viewer-admin','r4a');
select public.try_accept('00000000-0000-0000-0000-0000000000a2','r4-admin-owner','r4b');
select public.try_accept('00000000-0000-0000-0000-0000000000a3','r4-owner-admin','r4c');
select public.try_accept('00000000-0000-0000-0000-0000000000a4','r4-weird','r4d');
select 'RESULT|r4_roles|' || string_agg(m.role, ',' order by m.user_id) from public.memberships m where m.tenant_id=(select id from public.tenants where slug='role-co');
select 'RESULT|r4_unknown_role|' || v from public.res where k='r4d';
select 'RESULT|r4_weird_invite_unconsumed|' || (accepted_at is null)::text from public.invites where token='r4-weird';
select 'RESULT|r4_rank|' || public.role_rank('viewer') || public.role_rank('member') || public.role_rank('admin') || public.role_rank('owner') || coalesce(public.role_rank('x')::text, 'null');

-- ROUND 4 (P17): another staff user cannot replay the operation; one key cannot create two businesses; no plaintext key stored.
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000b1','staff2@l.test');
insert into private.staff values ('00000000-0000-0000-0000-0000000000b1');
select public.try_provision('00000000-0000-0000-0000-0000000000b1','aal2','Harbor Bar','harbor-bar','newowner@x.test','r4_other_staff_replay','key-harbor-bar');
select public.try_provision('00000000-0000-0000-0000-00000000000a','aal2','Key Reuse','key-reuse-co','keyreuse@x.test','r4_key_reuse','key-harbor-bar');
select 'RESULT|r4_other_staff_replay|' || v from public.res where k='r4_other_staff_replay';
select 'RESULT|r4_key_reuse|' || v from public.res where k='r4_key_reuse';
select 'RESULT|r4_key_reuse_created_nothing|' || count(*) from public.tenants where slug='key-reuse-co';
select 'RESULT|r4_no_plaintext_key|' || count(*) from public.tenants where provisioning_key is not null;
select 'RESULT|r4_digest_shape|' || (provisioning_key_digest ~ '^[0-9a-f]{64}$')::text || '|' || (provisioning_key_digest <> 'key-harbor-bar')::text from public.tenants where slug='harbor-bar';

-- ROUND 4 (P18): a retry touches only the invite this operation created, even when a newer live owner invite exists for the same email.
select public.try_provision('00000000-0000-0000-0000-00000000000a','aal2','Race Co','race-co','race@x.test','r4_first');
update public.invites set expires_at = now() - interval '2 days' where tenant_id=(select id from public.tenants where slug='race-co');
insert into public.invites (tenant_id,email,role,token) values ((select id from public.tenants where slug='race-co'),'race@x.test','owner','r4-newer-live');
select public.try_provision('00000000-0000-0000-0000-00000000000a','aal2','Race Co','race-co','race@x.test','r4_retry');
select 'RESULT|r4_retry_exact_invite|' || ((b.v::jsonb ->> 'invite_id') = (a.v::jsonb ->> 'invite_id'))::text || '|' || ((b.v::jsonb ->> 'token') <> 'r4-newer-live')::text || '|' || (b.v::jsonb ->> 'accepted') from public.res a, public.res b where a.k='r4_first' and b.k='r4_retry';
select 'RESULT|r4_renewed_audit|' || count(*) from public.audit_log where action='tenant.provision_invite_renewed';
