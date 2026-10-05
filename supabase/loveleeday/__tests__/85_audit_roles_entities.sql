-- audit_export (admin+, keyset paging), entity tree, scoped approvals, tenant_security owner-only, webhook guards.
create temp table _cut as select now() + interval '1 second' as t1;
grant select on _cut to public;

select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
create temp table _p1 as select * from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, (select t1 from _cut), null, 2);
select t.check('page 1 returns the requested 2 rows', (select count(*) from _p1) = 2);
create temp table _p2 as select * from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, (select t1 from _cut), (select max(id) from _p1), 2);
select t.check('page 2 starts after page 1 (no overlap, strictly increasing ids)', (select min(id) from _p2) > (select max(id) from _p1) and (select count(*) from _p2) >= 1);
create temp table _all as select * from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, (select t1 from _cut), 0, 1000);
select t.check('paging by id reaches every row exactly once', (select count(*) from _all) = (select count(*) from public.audit_log where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and at < (select t1 from _cut) and id > 0)
  and (select count(distinct id) from _all) = (select count(*) from _all));
select t.check('export never returns another tenant''s rows', (select count(*) from _all where action = 'fixture.b') = 0);
select t.check('the export itself is audited once, on the first page only', (select count(*) from public.audit_log where action = 'audit.exported' and tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 1);
select t.check('limit is clamped to at least 1', (select count(*) from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, (select t1 from _cut), 0, -5)) = 1);
select t.logout();

select t.login('a0000000-0000-0000-0000-000000000004', 'aal2');
select t.check('an admin can export', (select count(*) from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, null, 0, 1)) = 1);
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('a member cannot export', $q$select * from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, null, null, 10)$q$, '%not allowed%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000003', 'aal2');
select t.raises('a viewer cannot export', $q$select * from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, null, null, 10)$q$, '%not allowed%');
select t.logout();
select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('tenant B owner cannot export tenant A', $q$select * from public.audit_export('aaaaaaaa-0000-0000-0000-00000000000a', null, null, null, 10)$q$, '%not allowed%');
select t.logout();

-- entities: tree, cycle guard, delete guard, scoping
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
create temp table _e as select public.entity_upsert('aaaaaaaa-0000-0000-0000-00000000000a', null, 'e1000000-0000-0000-0000-00000000000a', 'location', 'Lakeside', 'LAKE', '{}') as loc;
select t.check('owner creates a child entity', (select parent_id from public.entities where id = (select loc from _e)) = 'e1000000-0000-0000-0000-00000000000a');
select t.raises('an entity cannot be moved under itself', format($q$select public.entity_upsert('aaaaaaaa-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-00000000000a', %L, 'org', 'Org A', 'ORG-A', '{}')$q$, (select loc from _e)), '%under itself%');
select t.raises('a parent from another tenant is refused', $q$select public.entity_upsert('aaaaaaaa-0000-0000-0000-00000000000a', null, 'e2000000-0000-0000-0000-00000000000b', 'location', 'X', null, '{}')$q$, '%parent not found%');
select t.raises('an entity with children cannot be deleted', $q$select public.entity_delete('e1000000-0000-0000-0000-00000000000a')$q$, '%inside this one%');
select t.logout();
select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('tenant B cannot delete tenant A entity', format($q$select public.entity_delete(%L)$q$, (select loc from _e)), '%not allowed%');
select t.logout();

