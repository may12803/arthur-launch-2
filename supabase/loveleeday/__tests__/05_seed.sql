select t.check('seed: 70 connector definitions loaded', (select count(*) from public.connector_definitions) = 70);
select t.check('seed: no definition claims build_status live', (select count(*) from public.connector_definitions where build_status = 'live') = 0);
select t.raises('seed: build_status live is rejected by the table', $q$update public.connector_definitions set build_status = 'live' where key = 'stripe'$q$, '%build_status_check%');
select t.check('seed: UNVERIFIED labels preserved verbatim', (select count(*) from public.connector_definitions where rate_limits ilike '%UNVERIFIED%') > 0);
select t.check('seed: every definition has an auth method from the contract list', (select count(*) from public.connector_definitions where auth_method is null) = 0);
select t.check('seed: an unknown platform key cannot be attached to a connection', (select count(*) from public.tenant_connections where connector_key = 'not-a-platform') = 0);
select t.raises('connection key guard: unknown connector_key is rejected',
  $q$insert into public.tenant_connections (tenant_id, connector_key) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'not-a-platform')$q$, 'unknown platform');
