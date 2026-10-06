-- Membership lifecycle (platform review 2026-10-06): memberships had select-only policies, so a client admin could invite
-- but never change a role, remove someone who left, or hand the company to a new owner; all three needed staff SQL.
-- Three SECURITY DEFINER RPCs, each audited, each re-checking the caller's role under the strong-session rule:
--   membership_set_role(membership, role)   admin+; never makes or unmakes an owner; an admin cannot touch an owner or another admin
--   membership_remove(membership)           admin+ removes members/viewers (owner also admins); anyone but the owner may remove themselves
--   tenant_transfer_ownership(membership)   owner only; the target must be an accepted member; the old owner becomes admin
-- Idempotent: create or replace only.

create or replace function public.membership_set_role(p_membership uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_user uuid; v_before text; v_caller text;
begin
  select tenant_id, user_id, role into v_tenant, v_user, v_before from public.memberships where id = p_membership for update;
  if v_tenant is null then raise exception 'member not found'; end if;
  v_caller := private.require_role(v_tenant, 'admin', false);
  if p_role not in ('viewer', 'member', 'admin') then raise exception 'role must be admin, member, or viewer'; end if;
  if v_user = auth.uid() then raise exception 'you cannot change your own role'; end if;
  if v_before = 'owner' then raise exception 'transfer ownership to change the owner''s role'; end if;
  if v_caller = 'admin' and v_before = 'admin' then raise exception 'only the owner can change another admin''s role'; end if;
  if v_before = p_role then return; end if;
  update public.memberships set role = p_role where id = p_membership;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'membership.role_changed', 'membership:' || p_membership, jsonb_build_object('role_before', v_before, 'role_after', p_role));
end $$;

create or replace function public.membership_remove(p_membership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_user uuid; v_role text; v_caller text;
begin
  select tenant_id, user_id, role into v_tenant, v_user, v_role from public.memberships where id = p_membership for update;
  if v_tenant is null then raise exception 'member not found'; end if;
  if v_role = 'owner' then raise exception 'the owner cannot be removed; transfer ownership first'; end if;
  if v_user = auth.uid() then
    perform private.require_role(v_tenant, 'viewer', false);
  else
    v_caller := private.require_role(v_tenant, 'admin', false);
    if v_caller = 'admin' and v_role = 'admin' then raise exception 'only the owner can remove an admin'; end if;
  end if;
  delete from public.memberships where id = p_membership;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), case when v_user = auth.uid() then 'membership.left' else 'membership.removed' end,
            'membership:' || p_membership, jsonb_build_object('user_id', v_user, 'role', v_role));
end $$;

create or replace function public.tenant_transfer_ownership(p_membership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_user uuid; v_role text; v_accepted timestamptz;
begin
  select tenant_id, user_id, role, accepted_at into v_tenant, v_user, v_role, v_accepted from public.memberships where id = p_membership for update;
  if v_tenant is null then raise exception 'member not found'; end if;
  perform private.require_role(v_tenant, 'owner', false);
  if v_user = auth.uid() then raise exception 'you already own this company'; end if;
  if v_accepted is null then raise exception 'the new owner must accept their invitation first'; end if;
  update public.memberships set role = 'admin' where tenant_id = v_tenant and user_id = auth.uid();
  update public.memberships set role = 'owner' where id = p_membership;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'tenant.ownership_transferred', 'membership:' || p_membership, jsonb_build_object('from_user', auth.uid(), 'to_user', v_user, 'to_role_before', v_role));
end $$;

-- list_tenant_team gains the membership id so the Team page can act on a row without a second lookup.
drop function if exists public.list_tenant_team(uuid);
create function public.list_tenant_team(p_tenant uuid)
returns table(user_id uuid, email text, role text, accepted boolean, membership_id uuid)
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.is_tenant_member(p_tenant) then return; end if;
  return query
    select m.user_id, u.email::text, m.role, (m.accepted_at is not null) as accepted, m.id
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant
    order by m.created_at;
end $$;

revoke all on function public.membership_set_role(uuid, text), public.membership_remove(uuid), public.tenant_transfer_ownership(uuid), public.list_tenant_team(uuid) from public, anon;
grant execute on function public.membership_set_role(uuid, text), public.membership_remove(uuid), public.tenant_transfer_ownership(uuid), public.list_tenant_team(uuid) to authenticated;
