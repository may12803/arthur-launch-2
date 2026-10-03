-- NOT APPLIED to prod. Staff-only path to add a client business.
--
-- Design (red team PORTAL-2 P7/P8/P9): provisioning no longer creates auth users or memberships. In ONE transaction it creates the
-- tenant, an `invites` row (role owner, the owner's email, the table's own token + 7 day expiry) and an audit row. The owner joins
-- through the portal's existing accept_invite(p_token) flow, which already binds the token to the invited, confirmed email and
-- activates the membership, for a new account and an existing account alike. Because nothing outside the transaction is created,
-- there is nothing to compensate and nothing to delete: a lost response is retried safely.
--   * Idempotent by slug: a retry for the same slug AND owner email returns the existing tenant/invite (never a duplicate). An expired,
--     unaccepted invite is renewed in place. The same slug with a different owner email is refused as 'slug already in use'.
--   * No consent heuristic: invited_at / last_sign_in_at are never read. Only the owner's own accept_invite grants access.
-- SECURITY DEFINER, staff + MFA only. create_tenant and RLS policies are untouched.

drop function if exists public.staff_slug_taken(text);
drop function if exists public.staff_provision_tenant(text, text, uuid);
drop function if exists public.staff_provision_tenant(text, text, uuid, text);

create or replace function public.staff_provision_tenant(p_name text, p_slug text, p_owner_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, ''))); v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_tenant uuid; v_inv public.invites%rowtype; v_created boolean := false;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'business name must be 2 to 120 characters'; end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'slug must be 3 to 40 lowercase letters, digits or hyphens'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'owner email is not valid'; end if;

  perform pg_advisory_xact_lock(hashtext('provision:' || v_slug));
  select id into v_tenant from public.tenants where slug = v_slug;
  if found then
    select * into v_inv from public.invites where tenant_id = v_tenant and role = 'owner' and lower(email::text) = v_email order by created_at limit 1;
    if not found then raise exception 'slug already in use'; end if;
    if v_inv.accepted_at is null and v_inv.expires_at <= now() then
      update public.invites set expires_at = now() + interval '7 days' where id = v_inv.id returning * into v_inv;
    end if;
  else
    insert into public.tenants (name, slug) values (v_name, v_slug) returning id into v_tenant;
    insert into public.invites (tenant_id, email, role) values (v_tenant, v_email, 'owner') returning * into v_inv;
    insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'tenant.provisioned', 'tenant:' || v_tenant::text,
            jsonb_build_object('name', v_name, 'slug', v_slug, 'owner_email', v_email, 'invite_id', v_inv.id));
    v_created := true;
  end if;
  return jsonb_build_object('tenant_id', v_tenant, 'invite_id', v_inv.id, 'token', v_inv.token, 'created', v_created, 'accepted', v_inv.accepted_at is not null);
end $$;

revoke all on function public.staff_provision_tenant(text, text, text) from public, anon;
grant execute on function public.staff_provision_tenant(text, text, text) to authenticated;
