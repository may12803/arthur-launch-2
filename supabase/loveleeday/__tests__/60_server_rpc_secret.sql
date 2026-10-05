-- Every server RPC refuses a wrong secret, a short secret and a NULL secret; the right secret passes (control).
select t.raises('wrong secret: ' || x.call, 'select ' || x.call, '%server only%')
from (values
  ($$public.oauth_state_consume(t.badsec(), 'x', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001')$$),
  ($$public.connection_store_tokens(t.badsec(), 'c1000000-0000-0000-0000-00000000000a', '{"access_token":"x"}', now())$$),
  ($$public.connection_secret(t.badsec(), 'c1000000-0000-0000-0000-00000000000a')$$),
  ($$public.connections_due(t.badsec())$$),
  ($$public.sync_run_start(t.badsec(), 'c1000000-0000-0000-0000-00000000000a', 'charges')$$),
  ($$public.sync_cursor_get(t.badsec(), 'c1000000-0000-0000-0000-00000000000a', 'charges')$$),
  ($$public.sync_runs_recent(t.badsec(), 'c1000000-0000-0000-0000-00000000000a', 5)$$),
  ($$public.sync_cursor_set(t.badsec(), 'c1000000-0000-0000-0000-00000000000a', 'charges', 'x')$$),
  ($$public.sync_run_finish(t.badsec(), 'd1000000-0000-0000-0000-00000000000a', 'succeeded')$$),
  ($$public.ingest_records(t.badsec(), 'd1000000-0000-0000-0000-00000000000a', '[]')$$),
  ($$public.connection_health_record(t.badsec(), 'c1000000-0000-0000-0000-00000000000a')$$),
  ($$public.approval_propose(t.badsec(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'auto', 'x', null, '{}')$$),
  ($$public.api_key_verify(t.badsec(), 'lld_x')$$),
  ($$public.ingested_records_since(t.badsec(), 'tenant-a', 0, 10)$$),
  ($$public.workstream_task_propose(t.badsec(), 'tenant-a', 'finance', 'x', null, null, '{}', 'p')$$),
  ($$public.approvals_approved(t.badsec(), 'tenant-a', 10)$$),
  ($$public.approval_claim(t.badsec(), 'f1000000-0000-0000-0000-00000000000a')$$),
  ($$public.approval_record_proof(t.badsec(), 'f1000000-0000-0000-0000-00000000000a', 'p')$$)
) as x(call);
select t.raises('short secret rejected', $q$select public.connections_due('short')$q$, '%server only%');
select t.raises('NULL secret rejected', $q$select public.connections_due(null)$q$, '%server only%');
select t.raises('the old connections-server secret does not open the new RPCs', $q$select public.connections_due(t.oldsec())$q$, '%server only%');
select t.check('right secret passes (control)', (select count(*) from public.connections_due(t.sec())) >= 0);

-- the same RPCs through the anon role: callable (the secret is the gate), but a wrong secret still fails
set role anon;
select t.raises('anon role with a wrong secret is rejected', $q$select public.connections_due(t.badsec())$q$, '%server only%');
select t.check('anon role with the right secret works', (select count(*) from public.connections_due(t.sec())) >= 0);
reset role;
set role anon;
select t.raises('anon cannot select tenant rows directly', 'select count(*) from public.tenant_connections', '%permission denied%');
select t.raises('anon cannot call client RPCs', $q$select public.api_key_create('aaaaaaaa-0000-0000-0000-00000000000a', 'x', array['records:read'])$q$, '%permission denied%');
reset role;
