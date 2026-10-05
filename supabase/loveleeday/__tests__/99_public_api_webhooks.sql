-- 20261005_14: atomic token rotation, public API reads bound to the key's tenant, webhook events queued with the change, leased delivery.
-- Tenants from 00_fixtures: A = aaaaaaaa-...0a, B = bbbbbbbb-...0b.

-- atomic rotation: the write lands only when the stored rotated_at equals the expected one
insert into public.tenant_connections (id, tenant_id, connector_key, definition_key, auth_method, status)
  values ('c1000000-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'mailchimp', 'mailchimp', 'oauth2_authcode', 'connected');
select t.check('rotate: first write with expected null succeeds',
  public.connection_rotate_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000f1', '{"access_token":"A1","refresh_token":"R1"}', '2030-01-01T00:00:00Z', null));
select t.check('rotate: a second writer that also expected null loses',
  public.connection_rotate_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000f1', '{"access_token":"A1b","refresh_token":"R1b"}', '2030-01-01T00:00:05Z', null) = false);
select t.check('rotate: the right expected value wins',
  public.connection_rotate_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000f1', '{"access_token":"A2","refresh_token":"R2"}', '2030-01-02T00:00:00Z', '2030-01-01T00:00:00Z'));
select t.check('rotate: a writer that started from the old set loses even with a newer timestamp',
  public.connection_rotate_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000f1', '{"access_token":"A3","refresh_token":"R3"}', '2030-01-09T00:00:00Z', '2030-01-01T00:00:00Z') = false);
select t.check('rotate: R2 is the stored refresh token', (public.connection_secret(t.sec(), 'c1000000-0000-0000-0000-0000000000f1')::jsonb ->> 'refresh_token') = 'R2');
select t.raises('rotate: wrong secret refused', $q$select public.connection_rotate_tokens(t.badsec(), 'c1000000-0000-0000-0000-0000000000f1', '{"access_token":"x"}', now(), null)$q$, '%server only%');

-- public API reads: every row returned belongs to the tenant passed by the server
insert into public.tenant_connections (id, tenant_id, connector_key, definition_key, status)
  values ('c1000000-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-00000000000b', 'box', 'box', 'connected');
select t.check('api connections: tenant A sees its own rows and none of B''s',
  (select count(*) from public.public_api_connections(t.sec(), 'aaaaaaaa-0000-0000-0000-00000000000a', 0, 100) x where x.id = 'c1000000-0000-0000-0000-0000000000f2') = 0
  and (select count(*) from public.public_api_connections(t.sec(), 'aaaaaaaa-0000-0000-0000-00000000000a', 0, 100) x where x.id = 'c1000000-0000-0000-0000-0000000000f1') = 1);
select t.check('api connections: keyset cursor skips what was already returned',
  (select count(*) from public.public_api_connections(t.sec(), 'aaaaaaaa-0000-0000-0000-00000000000a',
     (select seq from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000f1'), 100) x where x.id = 'c1000000-0000-0000-0000-0000000000f1') = 0);
select t.check('api records: tenant B gets nothing of tenant A',
  (select count(*) from public.public_api_records(t.sec(), 'bbbbbbbb-0000-0000-0000-00000000000b', 0, 100, null, null) r
     join public.ingested_records i on i.id = r.id where i.tenant_id <> 'bbbbbbbb-0000-0000-0000-00000000000b') = 0);
select t.check('api limit is capped at 101', (select count(*) from public.public_api_connections(t.sec(), 'aaaaaaaa-0000-0000-0000-00000000000a', 0, 100000)) <= 101);
select t.raises('api reads refuse a wrong secret', $q$select * from public.public_api_approvals(t.badsec(), 'aaaaaaaa-0000-0000-0000-00000000000a', 0, 10, null)$q$, '%server only%');

-- webhook events are queued with the change, only for subscribed active endpoints of the same tenant
insert into public.webhook_endpoints (id, tenant_id, url, events, secret_ct, active) values
  ('e9000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'https://hooks.example.com/a', array['approval.proposed', 'approval.decided', 'sync.failed', 'sync.succeeded', 'record.ingested', 'connection.health_changed'],
     extensions.pgp_sym_encrypt('whsec_test_a', private.tenant_key('aaaaaaaa-0000-0000-0000-00000000000a', true)), true),
  ('e9000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'https://hooks.example.com/off', array['approval.proposed'],
     extensions.pgp_sym_encrypt('whsec_test_off', private.tenant_key('aaaaaaaa-0000-0000-0000-00000000000a', true)), false),
  ('e9000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'https://hooks.example.com/b', array['approval.proposed'],
     extensions.pgp_sym_encrypt('whsec_test_b', private.tenant_key('bbbbbbbb-0000-0000-0000-00000000000b', true)), true);
insert into public.approvals (id, tenant_id, gate, title) values ('f9000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'money', 'Pay the March invoice');
select t.check('webhook: approval.proposed queued once, for the active A endpoint only',
  (select count(*) from public.webhook_deliveries where event = 'approval.proposed' and payload -> 'data' ->> 'approval_id' = 'f9000000-0000-0000-0000-0000000000a1') = 1
  and (select endpoint_id from public.webhook_deliveries where event = 'approval.proposed' and payload -> 'data' ->> 'approval_id' = 'f9000000-0000-0000-0000-0000000000a1') = 'e9000000-0000-0000-0000-0000000000a1');
select t.check('webhook: tenant B''s endpoint received nothing about tenant A', (select count(*) from public.webhook_deliveries where endpoint_id = 'e9000000-0000-0000-0000-0000000000b1') = 0);
update public.approvals set status = 'approved', decided_at = now() where id = 'f9000000-0000-0000-0000-0000000000a1';
select t.check('webhook: approval.decided queued when the status leaves pending', (select count(*) from public.webhook_deliveries where event = 'approval.decided') = 1);
update public.approvals set reason = 'edited note' where id = 'f9000000-0000-0000-0000-0000000000a1';
select t.check('webhook: an update that does not change status queues nothing', (select count(*) from public.webhook_deliveries where event like 'approval.%') = 2);
create temp table _wr as select public.sync_run_start(t.sec(), 'c1000000-0000-0000-0000-0000000000f1', 'contacts') as run;
select public.ingest_records(t.sec(), (select run from _wr), '[{"source_ref":"w1","payload":{"a":1}}]');
select public.sync_run_finish(t.sec(), (select run from _wr), 'succeeded');
select t.check('webhook: a finished sync queues sync.succeeded and record.ingested',
  (select count(*) from public.webhook_deliveries where event = 'sync.succeeded' and payload -> 'data' ->> 'run_id' = (select run::text from _wr)) = 1
  and (select (payload -> 'data' ->> 'new_records')::int from public.webhook_deliveries where event = 'record.ingested' and payload -> 'data' ->> 'run_id' = (select run::text from _wr)) = 1);
select t.check('webhook: payload carries id, type, tenant and created_at',
  (select bool_and(payload ? 'id' and payload ? 'type' and payload ? 'tenant' and payload ? 'created_at' and payload ->> 'tenant' = 'aaaaaaaa-0000-0000-0000-00000000000a') from public.webhook_deliveries where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));

-- delivery: due rows are leased (a second call within the lease gets none), recorded once, retried with backoff
create temp table _due as select * from public.webhook_deliveries_due(t.sec(), 20);
select t.check('due: returns the queued rows with the decrypted signing secret', (select count(*) from _due) >= 4 and (select bool_and(secret = 'whsec_test_a') from _due));
select t.check('due: a second call inside the lease returns nothing', (select count(*) from public.webhook_deliveries_due(t.sec(), 20)) = 0);
select public.webhook_delivery_record(t.sec(), (select id from _due order by id limit 1), 'retry', 503, 1, now() + interval '1 minute');
select t.check('record: retry advances the attempt and schedules next_at',
  (select attempt from public.webhook_deliveries where id = (select id from _due order by id limit 1)) = 2
  and (select status from public.webhook_deliveries where id = (select id from _due order by id limit 1)) = 'retry');
select t.raises('record: a stale attempt number is refused', format($q$select public.webhook_delivery_record(t.sec(), %L, 'delivered', 200, 1, null)$q$, (select id from _due order by id limit 1)), '%already handled%');
select public.webhook_delivery_record(t.sec(), (select id from _due order by id offset 1 limit 1), 'delivered', 200, 1, null);
select t.raises('record: a delivered row cannot be recorded again', format($q$select public.webhook_delivery_record(t.sec(), %L, 'failed', 500, 1, null)$q$, (select id from _due order by id offset 1 limit 1)), '%already handled%');
select t.check('due: an endpoint that cannot be decrypted fails only its own deliveries',
  (select count(*) from public.webhook_deliveries where endpoint_id = '99000000-0000-0000-0000-00000000000a' and status in ('pending', 'retry')) = 0);
select t.raises('due: wrong secret refused', $q$select * from public.webhook_deliveries_due(t.badsec(), 5)$q$, '%server only%');
select t.raises('record: invalid status refused', format($q$select public.webhook_delivery_record(t.sec(), %L, 'maybe', 200, 2, null)$q$, (select id from _due order by id limit 1)), '%invalid delivery status%');

-- clients still cannot touch the queue directly
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('a client cannot insert a delivery', $q$insert into public.webhook_deliveries (endpoint_id, tenant_id, event, status) values ('e9000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'x', 'pending')$q$, '%permission denied%');
select t.logout();
