update public.tenant_security set sso_enforced = true, sso_domains = array['example.test', 'company.example']
where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';

-- R3-03: there is no anonymous lookup any more; nobody can ask which domains enforce SSO.
select t.check('no anonymous SSO-by-email lookup exists', to_regprocedure('public.sso_required_for_email(text)') is null);
select t.check('sso_required_for_me is not callable by anon', not has_function_privilege('anon', 'public.sso_required_for_me()', 'execute'));

insert into auth.users (id, email, email_confirmed_at) values ('98000000-0000-0000-0000-000000000001', 'staff-p3@example.test', now());
insert into private.staff (user_id) values ('98000000-0000-0000-0000-000000000001');
insert into public.staff_grants (id, tenant_id, staff_user_id, staff_email, reason, expires_at)
values ('98000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'staff-p3@example.test', 'SSO exemption test', now() + interval '1 hour');
select t.login('98000000-0000-0000-0000-000000000001', 'aal2');
select t.check('staff with live grant can use a password session', public.sso_session_allowed('aaaaaaaa-0000-0000-0000-00000000000a'));
select t.check('staff with live grant still reads the enforced tenant', (select count(*) from public.tenants where id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 1);
select t.logout();

-- R3-02: a password + TOTP session of a member of an enforced tenant reads and writes nothing there, straight through the API.
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('enforced tenant refuses password session', not public.sso_session_allowed('aaaaaaaa-0000-0000-0000-00000000000a'));
select t.check('sso_required_for_me tells the account holder', public.sso_required_for_me());
select t.check('password session reads 0 tenant rows of the enforced tenant', (select count(*) from public.tenants where id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.check('password session reads 0 connections of the enforced tenant', (select count(*) from public.tenant_connections where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.check('password session reads 0 audit rows of the enforced tenant', (select count(*) from public.audit_log where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.raises('password session cannot call a write RPC on the enforced tenant', $q$select public.notification_prefs_set('aaaaaaaa-0000-0000-0000-00000000000a', 'daily', true, false)$q$, '%not allowed%');
select t.check('other tenant session is refused', not public.sso_session_allowed('bbbbbbbb-0000-0000-0000-00000000000b'));
select set_config('request.jwt.claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'sso/saml')))::text, false);
select t.check('enforced tenant accepts SSO session', public.sso_session_allowed('aaaaaaaa-0000-0000-0000-00000000000a'));
select t.check('SSO session reads the enforced tenant', (select count(*) from public.tenants where id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 1);
select t.check('sso_required_for_me is false inside an SSO session', not public.sso_required_for_me());
select t.logout();

-- lockout guard: an owner inside an SSO session may enforce SSO (tenant B is not enforced yet)
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000001', 'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'sso/saml')))::text, false);
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
select public.tenant_security_set('bbbbbbbb-0000-0000-0000-00000000000b', true, array['b.example'], false, 12, 365);
select t.check('an owner signed in through SSO can enforce it',
  (select sso_enforced from public.tenant_security where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b'));
update public.tenant_security set sso_enforced = false where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select t.logout();

select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('non-enforced tenant accepts password session', public.sso_session_allowed('bbbbbbbb-0000-0000-0000-00000000000b'));
select t.check('non-enforced tenant member is unaffected', (select count(*) from public.tenants where id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 1 and not public.sso_required_for_me());
select t.check('another tenant cannot set notification preferences', (select count(*) from public.notification_prefs where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0);
select t.raises('other tenant notification write refused', $q$select public.notification_prefs_set('aaaaaaaa-0000-0000-0000-00000000000a', 'daily', true, true)$q$, '%not allowed%');
select t.logout();

-- the rest runs with enforcement off again, so later test files see tenant A as before
update public.tenant_security set sso_enforced = false where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';

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
