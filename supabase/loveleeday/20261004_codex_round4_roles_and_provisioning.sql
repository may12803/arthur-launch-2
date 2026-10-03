-- Codex portal round 4 (PORTAL-4 P16, P17, P18). Rollback: supabase/loveleeday/rollback/20261004_codex_round4_roles_and_provisioning.sql
--
-- Shared root cause of P16: the role ordering was an inline array literal inside accept_invite, so it silently omitted `admin` and
-- could not be reused or tested. There is now ONE ordering, public.role_rank(), used by accept_invite; an unknown role raises instead
-- of ranking as NULL (NULL compares false, which is how a role used to be silently kept).
-- Shared root cause of P17/P18: a provisioning retry was matched by slug + owner email + a plaintext client key, then the OLDEST
-- owner invite for that email was used. A retry is now bound to the operation itself: the tenant stores a unique digest of
-- (initiating staff user, key), the initiating staff user, and the exact invite id the operation created. A retry must present the same
-- actor + key + slug + email and only ever touches that one invite row.

create or replace function public.role_rank(p_role text) returns int language sql immutable set search_path = '' as $$
  select case p_role when 'viewer' then 1 when 'member' then 2 when 'admin' then 3 when 'owner' then 4 else null end
$$;
revoke all on function public.role_rank(text) from public, anon;
grant execute on function public.role_rank(text) to authenticated;

alter table public.tenants add column if not exists provisioning_key_digest text;
alter table public.tenants add column if not exists provisioning_actor uuid;
alter table public.tenants add column if not exists provisioning_invite_id uuid;
create unique index if not exists tenants_provisioning_key_digest_uq on public.tenants (provisioning_key_digest) where provisioning_key_digest is not null;
alter table public.tenants add column if not exists provisioning_key text;
-- The plaintext key is no longer stored or read.
update public.tenants set provisioning_key = null where provisioning_key is not null;

create or replace function public.staff_provision_tenant(p_name text, p_slug text, p_owner_email text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, ''))); v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_tenant uuid; v_inv public.invites%rowtype; v_created boolean := false; v_digest text; v_t public.tenants%rowtype;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'business name must be 2 to 120 characters'; end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'slug must be 3 to 40 lowercase letters, digits or hyphens'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'owner email is not valid'; end if;
  if p_key is null or length(p_key) < 8 or length(p_key) > 128 then raise exception 'provisioning key must be 8 to 128 characters'; end if;
  v_digest := encode(sha256(convert_to(auth.uid()::text || ':' || p_key, 'utf8')), 'hex');

  perform pg_advisory_xact_lock(hashtext('provision:' || v_slug));
  perform pg_advisory_xact_lock(hashtext('provision-key:' || v_digest));
  select * into v_t from public.tenants where slug = v_slug;
  if found then
    -- Same operation only: same initiating staff user, same key, same owner email, and the invite this operation created.
    if v_t.provisioning_key_digest is distinct from v_digest or v_t.provisioning_actor is distinct from auth.uid() or v_t.provisioning_invite_id is null then
      raise exception 'slug already in use';
    end if;
    v_tenant := v_t.id;
    select * into v_inv from public.invites where id = v_t.provisioning_invite_id and tenant_id = v_tenant and role = 'owner' and lower(email::text) = v_email for update;
    if not found then raise exception 'slug already in use'; end if;
    if v_inv.accepted_at is null and v_inv.expires_at <= now() then
      update public.invites set expires_at = now() + interval '7 days' where id = v_inv.id returning * into v_inv;
      insert into public.audit_log (tenant_id, actor, action, target, meta)
      values (v_tenant, auth.uid(), 'tenant.provision_invite_renewed', 'invite:' || v_inv.id::text, jsonb_build_object('invite_id', v_inv.id));
    end if;
  else
    if exists (select 1 from public.tenants where provisioning_key_digest = v_digest) then raise exception 'provisioning key already used for another business'; end if;
    insert into public.tenants (name, slug, provisioning_key_digest, provisioning_actor) values (v_name, v_slug, v_digest, auth.uid()) returning id into v_tenant;
    insert into public.invites (tenant_id, email, role) values (v_tenant, v_email, 'owner') returning * into v_inv;
    update public.tenants set provisioning_invite_id = v_inv.id where id = v_tenant;
    insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'tenant.provisioned', 'tenant:' || v_tenant::text,
            jsonb_build_object('name', v_name, 'slug', v_slug, 'owner_email', v_email, 'invite_id', v_inv.id));
    v_created := true;
  end if;
  return jsonb_build_object('tenant_id', v_tenant, 'invite_id', v_inv.id, 'token', v_inv.token, 'created', v_created, 'accepted', v_inv.accepted_at is not null);
end $$;
revoke all on function public.staff_provision_tenant(text, text, text, text) from public, anon;
grant execute on function public.staff_provision_tenant(text, text, text, text) to authenticated;

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
  if public.role_rank(v_invite.role) is null then raise exception 'invite carries an unknown role'; end if;
  select role into v_before from public.memberships where tenant_id = v_invite.tenant_id and user_id = v_uid for update;
  if v_before is not null and public.role_rank(v_before) is null then raise exception 'existing membership has an unknown role'; end if;
  insert into public.memberships (tenant_id, user_id, role, accepted_at, invited_by) values (v_invite.tenant_id, v_uid, v_invite.role, now(), null)
  on conflict (tenant_id, user_id) do update set
    role = case when public.role_rank(excluded.role) > public.role_rank(public.memberships.role) then excluded.role else public.memberships.role end,
    accepted_at = coalesce(public.memberships.accepted_at, excluded.accepted_at)
  returning id, role into v_membership_id, v_after;
  update public.invites set accepted_at = now() where id = v_invite.id;
  insert into public.audit_log (tenant_id, actor, action, target, meta) values
    (v_invite.tenant_id, v_uid, 'invite.accepted', 'membership:' || v_membership_id::text,
     jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role, 'role_before', v_before, 'role_after', v_after));
  return v_membership_id;
end; $f$;
