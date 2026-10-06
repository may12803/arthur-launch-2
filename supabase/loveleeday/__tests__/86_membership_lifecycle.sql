-- membership_set_role / membership_remove / tenant_transfer_ownership. Builds its own tenant C so the shared fixtures stay intact.
insert into auth.users (id, email, email_confirmed_at) values
  ('86000000-0000-0000-0000-000000000001', 'owner-c@example.test', now()),
  ('86000000-0000-0000-0000-000000000002', 'admin-c@example.test', now()),
  ('86000000-0000-0000-0000-000000000003', 'admin2-c@example.test', now()),
  ('86000000-0000-0000-0000-000000000004', 'member-c@example.test', now()),
  ('86000000-0000-0000-0000-000000000005', 'viewer-c@example.test', now()),
  ('86000000-0000-0000-0000-000000000006', 'pending-c@example.test', now());
insert into public.tenants (id, name, slug) values ('86cccccc-0000-0000-0000-00000000000c', 'Tenant C', 'tenant-86');
insert into public.memberships (id, tenant_id, user_id, role, accepted_at) values
  ('86100000-0000-0000-0000-000000000001', '86cccccc-0000-0000-0000-00000000000c', '86000000-0000-0000-0000-000000000001', 'owner', now()),
  ('86100000-0000-0000-0000-000000000002', '86cccccc-0000-0000-0000-00000000000c', '86000000-0000-0000-0000-000000000002', 'admin', now()),
  ('86100000-0000-0000-0000-000000000003', '86cccccc-0000-0000-0000-00000000000c', '86000000-0000-0000-0000-000000000003', 'admin', now()),
  ('86100000-0000-0000-0000-000000000004', '86cccccc-0000-0000-0000-00000000000c', '86000000-0000-0000-0000-000000000004', 'member', now()),
  ('86100000-0000-0000-0000-000000000005', '86cccccc-0000-0000-0000-00000000000c', '86000000-0000-0000-0000-000000000005', 'viewer', now()),
  ('86100000-0000-0000-0000-000000000006', '86cccccc-0000-0000-0000-00000000000c', '86000000-0000-0000-0000-000000000006', 'member', null);

-- set_role
select t.login('86000000-0000-0000-0000-000000000004', 'aal2');
select t.raises('a member cannot change roles', $q$select public.membership_set_role('86100000-0000-0000-0000-000000000005', 'member')$q$, '%not allowed%');
select t.logout();
select t.login('86000000-0000-0000-0000-000000000002', 'aal1');
select t.raises('an admin without two-factor cannot change roles', $q$select public.membership_set_role('86100000-0000-0000-0000-000000000005', 'member')$q$, '%two-factor%');
select t.logout();
select t.login('86000000-0000-0000-0000-000000000002', 'aal2');
select public.membership_set_role('86100000-0000-0000-0000-000000000005', 'member');
select t.check('an admin promotes a viewer to member', (select role from public.memberships where id = '86100000-0000-0000-0000-000000000005') = 'member');
select t.check('the role change is audited with before and after', exists (select 1 from public.audit_log where action = 'membership.role_changed' and target = 'membership:86100000-0000-0000-0000-000000000005' and meta->>'role_before' = 'viewer' and meta->>'role_after' = 'member'));
select t.raises('an admin cannot make an owner', $q$select public.membership_set_role('86100000-0000-0000-0000-000000000004', 'owner')$q$, '%admin, member, or viewer%');
select t.raises('an admin cannot change the owner', $q$select public.membership_set_role('86100000-0000-0000-0000-000000000001', 'viewer')$q$, '%transfer ownership%');
select t.raises('an admin cannot demote another admin', $q$select public.membership_set_role('86100000-0000-0000-0000-000000000003', 'viewer')$q$, '%only the owner%');
select t.raises('nobody changes their own role', $q$select public.membership_set_role('86100000-0000-0000-0000-000000000002', 'viewer')$q$, '%your own role%');
select t.logout();
select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('another tenant''s owner cannot change roles here', $q$select public.membership_set_role('86100000-0000-0000-0000-000000000004', 'viewer')$q$, '%not allowed%');
select t.logout();
select t.login('86000000-0000-0000-0000-000000000001', 'aal2');
select public.membership_set_role('86100000-0000-0000-0000-000000000003', 'member');
select t.check('the owner can demote an admin', (select role from public.memberships where id = '86100000-0000-0000-0000-000000000003') = 'member');
select t.logout();

-- remove / leave
select t.login('86000000-0000-0000-0000-000000000004', 'aal2');
select t.raises('a member cannot remove someone else', $q$select public.membership_remove('86100000-0000-0000-0000-000000000005')$q$, '%not allowed%');
select t.logout();
select t.login('86000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('the owner cannot be removed', $q$select public.membership_remove('86100000-0000-0000-0000-000000000001')$q$, '%transfer ownership first%');
select public.membership_remove('86100000-0000-0000-0000-000000000005');
select t.check('an admin removes a member', not exists (select 1 from public.memberships where id = '86100000-0000-0000-0000-000000000005'));
select t.check('the removal is audited', exists (select 1 from public.audit_log where action = 'membership.removed' and target = 'membership:86100000-0000-0000-0000-000000000005'));
select t.logout();
select t.login('86000000-0000-0000-0000-000000000004', 'aal2');
select public.membership_remove('86100000-0000-0000-0000-000000000004');
select t.check('a member can leave', not exists (select 1 from public.memberships where id = '86100000-0000-0000-0000-000000000004'));
select t.logout();
select t.check('leaving is audited as left', exists (select 1 from public.audit_log where action = 'membership.left' and target = 'membership:86100000-0000-0000-0000-000000000004'));

-- transfer ownership
select t.login('86000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('an admin cannot transfer ownership', $q$select public.tenant_transfer_ownership('86100000-0000-0000-0000-000000000003')$q$, '%not allowed%');
select t.logout();
select t.login('86000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('ownership cannot go to someone who has not accepted', $q$select public.tenant_transfer_ownership('86100000-0000-0000-0000-000000000006')$q$, '%accept their invitation%');
select public.tenant_transfer_ownership('86100000-0000-0000-0000-000000000002');
select t.check('the new owner is owner', (select role from public.memberships where id = '86100000-0000-0000-0000-000000000002') = 'owner');
select t.check('the old owner becomes admin', (select role from public.memberships where id = '86100000-0000-0000-0000-000000000001') = 'admin');
select t.check('exactly one owner remains', (select count(*) from public.memberships where tenant_id = '86cccccc-0000-0000-0000-00000000000c' and role = 'owner') = 1);
select t.check('the transfer is audited', exists (select 1 from public.audit_log where action = 'tenant.ownership_transferred'));
select t.logout();

-- one owner per company is a database rule, not just an RPC habit
select t.raises('a second owner row is refused by the database', $q$update public.memberships set role = 'owner' where id = '86100000-0000-0000-0000-000000000003'$q$, '%memberships_one_owner_per_tenant%');
select t.check('invites record email delivery', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'invites' and column_name in ('emailed_at', 'email_error')) = 2);

-- team list carries the membership id, and only for members
select t.login('86000000-0000-0000-0000-000000000003', 'aal2');
select t.check('list_tenant_team returns membership ids', (select count(*) from public.list_tenant_team('86cccccc-0000-0000-0000-00000000000c') where membership_id is not null) >= 3);
select t.logout();
select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('a non-member sees no team rows', (select count(*) from public.list_tenant_team('86cccccc-0000-0000-0000-00000000000c')) = 0);
select t.logout();