-- approvals: gates and scope
insert into public.entities (id, tenant_id, kind, name) values ('e1000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'location', 'Elsewhere');
insert into public.approvals (id, tenant_id, entity_id, gate, title) values
  ('f1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', null, 'money', 'Pay supplier'),
  ('f1000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', (select loc from _e), 'send', 'Send reminder in Lakeside'),
  ('f1000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-0000000000a2', 'send', 'Send reminder Elsewhere');
select t.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('a member cannot decide a money approval', $q$select public.approval_decide('f1000000-0000-0000-0000-0000000000a1', 'approve', null, null)$q$, '%not allowed%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000003', 'aal2');
select t.raises('a viewer cannot decide anything', $q$select public.approval_decide('f1000000-0000-0000-0000-0000000000a2', 'approve', null, null)$q$, '%not allowed%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000004', 'aal2');
select t.check('an admin can approve a money gate', public.approval_decide('f1000000-0000-0000-0000-0000000000a1', 'approve', 'checked invoice', null) = 'approved');
select t.raises('an approval cannot be decided twice', $q$select public.approval_decide('f1000000-0000-0000-0000-0000000000a1', 'reject', 'changed mind', null)$q$, '%already decided%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select public.membership_scope_set('a1000000-0000-0000-0000-000000000002', array[(select loc from _e)]);
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select t.check('a scoped member reads the approval inside their entity', (select count(*) from public.approvals where id = 'f1000000-0000-0000-0000-0000000000a2') = 1);
select t.check('a scoped member cannot read an approval outside their entity', (select count(*) from public.approvals where id = 'f1000000-0000-0000-0000-0000000000a3') = 0);
select t.check('a scoped member cannot read a company-wide approval', (select count(*) from public.approvals where id = 'f1000000-0000-0000-0000-0000000000a1') = 0);
select t.raises('a scoped member cannot decide outside their entity', $q$select public.approval_decide('f1000000-0000-0000-0000-0000000000a3', 'approve', null, null)$q$, '%not allowed%');
select t.check('a scoped member can decide inside their entity', public.approval_decide('f1000000-0000-0000-0000-0000000000a2', 'approve', null, null) = 'approved');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000004', 'aal2');
select t.raises('declining needs a reason', $q$select public.approval_decide('f1000000-0000-0000-0000-0000000000a3', 'reject', '', null)$q$, '%why%');
select t.check('edit returns status edited', public.approval_decide('f1000000-0000-0000-0000-0000000000a3', 'edit', 'lower amount', '{"amount": 5}') = 'edited');
select t.check('edit merged the edited details into proposed', (select proposed ->> 'amount' from public.approvals where id = 'f1000000-0000-0000-0000-0000000000a3') = '5'
  and (select status from public.approvals where id = 'f1000000-0000-0000-0000-0000000000a3') = 'edited');
select t.logout();

-- tenant security: owner only
select t.login('a0000000-0000-0000-0000-000000000004', 'aal2');
select t.raises('an admin cannot change tenant security (owner only)', $q$select public.tenant_security_set('aaaaaaaa-0000-0000-0000-00000000000a', false, '{}', false, 12, 365)$q$, '%not allowed%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select public.tenant_security_set('aaaaaaaa-0000-0000-0000-00000000000a', true, array['example.com'], true, 8, 400);
select t.check('settings persisted', (select session_hours from public.tenant_security where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 8);
select t.raises('enforcing SSO without a domain is refused', $q$select public.tenant_security_set('aaaaaaaa-0000-0000-0000-00000000000a', true, '{}', false, 8, 400)$q$, '%domain%');
select t.raises('retention below the floor is refused', $q$select public.tenant_security_set('aaaaaaaa-0000-0000-0000-00000000000a', false, '{}', false, 8, 5)$q$, '%retention%');

-- webhooks
create temp table _w as select * from public.webhook_upsert('aaaaaaaa-0000-0000-0000-00000000000a', null, 'https://hooks.example.test/in', array['sync.failed'], true);
select t.check('webhook create returns the signing secret once', (select signing_secret from _w) like 'whsec_%');
select t.raises('an http webhook is refused', $q$select * from public.webhook_upsert('aaaaaaaa-0000-0000-0000-00000000000a', null, 'http://hooks.example.test/in', array['sync.failed'], true)$q$, '%https%');
select t.raises('a webhook to a private address is refused', $q$select * from public.webhook_upsert('aaaaaaaa-0000-0000-0000-00000000000a', null, 'https://169.254.169.254/latest', array['sync.failed'], true)$q$, '%public host%');
select t.check('updating an endpoint returns no new secret', (select signing_secret from public.webhook_upsert('aaaaaaaa-0000-0000-0000-00000000000a', (select id from _w), 'https://hooks.example.test/in2', array['sync.failed'], true)) is null);
select t.logout();
select t.check('the signing secret is stored encrypted, not in the clear', (select length(secret_ct) from public.webhook_endpoints where id = (select id from _w)) > 20
  and (select position((select signing_secret from _w) in encode(secret_ct, 'escape')) from public.webhook_endpoints where id = (select id from _w)) = 0);

-- upload mapping
select t.login('a0000000-0000-0000-0000-000000000003', 'aal2');
select t.raises('a viewer cannot save an upload mapping', $q$select public.connection_upload_mapping('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'invoices', '{}', 1)$q$, '%not allowed%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('an upload mapping needs a real document from this tenant', $q$select public.connection_upload_mapping('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'invoices', '{}', 1)$q$, '%document not found%');
select t.logout();
