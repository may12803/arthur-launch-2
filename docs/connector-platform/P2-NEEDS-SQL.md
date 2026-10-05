# P2 needs SQL

Do not deploy the P2 API or webhook cron until these server RPCs and the delivery queue columns are installed. The existing `api_key_verify` returns a tenant UUID; `ingested_records_since` accepts a slug and cannot filter connection or object. No server RPC reads connection status or arbitrary approval status. The current delivery table has no payload or due time, and no server RPC can decrypt an endpoint secret or record an attempt.

```sql
alter table public.webhook_deliveries add column if not exists payload jsonb;
alter table public.webhook_deliveries add column if not exists next_at timestamptz default now();

create or replace function public.public_api_connections(p_secret text, p_tenant uuid, p_after bigint, p_limit integer)
returns table(seq bigint, id uuid, connector_key text, status text, health text, last_sync timestamptz, rows integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query select row_number() over (order by c.created_at, c.id)::bigint, c.id, c.connector_key,
    case when c.status = 'live' and coalesce(c.last_rows, 0) = 0 then 'connected' else c.status end,
    coalesce(h.status, 'unknown'), c.last_success_at, coalesce(c.last_rows, 0)
  from public.tenant_connections c left join public.connection_health h on h.connection_id = c.id and h.tenant_id = p_tenant
  where c.tenant_id = p_tenant and (select count(*) from public.tenant_connections x where x.tenant_id = p_tenant and (x.created_at, x.id) <= (c.created_at, c.id)) > coalesce(p_after, 0)
  order by c.created_at, c.id limit least(greatest(p_limit, 1), 101);
end $$;

create or replace function public.public_api_records(p_secret text, p_tenant uuid, p_after bigint, p_limit integer, p_connection text, p_object text)
returns table(seq bigint, id uuid, connection_id uuid, source_system text, object text, source_ref text, payload jsonb, observed_at timestamptz, valid_from timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query select r.seq, r.id, r.connection_id, r.source_system, r.object, r.source_ref, r.payload, r.observed_at, r.valid_from
  from public.ingested_records r where r.tenant_id = p_tenant and r.seq > coalesce(p_after, 0)
    and (p_connection is null or r.connection_id::text = p_connection) and (p_object is null or r.object = p_object)
  order by r.seq limit least(greatest(p_limit, 1), 101);
end $$;

create or replace function public.public_api_approvals(p_secret text, p_tenant uuid, p_after bigint, p_limit integer, p_status text)
returns table(seq bigint, id uuid, gate text, title text, detail text, status text, source_ref text, created_at timestamptz, decided_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query select row_number() over (order by a.created_at, a.id)::bigint, a.id, a.gate, a.title, a.detail, a.status, a.source_ref, a.created_at, a.decided_at
  from public.approvals a where a.tenant_id = p_tenant and (p_status is null or a.status = p_status)
    and (select count(*) from public.approvals x where x.tenant_id = p_tenant and (p_status is null or x.status = p_status) and (x.created_at, x.id) <= (a.created_at, a.id)) > coalesce(p_after, 0)
  order by a.created_at, a.id limit least(greatest(p_limit, 1), 101);
end $$;

create or replace function public.webhook_deliveries_due(p_secret text, p_limit integer)
returns table(id uuid, url text, secret text, payload jsonb, attempt integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query select d.id, e.url, extensions.pgp_sym_decrypt(e.secret_ct, private.tenant_key(d.tenant_id, false)), d.payload, d.attempt
  from public.webhook_deliveries d join public.webhook_endpoints e on e.id = d.endpoint_id and e.tenant_id = d.tenant_id
  where d.status in ('pending', 'retry') and d.next_at <= now() and e.active and d.payload is not null
  order by d.next_at, d.id for update of d skip locked limit least(greatest(p_limit, 1), 20);
end $$;

create or replace function public.webhook_delivery_record(p_secret text, p_id uuid, p_status text, p_response_code integer, p_attempt integer, p_next_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_status not in ('delivered', 'retry', 'failed') then raise exception 'invalid delivery status'; end if;
  update public.webhook_deliveries set status = p_status, response_code = p_response_code, attempt = p_attempt + 1,
    next_at = p_next_at, at = now() where id = p_id and status in ('pending', 'retry') and attempt = p_attempt;
  if not found then raise exception 'delivery was already handled'; end if;
end $$;

revoke all on function public.public_api_connections(text, uuid, bigint, integer), public.public_api_records(text, uuid, bigint, integer, text, text), public.public_api_approvals(text, uuid, bigint, integer, text), public.webhook_deliveries_due(text, integer), public.webhook_delivery_record(text, uuid, text, integer, integer, timestamptz) from public;
grant execute on function public.public_api_connections(text, uuid, bigint, integer), public.public_api_records(text, uuid, bigint, integer, text, text), public.public_api_approvals(text, uuid, bigint, integer, text), public.webhook_deliveries_due(text, integer), public.webhook_delivery_record(text, uuid, text, integer, integer, timestamptz) to anon, authenticated, service_role;
```

The queue also needs a producer that inserts an event payload for each active subscribed endpoint. That event emission must be coupled to the source transaction so a webhook is queued only when the underlying event actually occurs.
