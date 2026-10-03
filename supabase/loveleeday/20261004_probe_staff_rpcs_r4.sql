-- BRANCH DATABASES ONLY (the isolation probe's target). Never apply to production; each function refuses to run unless the database is
-- the two-tenant probe fixture. Codex portal round 4 (PORTAL-4 P20, P22, P23). Read-only except staff_probe_reset_fixture.
--
-- P20: the probe's RPC list was a hand-written list, so a SECURITY DEFINER function nobody listed was never tested. The probe now reads
--      every function in public (with its argument names and who may execute it) from the target database and fails on any it has not
--      classified.
-- P22: the probe's own-tenant controls change tenant A (external sharing, a connection status). staff_probe_reset_fixture puts those
--      back to the fixture values so a rerun starts from the same state.
-- P23: staff_probe_target answers true only for the probe fixture (exactly tenants probe-a and probe-b, nothing else), so the probe can
--      refuse to run against any other database before it performs a single write.

create or replace function public.staff_probe_is_fixture() returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.tenants) = 2 and (select count(*) from public.tenants where slug in ('probe-a', 'probe-b')) = 2
$$;
revoke all on function public.staff_probe_is_fixture() from public, anon, authenticated;

create or replace function public.staff_probe_target() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  return jsonb_build_object('fixture_only', public.staff_probe_is_fixture(), 'tenants', (select count(*) from public.tenants));
end $$;

create or replace function public.staff_probe_function_inventory() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'secdef', p.prosecdef,
      'auth_exec', has_function_privilege('authenticated', p.oid, 'execute'), 'anon_exec', has_function_privilege('anon', p.oid, 'execute'))
    order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f');
end $$;

create or replace function public.staff_probe_reset_fixture() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if not public.staff_probe_is_fixture() then raise exception 'refusing: not the probe fixture database'; end if;
  update public.tenants set external_sharing = true where slug in ('probe-a', 'probe-b');
  update public.tenant_connections set status = 'connected', error = null where tenant_id in (select id from public.tenants where slug in ('probe-a', 'probe-b'));
end $$;

revoke all on function public.staff_probe_target() from public, anon;
revoke all on function public.staff_probe_function_inventory() from public, anon;
revoke all on function public.staff_probe_reset_fixture() from public, anon;
grant execute on function public.staff_probe_target() to authenticated;
grant execute on function public.staff_probe_function_inventory() to authenticated;
grant execute on function public.staff_probe_reset_fixture() to authenticated;
