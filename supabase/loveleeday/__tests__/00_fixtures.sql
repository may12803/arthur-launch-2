-- Fixtures: two tenants with one owner each (A also has admin, member, viewer), one row of every tenant table per tenant.
-- Runs as the superuser (bypasses RLS). Tests read these; destructive tests build their own tenants.
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@example.test', now()),
  ('a0000000-0000-0000-0000-000000000002', 'member-a@example.test', now()),
  ('a0000000-0000-0000-0000-000000000003', 'viewer-a@example.test', now()),
  ('a0000000-0000-0000-0000-000000000004', 'admin-a@example.test', now()),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@example.test', now());
insert into public.tenants (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Tenant B', 'tenant-b');
insert into public.memberships (id, tenant_id, user_id, role, accepted_at) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'owner', now()),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002', 'member', now()),
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('a1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000004', 'admin', now()),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'owner', now());

insert into private.server_secrets (name, sha256) values
  ('connectors-server', encode(extensions.digest(t.sec(), 'sha256'), 'hex')),
  ('connections-server', encode(extensions.digest(t.oldsec(), 'sha256'), 'hex'));

-- legacy catalog row so the pre-existing connection_set_key path can be exercised
insert into public.connectors (key, name, category, method, uses, never, read_scope) values ('legacy-key', 'Legacy key platform', 'accounting', 'key', 'reads invoices', 'writes', 'read');

insert into public.tenant_connections (id, tenant_id, connector_key, definition_key, auth_method, status) values
  ('c1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'stripe', 'oauth2_authcode', 'connected'),
  ('c2000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'stripe', 'stripe', 'oauth2_authcode', 'connected');

insert into public.sync_runs (id, tenant_id, connection_id, object, status, finished_at, rows_read, rows_written) values
  ('d1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a', 'charges', 'succeeded', now(), 3, 3),
  ('d2000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000b', 'charges', 'succeeded', now(), 3, 3);
insert into public.sync_cursors (connection_id, object, cursor) values
  ('c1000000-0000-0000-0000-00000000000a', 'charges', 'a-cursor'), ('c2000000-0000-0000-0000-00000000000b', 'charges', 'b-cursor');
insert into public.ingested_records (tenant_id, connection_id, source_system, object, source_ref, payload, payload_sha256, ingested_run) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a', 'stripe', 'charges', 'ch_a1', '{"amount": 1}', 'h-a1', 'd1000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000b', 'stripe', 'charges', 'ch_b1', '{"amount": 2}', 'h-b1', 'd2000000-0000-0000-0000-00000000000b');
insert into public.connection_health (connection_id, tenant_id, status) values
  ('c1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'healthy'),
  ('c2000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'healthy');
insert into public.entities (id, tenant_id, kind, name, code) values
  ('e1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'org', 'Org A', 'ORG-A'),
  ('e2000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'org', 'Org B', 'ORG-B');
insert into public.membership_scopes (membership_id, entity_id) values ('b1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-00000000000b');
insert into public.approvals (id, tenant_id, gate, title, status, decided_at) values
  ('f1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'send', 'A pending approval', 'pending', null),
  ('f2000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'send', 'B pending approval', 'pending', null);
insert into public.api_keys (tenant_id, name, prefix, key_hash) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'key a', 'lld_aaaa', 'hash-a'), ('bbbbbbbb-0000-0000-0000-00000000000b', 'key b', 'lld_bbbb', 'hash-b');
insert into public.webhook_endpoints (id, tenant_id, url, events, secret_ct) values
  ('99000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'https://a.example.test/hook', '{sync.failed}', '\x00'),
  ('99000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'https://b.example.test/hook', '{sync.failed}', '\x00');
insert into public.webhook_deliveries (endpoint_id, tenant_id, event, status) values
  ('99000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'sync.failed', 'ok'),
  ('99000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'sync.failed', 'ok');
insert into public.tenant_security (tenant_id) values ('aaaaaaaa-0000-0000-0000-00000000000a'), ('bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.upload_mappings (tenant_id, target_object) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'invoices'), ('bbbbbbbb-0000-0000-0000-00000000000b', 'invoices');
insert into public.workstreams (id, tenant_id, key, name) values
  ('77000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'finance', 'Finance A'),
  ('77000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'finance', 'Finance B');
insert into public.audit_log (tenant_id, actor, action, target) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'fixture.a', 'a'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'fixture.a', 'a2'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'fixture.a', 'a3'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'fixture.b', 'b');
