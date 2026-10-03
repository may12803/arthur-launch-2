-- Rollback for 20261004_codex_round4_roles_and_provisioning.sql: restores the round-3 functions (97b4377). Run in the Supabase SQL editor on the SAME project the migration was applied to.
-- Data note: the plaintext provisioning_key values the migration nulled are not restored (they were only a retry guard).
drop index if exists public.tenants_provisioning_key_digest_uq;
create or replace function public.staff_provision_tenant(p_name text, p_slug text, p_owner_email text, p_key text)
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
    if not exists (select 1 from public.tenants where id = v_tenant and provisioning_key = p_key) then raise exception 'slug already in use'; end if;
    select * into v_inv from public.invites where tenant_id = v_tenant and role = 'owner' and lower(email::text) = v_email order by created_at limit 1;
    if not found then raise exception 'slug already in use'; end if;
    if v_inv.accepted_at is null and v_inv.expires_at <= now() then
      update public.invites set expires_at = now() + interval '7 days' where id = v_inv.id returning * into v_inv;
    end if;
  else
    if p_key is null or length(p_key) < 8 or length(p_key) > 128 then raise exception 'provisioning key must be 8 to 128 characters'; end if;
    insert into public.tenants (name, slug, provisioning_key) values (v_name, v_slug, p_key) returning id into v_tenant;
    insert into public.invites (tenant_id, email, role) values (v_tenant, v_email, 'owner') returning * into v_inv;
    insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'tenant.provisioned', 'tenant:' || v_tenant::text,
            jsonb_build_object('name', v_name, 'slug', v_slug, 'owner_email', v_email, 'invite_id', v_inv.id));
    v_created := true;
  end if;
  return jsonb_build_object('tenant_id', v_tenant, 'invite_id', v_inv.id, 'token', v_inv.token, 'created', v_created, 'accepted', v_inv.accepted_at is not null);
end $$;

revoke all on function public.staff_provision_tenant(text, text, text, text) from public, anon;
grant execute on function public.staff_provision_tenant(text, text, text, text) to authenticated;

-- An invited, confirmed user may already have a membership. Acceptance raises its role only.
create or replace function public.accept_invite(p_token text) returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  v_invite public.invites%rowtype; v_membership_id uuid; v_uid uuid := auth.uid(); v_email text; v_confirmed timestamptz;
  v_before text; v_after text;
begin
  if v_uid is null then raise exception 'must be authenticated to accept an invite'; end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  select * into v_invite from public.invites where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'invite not found, already used, or expired'; end if;
  if v_email is null or v_email <> lower(v_invite.email) then raise exception 'this invite was sent to a different email address'; end if;
  if v_confirmed is null then raise exception 'confirm your email address before accepting this invite'; end if;
  select role into v_before from public.memberships where tenant_id = v_invite.tenant_id and user_id = v_uid for update;
  insert into public.memberships (tenant_id, user_id, role, accepted_at, invited_by) values (v_invite.tenant_id, v_uid, v_invite.role, now(), null)
  on conflict (tenant_id, user_id) do update set
    role = case when array_position(array['viewer','member','owner'], excluded.role) > array_position(array['viewer','member','owner'], public.memberships.role) then excluded.role else public.memberships.role end,
    accepted_at = coalesce(public.memberships.accepted_at, excluded.accepted_at)
  returning id, role into v_membership_id, v_after;
  update public.invites set accepted_at = now() where id = v_invite.id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values
    (v_invite.tenant_id, v_uid, 'invite.accepted', 'membership:' || v_membership_id::text,
     jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role, 'role_before', v_before, 'role_after', v_after));
  return v_membership_id;
end; $f$;
alter table public.tenants drop column if exists provisioning_invite_id;
alter table public.tenants drop column if exists provisioning_actor;
alter table public.tenants drop column if exists provisioning_key_digest;
drop function if exists public.role_rank(text);
