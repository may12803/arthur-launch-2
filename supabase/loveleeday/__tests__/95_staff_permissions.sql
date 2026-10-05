-- Staff permission model (20261005_12): a staff user with a LIVE grant may do what an admin may on connections and documents,
-- except anything that moves data outside the company or changes who has access. Expired or closed grants can do nothing.
-- Own tenant and users, so the shared fixtures are untouched.
insert into auth.users (id, email, email_confirmed_at) values
  ('51000000-0000-0000-0000-000000000001', 'owner-s@example.test', now()),
  ('51000000-0000-0000-0000-000000000002', 'staff-s@example.test', now()),
  ('51000000-0000-0000-0000-000000000003', 'member-s@example.test', now());
insert into public.tenants (id, name, slug) values ('55555555-0000-0000-0000-000000000005', 'Tenant S', 'tenant-s');
insert into public.memberships (id, tenant_id, user_id, role, accepted_at) values
  ('51100000-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000001', 'owner', now()),
  ('51100000-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000003', 'member', now());
insert into private.staff (user_id) values ('51000000-0000-0000-0000-000000000002');
insert into public.staff_grants (id, tenant_id, staff_user_id, staff_email, reason, expires_at) values
  ('51200000-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000002', 'staff-s@example.test', 'staff permission test grant', now() + interval '1 hour');

-- documents and a share, created by the owner
select t.login('51000000-0000-0000-0000-000000000001', 'aal2');
create temp table _s as select
  public.document_upload('55555555-0000-0000-0000-000000000005', 'del-by-staff.txt', 'text/plain', encode('one', 'base64')) as d_del,
  public.document_upload('55555555-0000-0000-0000-000000000005', 'del-by-owner.txt', 'text/plain', encode('two', 'base64')) as d_keep,
  public.document_upload('55555555-0000-0000-0000-000000000005', 'for-share.txt', 'text/plain', encode('three', 'base64')) as d_share;
grant select on _s to public;
select public.tenant_set_external_sharing('55555555-0000-0000-0000-000000000005', true);
create temp table _tok as select public.share_create((select d_share from _s), 'outside@example.test', 5) as token;
select t.check('owner sets up documents and an external share', (select count(*) from public.document_shares where tenant_id = '55555555-0000-0000-0000-000000000005') = 1);
select t.logout();

-- staff with a live grant: ALLOWED
select t.login('51000000-0000-0000-0000-000000000002', 'aal2');
select t.check('staff (live grant) can request a connection', public.connection_request('55555555-0000-0000-0000-000000000005', 'legacy-key', 'request') = 'requested');
select t.check('staff (live grant) can set a connection key', public.connection_set_key('55555555-0000-0000-0000-000000000005', 'legacy-key', '{"api_key":"k"}'::jsonb) = 'key_received');
select t.check('staff (live grant) can disconnect', public.connection_disconnect('55555555-0000-0000-0000-000000000005', 'legacy-key') = 'disconnected');
select t.check('staff (live grant) can upload a document', public.document_upload('55555555-0000-0000-0000-000000000005', 'by-staff.txt', 'text/plain', encode('x', 'base64')) is not null);
select public.document_delete((select d_del from _s));
select t.check('staff (live grant) can delete a document', (select count(*) from public.documents where id = (select d_del from _s)) = 0);

-- staff with a live grant: REFUSED (moves data outside or changes who has access)
select t.raises('staff cannot create an external share', format($q$select public.share_create(%L, 'x@example.test', 3)$q$, (select d_share from _s)), '%not allowed to share%');
select t.raises('staff cannot revoke an external share', format($q$select public.share_revoke(%L)$q$, (select id from public.document_shares where tenant_id = '55555555-0000-0000-0000-000000000005' limit 1)), '%not allowed to revoke%');
select t.raises('staff cannot flip the sharing toggle', $q$select public.tenant_set_external_sharing('55555555-0000-0000-0000-000000000005', false)$q$, '%only an owner or admin%');
select t.raises('staff cannot invite', $q$insert into public.invites (tenant_id, email, role) values ('55555555-0000-0000-0000-000000000005', 'new@example.test', 'member')$q$);
select t.raises('staff cannot change a membership scope', $q$select public.membership_scope_set('51100000-0000-0000-0000-000000000003', '{}')$q$, '%not allowed%');
select t.raises('staff cannot create an API key', $q$select * from public.api_key_create('55555555-0000-0000-0000-000000000005', 'k', '{read}')$q$, '%not allowed%');
select t.raises('staff cannot add a webhook', $q$select public.webhook_upsert('55555555-0000-0000-0000-000000000005', null, 'https://s.example.test/h', '{sync.failed}', true)$q$, '%not allowed%');
select t.raises('staff cannot change security settings', $q$select public.tenant_security_set('55555555-0000-0000-0000-000000000005', false, '{}', false, 12, 365)$q$, '%not allowed%');
select t.logout();

