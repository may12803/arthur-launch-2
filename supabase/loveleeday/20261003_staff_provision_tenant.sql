-- NOT APPLIED to prod. Staff-only path to add a client business.
-- public.create_tenant needs auth.uid() = the new owner, so staff cannot call it for someone else.
-- These two functions are SECURITY DEFINER, staff + MFA only, and leave create_tenant untouched.
-- RLS policies are NOT modified here.

create or replace function public.staff_slug_taken(p_slug text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  return exists (select 1 from public.tenants where slug = lower(trim(p_slug)));
end $$;

create or replace function public.staff_provision_tenant(p_name text, p_slug text, p_owner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_slug text := lower(trim(coalesce(p_slug, ''))); v_name text := trim(coalesce(p_name, '')); v_email text;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'business name must be 2 to 120 characters'; end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'slug must be 3 to 40 lowercase letters, digits or hyphens'; end if;
  select email into v_email from auth.users where id = p_owner;
  if not found then raise exception 'owner not found'; end if;
  if exists (select 1 from public.tenants where slug = v_slug) then raise exception 'slug already in use'; end if;

  insert into public.tenants (name, slug) values (v_name, v_slug) returning id into v_tenant;
  insert into public.memberships (tenant_id, user_id, role, accepted_at, invited_by)
  values (v_tenant, p_owner, 'owner', now(), auth.uid());
  insert into public.audit_log (tenant_id, actor, action, target, meta)
  values (v_tenant, auth.uid(), 'tenant.provisioned', 'tenant:' || v_tenant::text,
          jsonb_build_object('name', v_name, 'slug', v_slug, 'owner_id', p_owner, 'owner_email', v_email));
  return v_tenant;
exception when unique_violation then
  raise exception 'slug already in use';
end $$;

revoke all on function public.staff_slug_taken(text) from public, anon;
revoke all on function public.staff_provision_tenant(text, text, uuid) from public, anon;
grant execute on function public.staff_slug_taken(text) to authenticated;
grant execute on function public.staff_provision_tenant(text, text, uuid) to authenticated;
