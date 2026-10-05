-- api_key_create returns plaintext once; the table holds only a sha256 hash.
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
create temp table _k as select * from public.api_key_create('aaaaaaaa-0000-0000-0000-00000000000a', 'ci key', array['records:read']);
select t.check('plaintext key is returned on create', (select api_key from _k) like 'lld_%' and length((select api_key from _k)) >= 40);
select t.check('prefix is the first characters of the key', (select api_key from _k) like (select prefix from _k) || '%');
select t.logout();
select t.check('stored hash is sha256 of the plaintext', (select key_hash from public.api_keys where id = (select id from _k)) = encode(extensions.digest((select api_key from _k), 'sha256'), 'hex'));
select t.check('no column of the stored row contains the plaintext', (select position((select api_key from _k) in to_jsonb(k)::text) from public.api_keys k where k.id = (select id from _k)) = 0);
select t.check('the audit entry does not contain the plaintext', (select count(*) from public.audit_log where action = 'api_key.created' and position((select api_key from _k) in meta::text) > 0) = 0);
select t.check('api_key_verify finds the key by hash and returns the tenant', (select tenant_id from public.api_key_verify(t.sec(), (select api_key from _k))) = 'aaaaaaaa-0000-0000-0000-00000000000a');
select t.check('verify stamped last_used_at', (select last_used_at from public.api_keys where id = (select id from _k)) is not null);
select t.check('verify returns nothing for an unknown key', (select count(*) from public.api_key_verify(t.sec(), 'lld_not-a-real-key')) = 0);

select t.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select t.raises('a plain member cannot create a key', $q$select * from public.api_key_create('aaaaaaaa-0000-0000-0000-00000000000a', 'nope', array['records:read'])$q$, '%not allowed%');
select t.logout();
select t.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('an unknown scope is refused', $q$select * from public.api_key_create('aaaaaaaa-0000-0000-0000-00000000000a', 'bad', array['root'])$q$, '%scopes%');
select t.raises('the owner of A cannot create a key in B', $q$select * from public.api_key_create('bbbbbbbb-0000-0000-0000-00000000000b', 'x', array['records:read'])$q$, '%not allowed%');
select t.check('a second create yields a different key', (select api_key from public.api_key_create('aaaaaaaa-0000-0000-0000-00000000000a', 'k2', array['records:read'])) <> (select api_key from _k));
select public.api_key_revoke((select id from _k));
select t.logout();
select t.check('a revoked key no longer verifies', (select count(*) from public.api_key_verify(t.sec(), (select api_key from _k))) = 0);
select t.check('revocation is recorded', (select revoked_at from public.api_keys where id = (select id from _k)) is not null);
select t.login('b0000000-0000-0000-0000-000000000001', 'aal2');
select t.raises('tenant B cannot revoke tenant A key', format($q$select public.api_key_revoke(%L)$q$, (select id from _k)), '%not allowed%');
select t.logout();