-- a member (not staff) is unchanged: refused delete
select t.login('51000000-0000-0000-0000-000000000003', 'aal2');
select t.raises('a member still cannot delete a document', format($q$select public.document_delete(%L)$q$, (select d_keep from _s)), '%only an owner or admin%');
select t.logout();

-- an owner can still delete, share, revoke
select t.login('51000000-0000-0000-0000-000000000001', 'aal2');
select public.document_delete((select d_keep from _s));
select t.check('an owner can still delete a document', (select count(*) from public.documents where id = (select d_keep from _s)) = 0);
select t.check('an owner can still create an external share', public.share_create((select d_share from _s), 'again@example.test', 3) is not null);
select public.share_revoke((select id from public.document_shares where recipient_email = 'again@example.test'));
select t.check('an owner can still revoke a share', (select revoked_at is not null from public.document_shares where recipient_email = 'again@example.test'));
select t.logout();

-- an expired grant can do nothing
update public.staff_grants set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours' where id = '51200000-0000-0000-0000-000000000001';
select t.login('51000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('expired grant: cannot set a key', $q$select public.connection_set_key('55555555-0000-0000-0000-000000000005', 'legacy-key', '{"api_key":"k"}'::jsonb)$q$, '%only an owner or admin%');
select t.raises('expired grant: cannot disconnect', $q$select public.connection_disconnect('55555555-0000-0000-0000-000000000005', 'legacy-key')$q$, '%only an owner or admin%');
select t.raises('expired grant: cannot request', $q$select public.connection_request('55555555-0000-0000-0000-000000000005', 'legacy-key', 'request')$q$, '%only an owner or admin%');
select t.raises('expired grant: cannot upload', $q$select public.document_upload('55555555-0000-0000-0000-000000000005', 'z.txt', 'text/plain', encode('x', 'base64'))$q$, '%not allowed%');
select t.raises('expired grant: cannot delete', format($q$select public.document_delete(%L)$q$, (select d_share from _s)), '%only an owner or admin%');
select t.raises('expired grant: cannot download', format($q$select * from public.document_download(%L)$q$, (select d_share from _s)), '%not found%');
select t.raises('expired grant: cannot share', format($q$select public.share_create(%L, 'x@example.test', 3)$q$, (select d_share from _s)), '%not allowed%');
select t.check('expired grant: sees no documents', (select count(*) from public.documents where tenant_id = '55555555-0000-0000-0000-000000000005') = 0);
select t.logout();

-- a closed (revoked) grant can do nothing either
update public.staff_grants set expires_at = now() + interval '1 hour', created_at = now(), revoked_at = now() where id = '51200000-0000-0000-0000-000000000001';
select t.login('51000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('closed grant: cannot set a key', $q$select public.connection_set_key('55555555-0000-0000-0000-000000000005', 'legacy-key', '{"api_key":"k"}'::jsonb)$q$, '%only an owner or admin%');
select t.raises('closed grant: cannot delete', format($q$select public.document_delete(%L)$q$, (select d_share from _s)), '%only an owner or admin%');
select t.raises('closed grant: cannot upload', $q$select public.document_upload('55555555-0000-0000-0000-000000000005', 'z.txt', 'text/plain', encode('x', 'base64'))$q$, '%not allowed%');
select t.check('closed grant: sees no documents', (select count(*) from public.documents where tenant_id = '55555555-0000-0000-0000-000000000005') = 0);
select t.logout();
