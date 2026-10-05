-- Engine-facing server RPCs (contract 5d4627d): approval claim is atomic and single use; slugs never cross tenants.
insert into public.approvals (id, tenant_id, gate, title, status, decided_at) values
  ('f1000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'send', 'A approved', 'approved', now() - interval '2 minutes'),
  ('f1000000-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'send', 'A rejected', 'rejected', now()),
  ('f2000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'send', 'B approved', 'approved', now() - interval '1 minute');

select t.check('approval_claim succeeds once (returns the row)', (public.approval_claim(t.sec(), 'f1000000-0000-0000-0000-0000000000e1')).id = 'f1000000-0000-0000-0000-0000000000e1');
select t.check('claimed_at is set by the claim', (select claimed_at from public.approvals where id = 'f1000000-0000-0000-0000-0000000000e1') is not null);
select t.check('the second claim returns null', (public.approval_claim(t.sec(), 'f1000000-0000-0000-0000-0000000000e1')).id is null);
select t.check('a pending approval cannot be claimed', (public.approval_claim(t.sec(), 'f1000000-0000-0000-0000-00000000000a')).id is null
  and (select claimed_at from public.approvals where id = 'f1000000-0000-0000-0000-00000000000a') is null);
select t.check('a rejected approval cannot be claimed', (public.approval_claim(t.sec(), 'f1000000-0000-0000-0000-0000000000e2')).id is null);
select t.check('an unknown id claims nothing', (public.approval_claim(t.sec(), '00000000-0000-0000-0000-000000000000')).id is null);
select t.check('claiming is audited once', (select count(*) from public.audit_log where action = 'approval.claimed' and target = 'approval:f1000000-0000-0000-0000-0000000000e1') = 1);

select t.check('approvals_approved lists approved, unclaimed rows for tenant-b only', (select count(*) from public.approvals_approved(t.sec(), 'tenant-b', 50)) = 1
  and (select title from public.approvals_approved(t.sec(), 'tenant-b', 50)) = 'B approved');
select t.check('a tenant-a slug never returns tenant-b approvals', (select count(*) from public.approvals_approved(t.sec(), 'tenant-a', 50) where tenant_id <> 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.check('a claimed approval drops out of the tenant-a list while unclaimed ones stay', (select count(*) from public.approvals_approved(t.sec(), 'tenant-a', 50) where id = 'f1000000-0000-0000-0000-0000000000e1') = 0
  and (select count(*) from public.approvals where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and status = 'approved' and claimed_at is null)
      = (select count(*) from public.approvals_approved(t.sec(), 'tenant-a', 50)));
select t.raises('an unknown slug raises', $q$select * from public.approvals_approved(t.sec(), 'no-such-tenant', 10)$q$, '%unknown client%');

select t.raises('proof cannot be recorded before the claim', $q$select public.approval_record_proof(t.sec(), 'f2000000-0000-0000-0000-0000000000e1', 'sent message id 123')$q$, '%not claimed%');
select public.approval_record_proof(t.sec(), 'f1000000-0000-0000-0000-0000000000e1', 'sent message id 123');
select t.check('proof is recorded on a claimed approval', (select executed_proof from public.approvals where id = 'f1000000-0000-0000-0000-0000000000e1') = 'sent message id 123');
select t.raises('proof is written once', $q$select public.approval_record_proof(t.sec(), 'f1000000-0000-0000-0000-0000000000e1', 'overwrite')$q$, '%already has proof%');
select t.raises('empty proof is refused', $q$select public.approval_record_proof(t.sec(), 'f1000000-0000-0000-0000-0000000000e1', '  ')$q$, '%proof is required%');

-- ingested_records_since: keyset by seq, scoped by slug
select t.check('tenant-a feed returns only tenant-a records', (select count(*) from public.ingested_records_since(t.sec(), 'tenant-a', 0, 1000)) >= 1
  and (select count(*) from public.ingested_records_since(t.sec(), 'tenant-a', 0, 1000) f join public.ingested_records r on r.id = f.id where r.tenant_id <> 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.check('tenant-b feed contains ch_b1 and no tenant-a source_ref', (select count(*) from public.ingested_records_since(t.sec(), 'tenant-b', 0, 1000) where source_ref = 'ch_b1') = 1
  and (select count(*) from public.ingested_records_since(t.sec(), 'tenant-b', 0, 1000) where source_ref = 'ch_a1') = 0);
select t.check('the keyset cursor pages without overlap', (select count(*) from public.ingested_records_since(t.sec(), 'tenant-a', (select max(seq) from public.ingested_records_since(t.sec(), 'tenant-a', 0, 2)), 1000))
  = (select count(*) from public.ingested_records_since(t.sec(), 'tenant-a', 0, 1000)) - 2);
select t.check('the cursor past the end returns nothing', (select count(*) from public.ingested_records_since(t.sec(), 'tenant-a', (select max(seq) from public.ingested_records), 10)) = 0);
select t.raises('feed for an unknown slug raises', $q$select * from public.ingested_records_since(t.sec(), 'no-such-tenant', 0, 10)$q$, '%unknown client%');

-- workstream_task_propose
create temp table _task as select public.workstream_task_propose(t.sec(), 'tenant-a', 'finance', 'Chase 3 late invoices', 'detail', 'rec', '{"n":3}', 'evidence-row-1') as id;
select t.check('engine proposes a task into the tenant workstream (needs_you)', (select status from public.workstream_tasks where id = (select id from _task)) = 'needs_you');
select t.check('a duplicate open title reuses the task', public.workstream_task_propose(t.sec(), 'tenant-a', 'finance', 'Chase 3 late invoices', 'x', 'y', '{}', 'p') = (select id from _task));
select t.check('the proposed task lands in tenant A only', (select count(*) from public.workstream_tasks where title = 'Chase 3 late invoices' and tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0);
select t.raises('an unknown workstream raises', $q$select public.workstream_task_propose(t.sec(), 'tenant-a', 'nope', 'x', null, null, '{}', 'p')$q$, '%unknown workstream%');
