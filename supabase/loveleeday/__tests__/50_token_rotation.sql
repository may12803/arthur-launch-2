-- Refresh-token rotation: compare-and-set on rotated_at inside one statement; a stale writer cannot overwrite a newer token set.
insert into public.tenant_connections (id, tenant_id, connector_key, definition_key, auth_method, status)
  values ('c1000000-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'quickbooks-online', 'quickbooks-online', 'oauth2_authcode', 'requested');
create temp table _t as select now() as t0;

select t.check('first token set is stored', public.connection_store_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000c1',
  '{"access_token":"AT1","refresh_token":"RT1","expires_at":"2031-01-01T00:00:00Z","token_type":"Bearer","scope":"com.intuit.quickbooks.accounting"}', (select t0 - interval '2 hours' from _t)));
select t.check('storing tokens connects the connection and records expiry + scopes',
  (select status from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000c1') = 'connected'
  and (select token_expires_at from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000c1') = '2031-01-01T00:00:00Z'
  and (select scopes from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000c1') = array['com.intuit.quickbooks.accounting']);
select t.check('a newer rotation (T2) replaces it', public.connection_store_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000c1',
  '{"access_token":"AT2","refresh_token":"RT2","expires_at":"2031-02-01T00:00:00Z"}', (select t0 - interval '1 hour' from _t)));
select t.check('a stale writer holding the older rotated_at is rejected', public.connection_store_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000c1',
  '{"access_token":"AT-STALE","refresh_token":"RT-STALE"}', (select t0 - interval '90 minutes' from _t)) = false);
select t.check('an equal rotated_at is also rejected (strictly newer wins)', public.connection_store_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000c1',
  '{"access_token":"AT-EQ","refresh_token":"RT-EQ"}', (select t0 - interval '1 hour' from _t)) = false);
select t.check('the stored tokens are still T2 after the rejected writes',
  (public.connection_secret(t.sec(), 'c1000000-0000-0000-0000-0000000000c1')::jsonb ->> 'refresh_token') = 'RT2'
  and (public.connection_secret(t.sec(), 'c1000000-0000-0000-0000-0000000000c1')::jsonb ->> 'access_token') = 'AT2');
select t.check('rotated_at is stored inside the token set', (public.connection_secret(t.sec(), 'c1000000-0000-0000-0000-0000000000c1')::jsonb ->> 'rotated_at') is not null);
select t.check('a rejected write left the connection row untouched', (select token_expires_at from public.tenant_connections where id = 'c1000000-0000-0000-0000-0000000000c1') = '2031-02-01T00:00:00Z');
select t.check('a still newer rotation (T3) is accepted after the rejections', public.connection_store_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000c1',
  '{"access_token":"AT3","refresh_token":"RT3"}', (select t0 from _t)));
select t.check('T3 is now the stored set', (public.connection_secret(t.sec(), 'c1000000-0000-0000-0000-0000000000c1')::jsonb ->> 'refresh_token') = 'RT3');
select t.check('ciphertext does not contain the token in the clear',
  (select position('RT3' in encode(ciphertext, 'escape')) from private.connection_secrets where connection_id = 'c1000000-0000-0000-0000-0000000000c1') = 0);
select t.check('only one secrets row exists for the connection', (select count(*) from private.connection_secrets where connection_id = 'c1000000-0000-0000-0000-0000000000c1') = 1);
select t.raises('missing rotated_at raises', $q$select public.connection_store_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000c1', '{"access_token":"x"}', null)$q$, '%rotated_at%');
select t.raises('missing access_token raises', $q$select public.connection_store_tokens(t.sec(), 'c1000000-0000-0000-0000-0000000000c1', '{"refresh_token":"x"}', now())$q$, '%access_token%');
select t.check('the legacy connections-server secret still reads credentials', public.connection_secret(t.oldsec(), 'c1000000-0000-0000-0000-0000000000c1') is not null);
