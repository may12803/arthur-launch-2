-- Harbor & Vine demo seed and QA cleanup (supabase/loveleeday/seed/*.sql), run against the scratch database.
-- Loads a harbor-vine-demo tenant with QA residue next to other tenants (the shared fixtures plus a Dabney-slugged tenant), applies the seed
-- twice (identical counts), proves no other tenant's rows change, checks the connection health is derived from real runs, then applies the cleanup.
insert into auth.users (id, email, email_confirmed_at) values
  ('97000000-0000-0000-0000-000000000001', 'owner-hv@example.test', now()),
  ('97000000-0000-0000-0000-000000000002', 'viewer-hv@example.test', now()),
  ('97000000-0000-0000-0000-000000000003', 'member-hv@example.test', now()),
  ('97000000-0000-0000-0000-000000000009', 'owner-dab@example.test', now());
insert into public.tenants (id, name, slug) values
  ('97aaaaaa-0000-0000-0000-000000000001', 'Harbor & Vine (demo)', 'harbor-vine-demo'),
  ('97aaaaaa-0000-0000-0000-000000000009', 'Dabney & Co. (test twin)', 'dabney-test');
insert into public.memberships (tenant_id, user_id, role, accepted_at) values
  ('97aaaaaa-0000-0000-0000-000000000001', '97000000-0000-0000-0000-000000000001', 'owner', now()),
  ('97aaaaaa-0000-0000-0000-000000000001', '97000000-0000-0000-0000-000000000002', 'viewer', now()),
  ('97aaaaaa-0000-0000-0000-000000000001', '97000000-0000-0000-0000-000000000003', 'member', now()),
  ('97aaaaaa-0000-0000-0000-000000000009', '97000000-0000-0000-0000-000000000009', 'owner', now());
-- another tenant with its own rows in the seeded tables
insert into public.workstreams (id, tenant_id, key, name) values ('97bbbbbb-0000-0000-0000-000000000009', '97aaaaaa-0000-0000-0000-000000000009', 'finance', 'Dabney finance');
insert into public.coverage_areas (id, tenant_id, grp, area, status) values ('97bbbbbb-0000-0000-0000-00000000000a', '97aaaaaa-0000-0000-0000-000000000009', 'Ops', 'Closing', 'none');
insert into public.tenant_connections (id, tenant_id, connector_key, status) values ('97bbbbbb-0000-0000-0000-00000000000b', '97aaaaaa-0000-0000-0000-000000000009', 'stripe', 'requested');
insert into public.documents (id, tenant_id, name, size_bytes, sha256) values ('97bbbbbb-0000-0000-0000-00000000000c', '97aaaaaa-0000-0000-0000-000000000009', 'qa-dabney-keep.txt', 3, 'x');
insert into public.invites (id, tenant_id, email, role) values ('97bbbbbb-0000-0000-0000-00000000000d', '97aaaaaa-0000-0000-0000-000000000009', 'arthur+harborqa-dabney@loveleedaystudios.com', 'member');

-- QA residue on Harbor, exactly the shapes the audit lists, plus the real demo document that must survive
insert into public.documents (id, tenant_id, name, size_bytes, sha256, by_staff) values
  ('97dddddd-0000-0000-0000-000000000001', '97aaaaaa-0000-0000-0000-000000000001', 'harbor-vine-demo-toast-sales.jsonl', 10, 'real', false),
  ('97dddddd-0000-0000-0000-000000000002', '97aaaaaa-0000-0000-0000-000000000001', 'qa-admin.txt', 3, 'q1', false),
  ('97dddddd-0000-0000-0000-000000000003', '97aaaaaa-0000-0000-0000-000000000001', 'qa-staffgrant.txt', 3, 'q2', true);
insert into public.document_shares (tenant_id, document_id, recipient_email, token_hash, created_by, expires_at) values
  ('97aaaaaa-0000-0000-0000-000000000001', '97dddddd-0000-0000-0000-000000000003', 'arthur+harborqa@loveleedaystudios.com', 'tok-qa', '97000000-0000-0000-0000-000000000001', now() + interval '1 day');
insert into public.invites (tenant_id, email, role) values
  ('97aaaaaa-0000-0000-0000-000000000001', 'arthur+harborqa@loveleedaystudios.com', 'member'),
  ('97aaaaaa-0000-0000-0000-000000000001', 'arthur+harborqa-admin@loveleedaystudios.com', 'viewer'),
  ('97aaaaaa-0000-0000-0000-000000000001', 'someone.real@example.test', 'member');
insert into public.tenant_connections (id, tenant_id, connector_key, status, managed_by) values
  ('97eeeeee-0000-0000-0000-000000000001', '97aaaaaa-0000-0000-0000-000000000001', 'toast', 'requested', 'client'),
  ('97eeeeee-0000-0000-0000-000000000002', '97aaaaaa-0000-0000-0000-000000000001', 'stripe', 'disconnected', 'client');

-- fingerprint of every row that belongs to a tenant other than Harbor, across the seeded tables
create function t.others() returns text language plpgsql as $$
declare v_hv uuid := '97aaaaaa-0000-0000-0000-000000000001'; r text := ''; tbl text; x text;
begin
  foreach tbl in array array['workstreams','workstream_tasks','workstream_grades','deliverables','coverage_areas','contracts','tenant_connections','documents','invites','document_shares','entities','approvals','sync_runs','ingested_records','connection_health','tenants'] loop
    execute format('select coalesce(md5(string_agg(q::text, ''|'' order by q::text)), '''') from public.%I q where %s', tbl, case when tbl = 'tenants' then 'id <> $1' else 'tenant_id <> $1' end) into x using v_hv;
    r := r || tbl || '=' || x || ';';
  end loop;
  return md5(r);
end $$;
create function t.hv(p_tbl text) returns bigint language plpgsql as $$
declare n bigint;
begin execute format('select count(*) from public.%I where tenant_id = $1', p_tbl) into n using '97aaaaaa-0000-0000-0000-000000000001'::uuid; return n; end $$;
create temp table _before as select t.others() as fp;
grant select on _before to public;

-- a seed run against a database whose tenant is absent does nothing
update public.tenants set slug = 'harbor-vine-demo-away' where id = '97aaaaaa-0000-0000-0000-000000000001';
\ir ../seed/harbor-vine-demo.sql
select t.check('seed is a no-op when no tenant has the slug', t.hv('workstreams') = 0 and t.hv('workstream_tasks') = 0 and t.hv('entities') = 0);
update public.tenants set slug = 'harbor-vine-demo' where id = '97aaaaaa-0000-0000-0000-000000000001';

\ir ../seed/harbor-vine-demo.sql
create temp table _c1 as select t.hv('workstreams') ws, t.hv('workstream_tasks') tasks, t.hv('workstream_grades') grades, t.hv('deliverables') deliv, t.hv('coverage_areas') cov, t.hv('contracts') contracts,
  t.hv('tenant_connections') conns, t.hv('entities') ents, t.hv('approvals') appr, t.hv('sync_runs') runs, t.hv('ingested_records') recs, t.hv('connection_health') health,
  (select md5(string_agg(id::text, ',' order by id::text)) from public.workstream_tasks where tenant_id = '97aaaaaa-0000-0000-0000-000000000001') task_ids;
\ir ../seed/harbor-vine-demo.sql
create temp table _c2 as select t.hv('workstreams') ws, t.hv('workstream_tasks') tasks, t.hv('workstream_grades') grades, t.hv('deliverables') deliv, t.hv('coverage_areas') cov, t.hv('contracts') contracts,
  t.hv('tenant_connections') conns, t.hv('entities') ents, t.hv('approvals') appr, t.hv('sync_runs') runs, t.hv('ingested_records') recs, t.hv('connection_health') health,
  (select md5(string_agg(id::text, ',' order by id::text)) from public.workstream_tasks where tenant_id = '97aaaaaa-0000-0000-0000-000000000001') task_ids;

select t.check('seed: 4 workstreams, 12 tasks, 9 grades, 3 deliverables, 14 coverage areas, 2 contracts',
  (select ws = 4 and tasks = 12 and grades = 9 and deliv = 3 and cov = 14 and contracts = 2 from _c1));
select t.check('seed: entities are an org, 3 stores and a warehouse; 5 approvals across money, send and legal',
  (select ents = 5 and appr = 5 from _c1)
  and (select count(*) from public.entities where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and parent_id is not null and kind = 'location') = 4
  and (select count(distinct gate) from public.approvals where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and gate in ('money','send','legal')) = 3);
select t.check('applying the seed twice more leaves identical row counts and ids', (select to_jsonb(a) = to_jsonb(b) from _c1 a, _c2 b));
select t.check('seed leaves every other tenant byte-identical (twin Dabney tenant, shared fixtures)', t.others() = (select fp from _before));
select t.check('seed adds nothing to the other tenants (Dabney twin still has exactly its own rows)',
  (select count(*) from public.workstreams where tenant_id = '97aaaaaa-0000-0000-0000-000000000009') = 1
  and (select count(*) from public.coverage_areas where tenant_id = '97aaaaaa-0000-0000-0000-000000000009') = 1);

-- honesty: a connection reads live only with a succeeded run and ingested rows in the same seed; a failed run reads error; a request stays requested
select t.check('square is live because it has succeeded runs and ingested records',
  (select status from public.tenant_connections where id = '7a2b0008-0000-4000-8000-000000000002') = 'live'
  and (select count(*) from public.sync_runs where connection_id = '7a2b0008-0000-4000-8000-000000000002' and status = 'succeeded') = 2
  and (select count(*) from public.ingested_records where connection_id = '7a2b0008-0000-4000-8000-000000000002') = 6
  and (select health from public.tenant_connections where id = '7a2b0008-0000-4000-8000-000000000002') = 'healthy');
select t.check('shopify reads error with its failed run, never live', (select status from public.tenant_connections where id = '7a2b0008-0000-4000-8000-000000000003') = 'error'
  and (select health from public.tenant_connections where id = '7a2b0008-0000-4000-8000-000000000003') = 'failing');
select t.check('mailchimp stays requested with no runs', (select status from public.tenant_connections where connector_key = 'mailchimp' and tenant_id = '97aaaaaa-0000-0000-0000-000000000001') = 'requested'
  and (select count(*) from public.sync_runs where connection_id = (select id from public.tenant_connections where connector_key = 'mailchimp' and tenant_id = '97aaaaaa-0000-0000-0000-000000000001')) = 0);
select t.check('no Harbor connection is live without a succeeded run and ingested rows', (select count(*) from public.tenant_connections c where c.tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and c.status = 'live'
  and (not exists (select 1 from public.sync_runs r where r.connection_id = c.id and r.status = 'succeeded') or not exists (select 1 from public.ingested_records i where i.connection_id = c.id))) = 0);

-- lineage on every task that carries evidence, and every cited Square ref exists in the ingested records
select t.check('every evidence task carries source_system, source_ref, observed_at and proof',
  (select count(*) from public.workstream_tasks where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and evidence is not null) = 10
  and (select count(*) from public.workstream_tasks where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and evidence is not null
        and (coalesce(evidence->>'source_system', '') = '' or coalesce(evidence->>'source_ref', '') = '' or coalesce(evidence->>'observed_at', '') = '' or coalesce(evidence->>'proof', '') = '')) = 0);
select t.check('every square source_ref cited by a task is a real ingested record',
  (select count(*) from public.workstream_tasks w where w.tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and w.evidence->>'source_system' = 'square'
     and not exists (select 1 from public.ingested_records i where i.source_system = 'square' and i.source_ref = w.evidence->>'source_ref')) = 0);
select t.check('done tasks carry an outcome and proof; no approval is left approved for the engine',
  (select count(*) from public.workstream_tasks where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and status = 'done' and (outcome is null or proof is null)) = 0
  and (select count(*) from public.approvals where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and status = 'approved') = 0);
select t.check('workstream review links point at published or draft deliverables of the same tenant',
  (select count(*) from public.workstreams w where w.tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and w.review_slug is not null
     and not exists (select 1 from public.deliverables d where d.tenant_id = w.tenant_id and d.slug = w.review_slug)) = 0);

-- workstream_decide role enforcement now that tasks exist (audit minor m19): owner and member decide, viewer refused, done and unknown tasks refused
select t.login('97000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('a viewer cannot decide a task', $q$select public.workstream_decide('7a2b0002-0000-4000-8000-000000000003', 'approve', null)$q$, '%only owners, admins and members%');
select t.logout();
select t.login('97000000-0000-0000-0000-000000000003', 'aal2');
select t.check('a member can decide a needs_you task', public.workstream_decide('7a2b0002-0000-4000-8000-000000000003', 'approve', 'ok') is not null);
select t.raises('a done task cannot be decided again', $q$select public.workstream_decide('7a2b0002-0000-4000-8000-000000000001', 'approve', null)$q$, '%already done%');
select t.raises('an unknown task is not found', $q$select public.workstream_decide('00000000-0000-0000-0000-0000000000ff', 'approve', null)$q$, '%not found%');
select t.logout();

-- the portal reads: owner sees the seeded workstreams, tasks and deliverables through RLS
select t.login('97000000-0000-0000-0000-000000000001', 'aal2');
select t.check('the Harbor owner reads 4 workstreams, 12 tasks and 3 deliverables under RLS',
  (select count(*) from public.workstreams) >= 4 and (select count(*) from public.workstream_tasks where tenant_id = '97aaaaaa-0000-0000-0000-000000000001') = 12
  and (select count(*) from public.deliverables where tenant_id = '97aaaaaa-0000-0000-0000-000000000001') = 3);
select t.logout();

-- QA cleanup. Re-take the fingerprint of the other tenants after the seed and the decisions above (those touched Harbor only)
create temp table _before2 as select t.others() as fp;
\ir ../seed/harbor-vine-qa-cleanup.sql
select t.check('cleanup removes the QA documents and their shares', (select count(*) from public.documents where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and name ~ '^qa-') = 0
  and (select count(*) from public.document_shares where tenant_id = '97aaaaaa-0000-0000-0000-000000000001') = 0);
select t.check('cleanup keeps the real demo document', (select count(*) from public.documents where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and name = 'harbor-vine-demo-toast-sales.jsonl') = 1);
select t.check('cleanup removes the pending QA invites but not a real invite', (select count(*) from public.invites where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and email::text like 'arthur+harborqa%') = 0
  and (select count(*) from public.invites where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and email::text = 'someone.real@example.test') = 1);
select t.check('cleanup removes the QA toast and stripe connection rows but keeps the seeded connections',
  (select count(*) from public.tenant_connections where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and connector_key in ('toast', 'stripe')) = 0
  and (select count(*) from public.tenant_connections where tenant_id = '97aaaaaa-0000-0000-0000-000000000001' and connector_key in ('square', 'shopify', 'mailchimp')) = 3);
select t.check('cleanup touches no other tenant (including a qa-named document and an arthur+harborqa invite on the Dabney twin)', t.others() = (select fp from _before2)
  and (select count(*) from public.documents where id = '97bbbbbb-0000-0000-0000-00000000000c') = 1 and (select count(*) from public.invites where id = '97bbbbbb-0000-0000-0000-00000000000d') = 1);
\ir ../seed/harbor-vine-qa-cleanup.sql
select t.check('a second cleanup run matches nothing and the seed survives it', (select count(*) from public.workstream_tasks where tenant_id = '97aaaaaa-0000-0000-0000-000000000001') = 12);
