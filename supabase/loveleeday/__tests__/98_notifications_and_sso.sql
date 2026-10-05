update public.tenant_security set sso_enforced = true, sso_domains = array['example.test', 'company.example']
where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';

select t.check('enforced domain requires SSO', public.sso_required_for_email('person@company.example'));
select t.check('email domain check ignores case', public.sso_required_for_email('PERSON@EXAMPLE.TEST'));
select t.check('unenforced and unknown domains do not require SSO', not public.sso_required_for_email('person@other.example'));
select t.check('invalid email does not reveal a domain', not public.sso_required_for_email('person@@company.example'));
select t.check('email function exposes only a boolean', (select prorettype = 'boolean'::regtype from pg_proc where oid = 'public.sso_required_for_email(text)'::regprocedure));

insert into auth.users (id, email, email_confirmed_at) values ('98000000-0000-0000-0000-000000000001', 'staff-p3@example.test', now());
insert into private.staff (user_id) values ('98000000-0000-0000-0000-000000000001');
insert into public.staff_grants (id, tenant_id, staff_user_id, staff_email, reason, expires_at)
values ('98000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'staff-p3@example.test', 'SSO exemption test', now() + interval '1 hour');
select t.login('98000000-0000-0000-0000-000000000001', 'aal2');
select t.check('staff with live grant can use a password session', public.sso_session_allowed('aaaaaaaa-0000-0000-0000-00000000000a'));
select t.logout();

select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('enforced tenant refuses password session', not public.sso_session_allowed('aaaaaaaa-0000-0000-0000-00000000000a'));
select t.check('own tenant requires SSO', public.sso_required_for_tenant('aaaaaaaa-0000-0000-0000-00000000000a'));
select t.check('other tenant SSO policy is hidden', not public.sso_required_for_tenant('bbbbbbbb-0000-0000-0000-00000000000b'));
select t.check('other tenant session is refused', not public.sso_session_allowed('bbbbbbbb-0000-0000-0000-00000000000b'));
select set_config('request.jwt.claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'sso/saml')))::text, false);
select t.check('enforced tenant accepts SSO session', public.sso_session_allowed('aaaaaaaa-0000-0000-0000-00000000000a'));
select t.logout();

select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('non-enforced tenant accepts password session', public.sso_session_allowed('bbbbbbbb-0000-0000-0000-00000000000b'));
select t.check('another tenant cannot set notification preferences', (select count(*) from public.notification_prefs where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.raises('other tenant notification write refused', $q$select public.notification_prefs_set('aaaaaaaa-0000-0000-0000-00000000000a', 'daily', true, true)$q$, '%not allowed%');
select t.logout();

select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select public.notification_prefs_set('aaaaaaaa-0000-0000-0000-00000000000a', 'daily', true, false);
select t.check('member reads own notification row', (select count(*) from public.notification_prefs where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and approvals_digest = 'daily') = 1);
select t.check('member cannot read another tenant notification row', (select count(*) from public.notification_prefs where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0);
select t.check('setting preferences writes an audit entry', (select count(*) from public.audit_log where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and action = 'notification_prefs.updated') = 1);
select t.raises('invalid digest refused', $q$select public.notification_prefs_set('aaaaaaaa-0000-0000-0000-00000000000a', 'hourly', true, false)$q$, '%valid notification%');
select t.logout();

select t.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select t.check('another member cannot read owner preferences', (select count(*) from public.notification_prefs where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select public.notification_prefs_set('aaaaaaaa-0000-0000-0000-00000000000a', 'instant', false, true);
select t.check('another member writes only own row', (select count(*) from public.notification_prefs where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 1);
select t.logout();

select t.login('a0000000-0000-0000-0000-000000000001', 'aal1');
select t.check('weak session cannot read preferences', (select count(*) from public.notification_prefs where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.raises('weak session cannot write preferences', $q$select public.notification_prefs_set('aaaaaaaa-0000-0000-0000-00000000000a', 'off', false, false)$q$, '%two-factor%');
select t.logout();
