-- NOT APPLIED to prod. Staff-only path to add a client business.
-- public.create_tenant needs auth.uid() = the new owner, so staff cannot call it for someone else.
-- These two functions are SECURITY DEFINER, staff + MFA only, and leave create_tenant untouched.
-- RLS policies are NOT modified here.
--
-- Owner authority (red team PORTAL-1 P5): staff cannot name an arbitrary existing auth user as owner. The caller must give the
-- owner's email AND the user id, and the id must be that email's user. Two cases:
--   * freshly invited (auth.users.invited_at within the last hour, never signed in): the invite email is the owner's consent;
--     membership is created accepted, audited as 'tenant.provisioned'.
--   * a pre-existing account: membership is created PENDING (accepted_at null, invisible to the portal until the person accepts)
--     and audited as 'tenant.provisioned_pending_owner'. Nobody becomes owner of a company they did not agree to join.
-- Every provisioning writes an audit row carrying the actor, owner id, owner email and which case applied.

drop function if exists public.staff_provision_tenant(text, text, uuid);

create or replace function public.staff_slug_taken(p_slug text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  return exists (select 1 from public.tenants where slug = lower(trim(p_slug)));
end $$;

create or replace function public.staff_provision_tenant(p_name text, p_slug text, p_owner uuid, p_owner_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid; v_slug text := lower(trim(coalesce(p_slug, ''))); v_name text := trim(coalesce(p_name, ''));
  v_email text; v_invited timestamptz; v_signed_in timestamptz; v_fresh boolean;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'business name must be 2 to 120 characters'; end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'slug must be 3 to 40 lowercase letters, digits or hyphens'; end if;
  select email, invited_at, last_sign_in_at into v_email, v_invited, v_signed_in from auth.users where id = p_owner;
  if not found then raise exception 'owner not found'; end if;
  if lower(trim(coalesce(p_owner_email, ''))) = '' or lower(v_email) <> lower(trim(p_owner_email)) then
    raise exception 'owner must be the user of the invited email';
  end if;
  v_fresh := v_invited is not null and v_invited > now() - interval '1 hour' and v_signed_in is null;
  if exists (select 1 from public.tenants where slug = v_slug) then raise exception 'slug already in use'; end if;

  insert into public.tenants (name, slug) values (v_name, v_slug) returning id into v_tenant;
  insert into public.memberships (tenant_id, user_id, role, accepted_at, invited_by)
  values (v_tenant, p_owner, 'owner', case when v_fresh then now() else null end, auth.uid());
  insert into public.audit_log (tenant_id, actor, action, target, meta)
  values (v_tenant, auth.uid(), case when v_fresh then 'tenant.provisioned' else 'tenant.provisioned_pending_owner' end, 'tenant:' || v_tenant::text,
          jsonb_build_object('name', v_name, 'slug', v_slug, 'owner_id', p_owner, 'owner_email', v_email,
                             'owner_state', case when v_fresh then 'freshly_invited' else 'existing_account_pending_acceptance' end));
  return v_tenant;
exception when unique_violation then
  raise exception 'slug already in use';
end $$;

revoke all on function public.staff_slug_taken(text) from public, anon;
revoke all on function public.staff_provision_tenant(text, text, uuid, text) from public, anon;
grant execute on function public.staff_slug_taken(text) to authenticated;
grant execute on function public.staff_provision_tenant(text, text, uuid, text) to authenticated;
