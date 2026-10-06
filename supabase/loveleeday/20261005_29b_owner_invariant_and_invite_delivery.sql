-- Codex re-grade 2026-10-06, new defects 1 and 2.
-- 1. One owner per company is now a database rule, and a transfer locks the company's owner row before checking the
--    caller, so two concurrent transfers serialize: the second sees the caller is no longer owner and is refused.
-- 2. Invites record whether their email went out (emailed_at / email_error), so the Team page can show an unsent
--    invite instead of treating every pending row as delivered.
-- Idempotent.

create unique index if not exists memberships_one_owner_per_tenant on public.memberships (tenant_id) where role = 'owner';

create or replace function public.tenant_transfer_ownership(p_membership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_user uuid; v_role text; v_accepted timestamptz;
begin
  select tenant_id into v_tenant from public.memberships where id = p_membership;
  if v_tenant is null then raise exception 'member not found'; end if;
  -- Serialize transfers for this company: lock the current owner row first, then re-read the target under the lock.
  perform 1 from public.memberships where tenant_id = v_tenant and role = 'owner' for update;
  select user_id, role, accepted_at into v_user, v_role, v_accepted from public.memberships where id = p_membership for update;
  if v_user is null then raise exception 'member not found'; end if;
  perform private.require_role(v_tenant, 'owner', false);
  if v_user = auth.uid() then raise exception 'you already own this company'; end if;
  if v_accepted is null then raise exception 'the new owner must accept their invitation first'; end if;
  update public.memberships set role = 'admin' where tenant_id = v_tenant and user_id = auth.uid();
  update public.memberships set role = 'owner' where id = p_membership;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'tenant.ownership_transferred', 'membership:' || p_membership, jsonb_build_object('from_user', auth.uid(), 'to_user', v_user, 'to_role_before', v_role));
end $$;

alter table public.invites add column if not exists emailed_at timestamptz;
alter table public.invites add column if not exists email_error text;
