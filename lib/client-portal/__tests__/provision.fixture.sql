-- Throwaway-database fixture for provision.test.mjs. Mirrors prod's tenants/memberships/audit_log shape and the
-- RLS policies read from the live project on 2026-10-03 (tenants_select_members, memberships_select_*, audit_log_select_members,
-- restrictive require_mfa_aal2). Not run against production.
create role anon nologin; create role authenticated nologin;
create schema auth; create schema private;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to authenticated; grant usage on schema public to authenticated, anon;

create table public.tenants (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, status text not null default 'active', plan text, created_at timestamptz not null default now(), stripe_customer_id text, data_class text not null default 'standard', external_sharing boolean not null default true);
create table public.memberships (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), user_id uuid not null, role text not null, accepted_at timestamptz, invited_by uuid, created_at timestamptz not null default now());
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

alter table public.tenants enable row level security; alter table public.memberships enable row level security; alter table public.audit_log enable row level security;
create policy tenants_select_members on public.tenants for select to authenticated using (public.is_tenant_member(id));
create policy memberships_select_co_members on public.memberships for select to authenticated using (public.is_tenant_member(tenant_id));
create policy memberships_select_own on public.memberships for select to authenticated using (user_id = auth.uid());
create policy audit_log_select_members on public.audit_log for select to authenticated using (tenant_id is not null and public.is_tenant_member(tenant_id));
create policy require_mfa_aal2 on public.tenants as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
create policy require_mfa_aal2 on public.memberships as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
create policy require_mfa_aal2 on public.audit_log as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));

insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'staff@l.test'), ('00000000-0000-0000-0000-00000000000b', 'plain@l.test'),
  ('00000000-0000-0000-0000-00000000000c', 'newowner@x.test'), ('00000000-0000-0000-0000-00000000000d', 'otherowner@y.test');
insert into private.staff values ('00000000-0000-0000-0000-00000000000a');
-- a pre-existing, unrelated tenant owned by "otherowner"
insert into public.tenants (id, name, slug) values ('11111111-1111-1111-1111-111111111111', 'Other Co', 'other-co');
insert into public.memberships (tenant_id, user_id, role, accepted_at) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'owner', now());
insert into public.audit_log (tenant_id, action) values ('11111111-1111-1111-1111-111111111111', 'tenant.created');

create function public.as_user(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal)::text, true); set local role authenticated; end $$;
grant execute on function public.as_user(text, text) to authenticated;
-- SCENARIOS
do $$ declare t uuid; begin
  perform public.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
  t := public.staff_provision_tenant('Harbor Bar', 'Harbor-Bar', '00000000-0000-0000-0000-00000000000c');
  insert into public.res values ('staff_provisions', 'ok');
  reset role;
end $$;
select 'RESULT|tenant_row|' || count(*) from public.tenants where slug = 'harbor-bar';
select 'RESULT|owner_membership|' || role from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'harbor-bar' and m.user_id = '00000000-0000-0000-0000-00000000000c' and m.accepted_at is not null;
select 'RESULT|audit_row|' || action from public.audit_log where target like 'tenant:%' and action = 'tenant.provisioned';
select 'RESULT|' || k || '|' || v from public.res;

create function public.try_provision(uid text, aal text, slug text, key text) returns void language plpgsql as $$
begin
  perform public.as_user(uid, aal);
  begin
    perform public.staff_provision_tenant('Another', slug, '00000000-0000-0000-0000-00000000000c');
    insert into public.res values (key, 'allowed');
  exception when others then insert into public.res values (key, 'refused:' || sqlerrm);
  end;
  reset role;
end $$;
select public.try_provision('00000000-0000-0000-0000-00000000000b', 'aal2', 'plain-try', 'nonstaff');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal1', 'weak-try', 'weak_session');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'harbor-bar', 'dup_slug');
select public.try_provision('00000000-0000-0000-0000-00000000000a', 'aal2', 'Bad Slug!', 'bad_slug');
select 'RESULT|' || k || '|' || v from public.res where k in ('nonstaff', 'weak_session', 'dup_slug', 'bad_slug');
select 'RESULT|anon_exec|' || has_function_privilege('anon', 'public.staff_provision_tenant(text,text,uuid)', 'execute');

-- isolation: the new owner (aal2) sees only their own tenant; the other owner never sees the new one
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
