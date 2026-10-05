-- A password-only (aal1) session sees nothing; the same user at aal2 sees rows (control).
select t.login('a0000000-0000-0000-0000-000000000001', 'aal1');
select t.check('aal1 sees 0 ' || x.tbl, t.n(format('select count(*) from public.%I', x.tbl)) = 0)
from (values ('tenants'), ('memberships'), ('tenant_connections'), ('ingested_records'), ('sync_runs'), ('connection_health'), ('approvals'),
             ('entities'), ('audit_log'), ('upload_mappings'), ('tenant_security'), ('webhook_deliveries'), ('documents'), ('workstreams')) as x(tbl);
select t.check('aal1 sees 0 api_keys', t.n('select count(id) from public.api_keys') = 0);
select t.raises('aal1 cannot call a client RPC', $q$select public.api_key_create('aaaaaaaa-0000-0000-0000-00000000000a', 'x', array['records:read'])$q$, '%two-factor%');
select t.raises('aal1 cannot export the audit log', $q$select * from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, null, null, 10)$q$, '%two-factor%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('same user at aal2 sees rows (control)', t.n('select count(*) from public.tenant_connections') >= 1 and t.n('select count(*) from public.audit_log') >= 1);
select t.logout();
