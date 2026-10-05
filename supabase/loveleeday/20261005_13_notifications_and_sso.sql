create table if not exists public.notification_prefs (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approvals_digest text not null default 'off' check (approvals_digest in ('off', 'daily', 'instant')),
  sync_failures boolean not null default false,
  weekly_summary boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table public.notification_prefs enable row level security;
drop policy if exists notification_prefs_require_mfa_aal2 on public.notification_prefs;
create policy notification_prefs_require_mfa_aal2 on public.notification_prefs as restrictive for select to authenticated using ((select public.session_is_strong()));
drop policy if exists notification_prefs_member_select on public.notification_prefs;
create policy notification_prefs_member_select on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
revoke all on public.notification_prefs from public, anon, authenticated;
grant select on public.notification_prefs to authenticated;

create or replace function private.sso_required(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_security s
    join public.memberships m on m.tenant_id = s.tenant_id
    where s.tenant_id = p_tenant and s.sso_enforced and m.user_id = auth.uid() and m.accepted_at is not null
  ) and private.active_grant(p_tenant) is null
$$;
revoke all on function private.sso_required(uuid) from public, anon, authenticated, service_role;

create or replace function public.sso_required_for_tenant(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when private.member_role(p_tenant) is null then false else private.sso_required(p_tenant) end
$$;
revoke all on function public.sso_required_for_tenant(uuid) from public, anon;
grant execute on function public.sso_required_for_tenant(uuid) to authenticated, service_role;

create or replace function public.sso_session_allowed(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.member_role(p_tenant) is not null and (
    not private.sso_required(p_tenant) or exists (
      select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
      where a ->> 'method' = 'sso/saml'
    )
  )
$$;
revoke all on function public.sso_session_allowed(uuid) from public, anon;
grant execute on function public.sso_session_allowed(uuid) to authenticated, service_role;

-- R3-02: enforcement lives in the two functions every table policy and RPC already calls, so a password session for a
-- member of an SSO-enforced tenant reads and writes nothing there, whether through the portal or straight to the API.
-- Staff with a live grant are exempt (private.sso_required already returns false for them).
create or replace function private.sso_blocks(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.sso_required(p_tenant) and not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a where a ->> 'method' = 'sso/saml')
$$;
revoke all on function private.sso_blocks(uuid) from public, anon, authenticated, service_role;

create or replace function public.is_tenant_member(p_tenant uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select (exists (
    select 1 from public.memberships
    where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null
  ) and not private.sso_blocks(p_tenant)) or private.active_grant(p_tenant) is not null;
$function$;

create or replace function private.member_role(p_tenant uuid)
 returns text language sql stable security definer set search_path to ''
as $function$
  select coalesce(
    case when private.sso_blocks(p_tenant) then null else
      (select role from public.memberships where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null) end,
    case when private.active_grant(p_tenant) is not null then 'staff' end)
$function$;

-- R3-03: no anonymous lookup (it told anyone which domains enforce SSO). After a password sign-in the account holder
-- asks about their OWN memberships only; the answer reveals nothing they could not already see.
drop function if exists public.sso_required_for_email(text);
create or replace function public.sso_required_for_me() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.accepted_at is not null and private.sso_blocks(m.tenant_id))
$$;
revoke all on function public.sso_required_for_me() from public, anon;
grant execute on function public.sso_required_for_me() to authenticated, service_role;

create or replace function public.notification_prefs_set(p_tenant uuid, p_approvals_digest text, p_sync_failures boolean, p_weekly_summary boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  if not public.is_tenant_member(p_tenant) then raise exception 'not allowed'; end if;
  if p_approvals_digest not in ('off', 'daily', 'instant') or p_approvals_digest is null or p_sync_failures is null or p_weekly_summary is null then
    raise exception 'choose valid notification settings';
  end if;
  insert into public.notification_prefs (tenant_id, user_id, approvals_digest, sync_failures, weekly_summary, updated_at)
    values (p_tenant, auth.uid(), p_approvals_digest, p_sync_failures, p_weekly_summary, now())
    on conflict (tenant_id, user_id) do update set approvals_digest = excluded.approvals_digest,
      sync_failures = excluded.sync_failures, weekly_summary = excluded.weekly_summary, updated_at = now();
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (p_tenant, auth.uid(), 'notification_prefs.updated', 'user:' || auth.uid(),
      jsonb_build_object('approvals_digest', p_approvals_digest, 'sync_failures', p_sync_failures, 'weekly_summary', p_weekly_summary));
end $$;
revoke all on function public.notification_prefs_set(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.notification_prefs_set(uuid, text, boolean, boolean) to authenticated, service_role;
