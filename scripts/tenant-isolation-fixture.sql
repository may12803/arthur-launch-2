-- Two-tenant fixture for scripts/tenant-isolation-probe.mjs. BRANCH DATABASES ONLY. Never run against production.
-- Users: a@probe.test (admin of tenant A), b@probe.test (admin of tenant B). Password 'Probe-Pass-2026-xyz'. TOTP secret JBSWY3DPEHPK3PXP.
do $$ begin
  if exists (select 1 from public.tenants where name = 'Dabney & Co.') then raise exception 'refusing: this looks like the production project'; end if;
end $$;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
select v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, extensions.crypt('Probe-Pass-2026-xyz', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''
from (values ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'a@probe.test'), ('bbbbbbbb-0000-4000-8000-00000000000b'::uuid, 'b@probe.test')) v(id, email)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u where u.email in ('a@probe.test','b@probe.test') and not exists (select 1 from auth.identities i where i.user_id = u.id);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
select gen_random_uuid(), u.id, 'probe', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP' from auth.users u
where u.email in ('a@probe.test','b@probe.test') and not exists (select 1 from auth.mfa_factors f where f.user_id = u.id);

insert into public.tenants (id, name, slug) values
 ('aaaaaaaa-1111-4000-8000-00000000000a', 'Probe Tenant A', 'probe-a'),
 ('bbbbbbbb-1111-4000-8000-00000000000b', 'Probe Tenant B', 'probe-b') on conflict do nothing;
insert into public.memberships (tenant_id, user_id, role, accepted_at) values
 ('aaaaaaaa-1111-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'admin', now()),
 ('bbbbbbbb-1111-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b', 'admin', now()) on conflict do nothing;

-- The shared connector catalog may be empty on a fresh branch; tenant_connections needs one connector to point at.
insert into public.connectors (key, name, category, method, uses, never, read_scope) values ('probe', 'Probe connector', 'test', 'key', 'probe', 'probe', 'probe') on conflict do nothing;

-- One row of every kind per tenant. Fixed ids (…a / …b) so the probe can aim route calls at B's rows.
do $$
declare t record; k text; ws uuid; tk uuid; d uuid; u uuid;
begin
  for t in select id from public.tenants where slug in ('probe-a','probe-b') loop
    k := case when t.id::text like 'aaaa%' then 'a' else 'b' end;
    ws := (case k when 'a' then 'aaaaaaaa-2222-4000-8000-00000000000a' else 'bbbbbbbb-2222-4000-8000-00000000000b' end)::uuid;
    tk := (case k when 'a' then 'aaaaaaaa-3333-4000-8000-00000000000a' else 'bbbbbbbb-3333-4000-8000-00000000000b' end)::uuid;
    d  := (case k when 'a' then 'aaaaaaaa-4444-4000-8000-00000000000a' else 'bbbbbbbb-4444-4000-8000-00000000000b' end)::uuid;
    u  := (case k when 'a' then 'aaaaaaaa-0000-4000-8000-00000000000a' else 'bbbbbbbb-0000-4000-8000-00000000000b' end)::uuid;
    insert into public.workstreams (id, tenant_id, key, name) values (ws, t.id, 'k', 'ws '||k) on conflict do nothing;
    insert into public.workstream_tasks (id, tenant_id, workstream_id, title, status) values (tk, t.id, ws, 'task '||k, 'planned') on conflict do nothing;
    insert into public.workstream_grades (tenant_id, workstream_id, dimension) values (t.id, ws, 'dim '||k);
    insert into public.workstream_decisions (tenant_id, task_id, user_id, decision) values (t.id, tk, u, 'approve');
    insert into public.coverage_areas (tenant_id, grp, area, status) values (t.id, 'g', 'area '||k, 'reviewed');
    insert into public.deliverables (tenant_id, title, slug) values (t.id, 'deliv '||k, 'deliv-'||k);
    insert into public.contracts (tenant_id, title) values (t.id, 'contract '||k);
    insert into public.documents (id, tenant_id, name, size_bytes, sha256) values (d, t.id, 'doc '||k, 1, 'x') on conflict do nothing;
    insert into public.document_shares (id, tenant_id, document_id, recipient_email, token_hash, expires_at)
      values ((case k when 'a' then 'aaaaaaaa-5555-4000-8000-00000000000a' else 'bbbbbbbb-5555-4000-8000-00000000000b' end)::uuid, t.id, d, k||'@x.test', 'h'||k, now() + interval '7 days') on conflict do nothing;
    insert into public.tenant_connections (tenant_id, connector_key, status) select t.id, c.key, 'connected' from public.connectors c order by c.key limit 1 on conflict do nothing;
    insert into public.audit_log (tenant_id, action) values (t.id, 'probe.'||k);
    insert into public.invites (tenant_id, email, role) values (t.id, 'invitee-'||k||'@x.test', 'member');
    -- A revoked, expired grant: gives nobody access, but gives the probe an own row to see in staff_grants for every tenant.
    insert into public.staff_grants (id, tenant_id, staff_user_id, staff_email, reason, expires_at, revoked_at)
      values ((case k when 'a' then 'aaaaaaaa-6666-4000-8000-00000000000a' else 'bbbbbbbb-6666-4000-8000-00000000000b' end)::uuid, t.id, u, 'staff-'||k||'@probe.test', 'probe fixture', now() - interval '1 day', now() - interval '1 day') on conflict do nothing;
  end loop;
end $$;
