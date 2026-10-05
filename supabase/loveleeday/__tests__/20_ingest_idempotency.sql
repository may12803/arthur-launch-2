-- ingest_records: same record + same content = no new row; changed content = one new row.
insert into public.tenant_connections (id, tenant_id, connector_key, definition_key, auth_method, status)
  values ('c1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'square', 'square', 'oauth2_authcode', 'connected');
create temp table _ing as select public.sync_run_start(t.sec(), 'c1000000-0000-0000-0000-0000000000a1', 'orders') as run;
select t.check('sync_run_start returns an open run', (select status from public.sync_runs where id = (select run from _ing)) = 'running');
select t.check('first ingest of 3 records inserts 3',
  public.ingest_records(t.sec(), (select run from _ing), '[{"source_ref":"o1","payload":{"total":10}},{"source_ref":"o2","payload":{"total":20}},{"source_ref":"o3","payload":{"total":30}}]') = 3);
select t.check('the same 3 records again insert 0',
  public.ingest_records(t.sec(), (select run from _ing), '[{"source_ref":"o1","payload":{"total":10}},{"source_ref":"o2","payload":{"total":20}},{"source_ref":"o3","payload":{"total":30}}]') = 0);
select t.check('table holds exactly 3 rows after the replay', (select count(*) from public.ingested_records where connection_id = 'c1000000-0000-0000-0000-0000000000a1') = 3);
select t.check('key order and spacing do not change the content hash',
  public.ingest_records(t.sec(), (select run from _ing), '[{"payload":{"total":10},"source_ref":"o1"}]') = 0);
select t.check('one changed payload adds exactly 1 new row',
  public.ingest_records(t.sec(), (select run from _ing), '[{"source_ref":"o1","payload":{"total":10}},{"source_ref":"o2","payload":{"total":21}},{"source_ref":"o3","payload":{"total":30}}]') = 1);
select t.check('table now holds 4 rows (3 + 1 changed)', (select count(*) from public.ingested_records where connection_id = 'c1000000-0000-0000-0000-0000000000a1') = 4);
select t.check('the original and the changed version of o2 both exist', (select count(*) from public.ingested_records where connection_id = 'c1000000-0000-0000-0000-0000000000a1' and source_ref = 'o2') = 2);
select t.check('rows carry the tenant, source system and run from the run, not the caller',
  (select count(*) from public.ingested_records where connection_id = 'c1000000-0000-0000-0000-0000000000a1'
     and tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and source_system = 'square' and ingested_run = (select run from _ing)) = 4);
select t.raises('a record without a source_ref is rejected', format($q$select public.ingest_records(t.sec(), %L, '[{"payload":{"a":1}}]')$q$, (select run from _ing)), '%source_ref%');
select t.check('run counters accumulate (read 10, wrote 4)', (select rows_read from public.sync_runs where id = (select run from _ing)) = 10
  and (select rows_written from public.sync_runs where id = (select run from _ing)) = 4);
select t.check('finishing the run reports a computed health status', public.sync_run_finish(t.sec(), (select run from _ing), 'succeeded', null, null, null, 'cur-1') in ('healthy', 'stale'));
select t.check('cursor advanced on success', (select cursor from public.sync_cursors where connection_id = 'c1000000-0000-0000-0000-0000000000a1' and object = 'orders') = 'cur-1');
select t.raises('a finished run rejects further ingest', format($q$select public.ingest_records(t.sec(), %L, '[{"source_ref":"o9","payload":{"a":1}}]')$q$, (select run from _ing)), '%not open%');
create temp table _ing2 as select public.sync_run_start(t.sec(), 'c1000000-0000-0000-0000-0000000000a1', 'orders') as run;
select t.check('a failed run does not advance the cursor',
  public.sync_run_finish(t.sec(), (select run from _ing2), 'failed', null, null, 'upstream 500', 'cur-BAD') = 'failing'
  and (select cursor from public.sync_cursors where connection_id = 'c1000000-0000-0000-0000-0000000000a1' and object = 'orders') = 'cur-1');
