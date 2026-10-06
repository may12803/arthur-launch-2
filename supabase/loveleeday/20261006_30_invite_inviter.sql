-- The invitation screen shows who invited you ("Jordan Lee invited you as a Member"), per the approved
-- 2026-10-06 sign-in design. invites gains invited_by, filled automatically from the inserting admin's session
-- (the invite route writes through the caller's own session, so auth.uid() is the inviter; no route change).
-- get_invite_preview returns the inviter's profile name only (user_metadata full_name/name); never an email,
-- so a leaked invitation link reveals no address. No name on file -> null -> the screen omits the line.
alter table public.invites
  add column if not exists invited_by uuid default auth.uid() references auth.users(id) on delete set null;

drop function if exists public.get_invite_preview(text);
create function public.get_invite_preview(p_token text)
 returns table(tenant_name text, role text, expired boolean, email_hint text, inviter_name text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_token is null or length(p_token) < 12 then return; end if;
  return query
    select t.name, i.role, (i.expires_at <= now()) as expired,
           case when position('@' in i.email::text) > 2
             then left(split_part(i.email::text, '@', 1), 1) || '•••' ||
                  right(split_part(i.email::text, '@', 1), 1) || '@' || split_part(i.email::text, '@', 2)
             else '•••@' || split_part(i.email::text, '@', 2) end as email_hint,
           nullif(left(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), 80), '') as inviter_name
    from public.invites i
    join public.tenants t on t.id = i.tenant_id
    left join auth.users u on u.id = i.invited_by
    where i.token = p_token and i.accepted_at is null;
end;
$function$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated, service_role;
