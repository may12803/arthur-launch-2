-- Health is computed from sync data. Each case has a healthy control so the function cannot pass by always returning one value.
insert into public.tenant_connections (id, tenant_id, connector_key, definition_key, auth_method, status) values
  ('c1000000-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'toast', 'toast', 'oauth2_client_credentials', 'connected'),
  ('c1000000-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'xero', 'xero', 'oauth2_authcode', 'connected'),
  ('c1000000-0000-0000-0000-0000000000b3', 'aaaaaaaa-0000-0000-0000-00000000000a', 'shopify', 'shopify', 'oauth2_authcode', 'live'),
  ('c1000000-0000-0000-0000-0000000000b4', 'aaaaaaaa-0000-0000-0000-00000000000a', 'hubspot', 'hubspot', 'oauth2_authcode', 'connected'),
  ('c1000000-0000-0000-0000-0000000000b5', 'aaaaaaaa-0000-0000-0000-00000000000a', 'gusto', 'gusto', 'oauth2_authcode', 'live'),
  ('c1000000-0000-0000-0000-0000000000b6', 'aaaaaaaa-0000-0000-0000-00000000000a', 'brevo', 'brevo', 'api_key', 'connected');

-- b1: never run
select t.check('never run -> not_running', (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b1')) = 'not_running');

-- b2: healthy control (success 1h ago, rows moved)
insert into public.sync_runs (tenant_id, connection_id, object, status, started_at, finished_at, rows_read, rows_written) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000b2', 'invoices', 'succeeded', now() - interval '65 minutes', now() - interval '60 minutes', 40, 12);
select t.check('recent success that moved rows -> healthy (control)', (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b2')) = 'healthy');

-- b3: stale by age (success 30h ago, stale_after defaults to 26h)
insert into public.sync_runs (tenant_id, connection_id, object, status, started_at, finished_at, rows_read, rows_written) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000b3', 'orders', 'succeeded', now() - interval '30 hours 5 minutes', now() - interval '30 hours', 50, 50);
select t.check('last success older than stale_after -> stale', (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b3')) = 'stale');
select t.check('stale reason names the age', (select reason from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b3')) ilike '%older than%');
select t.check('the same run is healthy when evaluated 2h after it finished (age is real, not a constant)',
  (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b3', now() - interval '28 hours')) = 'healthy');
update public.tenant_connections set stale_after = interval '48 hours' where id = 'c1000000-0000-0000-0000-0000000000b3';
select t.check('widening stale_after to 48h turns the same data healthy', (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b3')) = 'healthy');
update public.tenant_connections set stale_after = interval '26 hours' where id = 'c1000000-0000-0000-0000-0000000000b3';

-- b4: latest successful run moved 0 rows (an earlier one moved rows)
insert into public.sync_runs (tenant_id, connection_id, object, status, started_at, finished_at, rows_read, rows_written) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000b4', 'contacts', 'succeeded', now() - interval '3 hours', now() - interval '3 hours', 200, 200),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000b4', 'contacts', 'succeeded', now() - interval '20 minutes', now() - interval '15 minutes', 0, 0);
select t.check('latest successful run moved 0 rows -> stale', (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b4')) = 'stale');
select t.check('zero-row reason says so', (select reason from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b4')) ilike '%0 rows%');

-- b5: failed run after an older success
insert into public.sync_runs (tenant_id, connection_id, object, status, started_at, finished_at, rows_read, rows_written, error) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000b5', 'payslips', 'succeeded', now() - interval '5 hours', now() - interval '5 hours', 10, 10, null),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000b5', 'payslips', 'failed', now() - interval '10 minutes', now() - interval '9 minutes', 0, 0, '401 token revoked');
select t.check('last run failed -> failing', (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b5')) = 'failing');
select t.check('failing reason carries the error', (select reason from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b5')) ilike '%401 token revoked%');

-- b6: only a partial run
insert into public.sync_runs (tenant_id, connection_id, object, status, started_at, finished_at, rows_read, rows_written) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000b6', 'campaigns', 'partial', now() - interval '10 minutes', now() - interval '9 minutes', 5, 5);
select t.check('only a partial run so far -> stale (never claimed healthy)', (select status from private.compute_connection_health('c1000000-0000-0000-0000-0000000000b6')) = 'stale');

-- recording: writes connection_health + the connection row, and moves status honestly in both directions
select t.check('record returns healthy', public.connection_health_record(t.sec(), 'c1000000-0000-0000-0000-0000000000b2') = 'healthy');
select t.check('record: healthy connected -> status live', (select status from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000b2') = 'live'
  and (select health from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000b2') = 'healthy'
  and (select status from public.connection_health where connection_id = 'c1000000-0000-0000-0000-0000000000b2') = 'healthy');
select t.check('record returns stale', public.connection_health_record(t.sec(), 'c1000000-0000-0000-0000-0000000000b3') = 'stale');
select t.check('record: stale live connection is downgraded to connected', (select status from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000b3') = 'connected'
  and (select health from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000b3') = 'stale');
select t.check('record returns failing', public.connection_health_record(t.sec(), 'c1000000-0000-0000-0000-0000000000b5') = 'failing');
select t.check('record: failing live connection moves to error and keeps the reason', (select status from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000b5') = 'error'
  and (select error from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000b5') ilike '%401%');
select t.check('record returns not_running', public.connection_health_record(t.sec(), 'c1000000-0000-0000-0000-0000000000b1') = 'not_running');
select t.check('record: never-run connection is not promoted to live', (select status from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000b1') = 'connected');
select t.raises('health of an unknown connection raises', $q$select * from private.compute_connection_health('00000000-0000-0000-0000-000000000000')$q$, '%unknown connection%');
