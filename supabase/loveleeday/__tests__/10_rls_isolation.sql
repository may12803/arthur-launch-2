-- RLS isolation. Tenant A's owner at aal2 must see their own rows (positive control, so a broken fixture cannot pass) and
-- zero of tenant B's rows. Read-only: scripts/db-test.sh re-runs this file with one policy mutated to prove it can fail.
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');

select t.check('A sees own ' || x.tbl || ' (control)', t.n(format('select count(*) from public.%I where tenant_id = %L', x.tbl, 'aaaaaaaa-0000-0000-0000-00000000000a')) >= 1)
from (values ('tenant_connections'), ('ingested_records'), ('sync_runs'), ('approvals'), ('entities'), ('audit_log'), ('connection_health'),
             ('upload_mappings'), ('tenant_security'), ('webhook_deliveries')) as x(tbl);
select t.check('A sees own api_keys (control)', t.n($q$select count(id) from public.api_keys where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) >= 1);
select t.check('A sees own webhook_endpoints (control)', t.n($q$select count(id) from public.webhook_endpoints where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) >= 1);

select t.check('tenant A user cannot read tenant B ' || x.tbl, t.n(format('select count(*) from public.%I where tenant_id = %L', x.tbl, 'bbbbbbbb-0000-0000-0000-00000000000b')) = 0)
from (values ('tenant_connections'), ('ingested_records'), ('sync_runs'), ('approvals'), ('entities'), ('audit_log'), ('connection_health'),
             ('upload_mappings'), ('tenant_security'), ('webhook_deliveries')) as x(tbl);
select t.check('tenant A user cannot read tenant B api_keys', t.n($q$select count(id) from public.api_keys where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) = 0);
select t.check('tenant A user cannot read tenant B webhook_endpoints', t.n($q$select count(id) from public.webhook_endpoints where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) = 0);
select t.check('tenant A user cannot read tenant B sync_cursors', t.n($q$select count(*) from public.sync_cursors where connection_id = 'c2000000-0000-0000-0000-00000000000b'$q$) = 0);
select t.check('tenant A user cannot read tenant B membership_scopes', t.n($q$select count(*) from public.membership_scopes where entity_id = 'e2000000-0000-0000-0000-00000000000b'$q$) = 0);
select t.check('tenant A user cannot read tenant B tenants/memberships', t.n($q$select count(*) from public.tenants where id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) = 0
  and t.n($q$select count(*) from public.memberships where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) = 0);
select t.check('an unfiltered select over tenant_connections returns only A rows', t.n('select count(*) from public.tenant_connections where tenant_id <> ''aaaaaaaa-0000-0000-0000-00000000000a''') = 0);

select t.raises('api_keys.key_hash is not readable through the API', 'select key_hash from public.api_keys', '%permission denied%');
select t.raises('webhook_endpoints.secret_ct is not readable through the API', 'select secret_ct from public.webhook_endpoints', '%permission denied%');
select t.raises('no direct client INSERT into approvals', $q$insert into public.approvals (tenant_id, gate, title) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'auto', 'x')$q$, '%permission denied%');
select t.raises('no direct client UPDATE of tenant_connections', $q$update public.tenant_connections set status = 'live'$q$, '%permission denied%');
select t.raises('no direct client DELETE of audit_log', 'delete from public.audit_log', '%permission denied%');
select t.raises('private.oauth_states is not reachable by clients', 'select count(*) from private.oauth_states', '%permission denied%');
select t.logout();

select t.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select t.check('a plain member cannot read A api_keys (admin only)', t.n($q$select count(id) from public.api_keys$q$) = 0);
select t.check('a plain member can read A tenant_connections', t.n('select count(*) from public.tenant_connections') >= 1);
select t.logout();

select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('tenant B owner sees B rows and no A rows (tenant_connections)', t.n('select count(*) from public.tenant_connections') >= 1
  and t.n($q$select count(*) from public.tenant_connections where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) = 0);
select t.logout();
