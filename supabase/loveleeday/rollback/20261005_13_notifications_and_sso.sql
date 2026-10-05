-- Rollback for 20261005_13_notifications_and_sso.sql: restores the original is_tenant_member and member_role (as in
-- 20261005_00_base_schema.sql), then drops the SSO helpers and notification preferences.
create or replace function public.is_tenant_member(p_tenant uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.memberships
    where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null
  ) or private.active_grant(p_tenant) is not null;
$function$;

create or replace function private.member_role(p_tenant uuid)
 returns text language sql stable security definer set search_path to ''
as $function$
  select coalesce(
    (select role from public.memberships where tenant_id = p_tenant and user_id = auth.uid() and accepted_at is not null),
    case when private.active_grant(p_tenant) is not null then 'staff' end)
$function$;

drop function if exists public.notification_prefs_set(uuid, text, boolean, boolean);
drop function if exists public.sso_required_for_me();
drop function if exists public.sso_required_for_email(text);
drop function if exists public.sso_required_for_tenant(uuid);
drop function if exists public.sso_session_allowed(uuid);
drop function if exists private.sso_blocks(uuid);
drop function if exists private.sso_required(uuid);
drop table if exists public.notification_prefs;
