-- OAuth state: single use, 10 minute TTL, bound to tenant + user.
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('owner can begin an OAuth flow', public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'state-one-0123456789012345678901234567', 'verifier-one', 'https://portal.loveleedaystudios.com/api/connectors/oauth/callback') > now());
select t.logout();
select t.check('state is stored under its sha256 hash', (select count(*) from private.oauth_states where state_hash = encode(extensions.digest('state-one-0123456789012345678901234567', 'sha256'), 'hex')) = 1);
select t.check('state table holds no plaintext state or verifier', (select count(*) from private.oauth_states where state_hash like 'state-one%' or position('verifier-one' in encode(code_verifier_ct, 'escape')) > 0) = 0);

select t.check('consume returns the verifier and connection for the right tenant + user',
  (select code_verifier from public.oauth_state_consume(t.sec(), 'state-one-0123456789012345678901234567', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001')) = 'verifier-one');
select t.raises('second consume of the same state raises', $q$select * from public.oauth_state_consume(t.sec(), 'state-one-0123456789012345678901234567', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001')$q$, '%invalid or expired%');

-- expired
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'state-two-0123456789012345678901234567', 'verifier-two', 'https://portal.loveleedaystudios.com/api/connectors/oauth/callback');
select public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'state-three-01234567890123456789012345', 'verifier-three', 'https://portal.loveleedaystudios.com/api/connectors/oauth/callback');
select t.logout();
update private.oauth_states set expires_at = now() - interval '1 second' where state_hash = encode(extensions.digest('state-two-0123456789012345678901234567', 'sha256'), 'hex');
select t.raises('an expired state raises', $q$select * from public.oauth_state_consume(t.sec(), 'state-two-0123456789012345678901234567', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001')$q$, '%invalid or expired%');

-- cross tenant / cross user
select t.raises('tenant A state cannot be consumed for tenant B', $q$select * from public.oauth_state_consume(t.sec(), 'state-three-01234567890123456789012345', 'bbbbbbbb-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001')$q$, '%invalid or expired%');
select t.raises('tenant A state cannot be consumed by tenant B user', $q$select * from public.oauth_state_consume(t.sec(), 'state-three-01234567890123456789012345', 'bbbbbbbb-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001')$q$, '%invalid or expired%');
select t.raises('a state cannot be consumed by a different user of the same tenant', $q$select * from public.oauth_state_consume(t.sec(), 'state-three-01234567890123456789012345', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002')$q$, '%invalid or expired%');
select t.check('a refused cross-tenant attempt does not burn the state; the real owner still consumes it',
  (select code_verifier from public.oauth_state_consume(t.sec(), 'state-three-01234567890123456789012345', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001')) = 'verifier-three');
select t.raises('an unknown state raises', $q$select * from public.oauth_state_consume(t.sec(), 'never-issued-0123456789012345678901234', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001')$q$, '%invalid or expired%');

-- who may begin
select t.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('a plain member cannot begin an OAuth flow', $q$select public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'state-four-0123456789012345678901234567', 'v', 'https://x.example.test/cb')$q$, '%not allowed%');
select t.logout();
select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('tenant B owner cannot begin a flow in tenant A', $q$select public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'state-five-0123456789012345678901234567', 'v', 'https://x.example.test/cb')$q$, '%not allowed%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000001', 'aal1');
select t.raises('aal1 cannot begin an OAuth flow', $q$select public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'state-six-01234567890123456789012345678', 'v', 'https://x.example.test/cb')$q$, '%two-factor%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('a platform that is not one-click is refused', $q$select public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'toast', 'state-seven-0123456789012345678901234567', 'v', 'https://x.example.test/cb')$q$, '%one-click%');
select t.raises('a plain-http redirect is refused', $q$select public.connector_oauth_begin('aaaaaaaa-0000-0000-0000-00000000000a', 'stripe', 'state-eight-0123456789012345678901234567', 'v', 'http://x.example.test/cb')$q$, '%https%');
select t.logout();
