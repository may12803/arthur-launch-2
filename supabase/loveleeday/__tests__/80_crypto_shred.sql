-- Credential encryption round trip with the vault tenant key, then crypto-shred makes it unreadable. Uses its own tenant.
insert into auth.users (id, email, email_confirmed_at) values ('c0000000-0000-0000-0000-000000000001', 'owner-c@example.test', now());
insert into public.tenants (id, name, slug) values ('cccccccc-0000-0000-0000-00000000000c', 'Tenant C', 'tenant-c');
insert into public.memberships (tenant_id, user_id, role, accepted_at) values ('cccccccc-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', 'owner', now());

select t.login('c0000000-0000-0000-0000-000000000001', 'aal2');
select t.check('owner stores a credential', public.connection_set_key('cccccccc-0000-0000-0000-00000000000c', 'legacy-key', '{"api_key":"sk-round-trip-123"}') = 'key_received');
select t.logout();
select t.check('a tenant key now exists in the vault', (select count(*) from private.tenant_keys k join vault.secrets s on s.id = k.secret_id where k.tenant_id = 'cccccccc-0000-0000-0000-00000000000c') = 1);
select t.check('ciphertext does not contain the credential', (select position('sk-round-trip-123' in encode(s.ciphertext, 'escape')) from private.connection_secrets s
  join public.tenant_connections c on c.id = s.connection_id where c.tenant_id = 'cccccccc-0000-0000-0000-00000000000c') = 0);
select t.check('round trip: the server reads the credential back through the tenant key',
  (public.connection_secret(t.sec(), (select id from public.tenant_connections where tenant_id = 'cccccccc-0000-0000-0000-00000000000c'))::jsonb ->> 'api_key') = 'sk-round-trip-123');
select t.check('direct decryption with the vault key agrees', extensions.pgp_sym_decrypt(
  (select s.ciphertext from private.connection_secrets s join public.tenant_connections c on c.id = s.connection_id where c.tenant_id = 'cccccccc-0000-0000-0000-00000000000c'),
  (select v.decrypted_secret from private.tenant_keys k join vault.decrypted_secrets v on v.id = k.secret_id where k.tenant_id = 'cccccccc-0000-0000-0000-00000000000c')) like '%sk-round-trip-123%');
select t.check('a token set stored for the same tenant uses the same key (one key per tenant)',
  public.connection_store_tokens(t.sec(), (select id from public.tenant_connections where tenant_id = 'cccccccc-0000-0000-0000-00000000000c'), '{"access_token":"AT-C","refresh_token":"RT-C"}', now())
  and (select count(*) from private.tenant_keys where tenant_id = 'cccccccc-0000-0000-0000-00000000000c') = 1);

select t.check('crypto shred runs', public.tenant_crypto_shred('cccccccc-0000-0000-0000-00000000000c') >= 0);
select t.check('the vault key is gone', (select count(*) from private.tenant_keys where tenant_id = 'cccccccc-0000-0000-0000-00000000000c') = 0
  and (select count(*) from vault.secrets where name = 'tenant-dek-cccccccc-0000-0000-0000-00000000000c') = 0);
select t.raises('after shredding, the credential is unreadable', $q$select public.connection_secret(t.sec(), (select id from public.tenant_connections where tenant_id = 'cccccccc-0000-0000-0000-00000000000c'))$q$, '%no key for this client%');
