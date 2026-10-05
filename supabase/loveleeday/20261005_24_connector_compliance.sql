-- Vendor-review compliance: Shopify mandatory privacy webhooks, Atlassian Personal Data Reporting, per-tenant Zendesk subdomain.
-- Server RPCs are gated by private.server_ok_named(p_secret, 'connectors-server') like every other server RPC in 20261005_10.
-- Idempotent: safe to apply twice. Rollback: rollback/20261005_24_connector_compliance.sql.

-- Non-secret per-connection settings (Zendesk subdomain, Shopify shop). Secrets stay in private.connection_secrets.
alter table public.tenant_connections add column if not exists config jsonb not null default '{}'::jsonb;

-- Requests a vendor sends us that a person has to fulfil (Shopify customers/data_request). Server-only table.
create table if not exists public.compliance_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  source_system text not null,
  topic text not null,
  subject text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status = any (array['open','in_progress','done'])),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);
alter table public.compliance_requests enable row level security;
revoke all on public.compliance_requests from public, anon, authenticated;

-- Connections of one system belonging to a shop (matches config.shop, then external_account_id, then the decrypted stored shop).
create or replace function private.connections_for_shop(p_system text, p_shop text)
returns setof public.tenant_connections language plpgsql security definer set search_path = '' as $$
declare c public.tenant_connections%rowtype; v_secret text;
begin
  for c in select * from public.tenant_connections x where coalesce(x.definition_key, x.connector_key) = p_system loop
    if lower(coalesce(c.config ->> 'shop', c.external_account_id, '')) = lower(p_shop) then return next c; continue; end if;
    select extensions.pgp_sym_decrypt(s.ciphertext, private.tenant_key(c.tenant_id)) into v_secret from private.connection_secrets s where s.connection_id = c.id;
    if v_secret is not null and lower(coalesce((v_secret::jsonb) ->> 'shop', '')) = lower(p_shop) then return next c; end if;
  end loop;
end $$;
revoke all on function private.connections_for_shop(text, text) from public, anon, authenticated;

-- shop/redact: delete every ingested Shopify record for the shop. Returns rows deleted.
create or replace function public.shopify_shop_redact(p_secret text, p_shop text)
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.tenant_connections%rowtype; v_n integer := 0; v_k integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_shop is null or length(trim(p_shop)) = 0 then raise exception 'shop is required'; end if;
  for c in select * from private.connections_for_shop('shopify', p_shop) loop
    delete from public.ingested_records where connection_id = c.id;
    get diagnostics v_k = row_count; v_n := v_n + v_k;
    delete from public.sync_cursors where connection_id = c.id;
    insert into public.audit_log (tenant_id, actor, action, target, meta) values (c.tenant_id, null, 'compliance.shop_redact', 'connection:' || c.id, jsonb_build_object('rows', v_k));
  end loop;
  insert into public.compliance_requests (tenant_id, source_system, topic, subject, status, fulfilled_at)
    values (null, 'shopify', 'shop/redact', lower(p_shop), 'done', now());
  return v_n;
end $$;

-- customers/redact: delete the customer record and any order/customer row that carries their email or a listed order id.
create or replace function public.shopify_customer_redact(p_secret text, p_shop text, p_customer_id text, p_email text, p_order_ids text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.tenant_connections%rowtype; v_n integer := 0; v_k integer; v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_shop is null or length(trim(p_shop)) = 0 then raise exception 'shop is required'; end if;
  for c in select * from private.connections_for_shop('shopify', p_shop) loop
    delete from public.ingested_records r where r.connection_id = c.id and (
      (p_customer_id is not null and r.object = 'customers' and r.source_ref like '%/Customer/' || p_customer_id)
      or (v_email is not null and lower(coalesce(r.payload ->> 'email', '')) = v_email)
      or (p_order_ids is not null and r.object = 'orders' and exists (select 1 from unnest(p_order_ids) o where r.source_ref like '%/Order/' || o)));
    get diagnostics v_k = row_count; v_n := v_n + v_k;
    insert into public.audit_log (tenant_id, actor, action, target, meta) values (c.tenant_id, null, 'compliance.customer_redact', 'connection:' || c.id, jsonb_build_object('rows', v_k));
  end loop;
  insert into public.compliance_requests (tenant_id, source_system, topic, subject, status, fulfilled_at)
    values (null, 'shopify', 'customers/redact', lower(p_shop), 'done', now());
  return v_n;
end $$;

-- customers/data_request: queue a task for a person to fulfil (the data is not ours to send automatically).
create or replace function public.compliance_request_log(p_secret text, p_source text, p_topic text, p_shop text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_t uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select c.tenant_id into v_t from private.connections_for_shop(p_source, p_shop) c limit 1;
  insert into public.compliance_requests (tenant_id, source_system, topic, subject, payload)
    values (v_t, p_source, p_topic, lower(p_shop), coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  if v_t is not null then
    insert into public.audit_log (tenant_id, actor, action, target, meta) values (v_t, null, 'compliance.' || replace(p_topic, '/', '_'), 'compliance_request:' || v_id, '{}'::jsonb);
  end if;
  return v_id;
end $$;

-- Atlassian Personal Data Reporting: the accountIds we hold, from Jira/Trello connections and their ingested user records.
create or replace function public.atlassian_accounts_list(p_secret text)
returns table(connection_id uuid, definition_key text, account_id text, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query
    select c.id, coalesce(c.definition_key, c.connector_key), c.external_account_id, c.updated_at from public.tenant_connections c
      where coalesce(c.definition_key, c.connector_key) in ('jira', 'trello') and c.external_account_id is not null and c.status not in ('not_connected', 'disconnected')
    union
    select r.connection_id, r.source_system, r.source_ref, max(r.observed_at) from public.ingested_records r
      where r.source_system in ('jira', 'trello') and r.object = 'users' group by r.connection_id, r.source_system, r.source_ref;
end $$;

-- "closed": delete everything held about the account. "updated": drop the stored user rows and the users cursor so the next sync refetches them.
create or replace function public.atlassian_account_apply(p_secret text, p_account_id text, p_status text)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; v_n integer := 0; v_k integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_status not in ('closed', 'updated') then raise exception 'unknown status'; end if;
  if p_account_id is null or length(p_account_id) = 0 then raise exception 'account id is required'; end if;
  for c in select distinct r.connection_id, r.tenant_id from public.ingested_records r
      where r.source_system in ('jira', 'trello') and (r.source_ref = p_account_id or r.payload ->> 'accountId' = p_account_id) loop
    delete from public.ingested_records r where r.connection_id = c.connection_id and (r.source_ref = p_account_id or r.payload ->> 'accountId' = p_account_id);
    get diagnostics v_k = row_count; v_n := v_n + v_k;
    delete from public.sync_cursors where connection_id = c.connection_id and object = 'users';
    insert into public.audit_log (tenant_id, actor, action, target, meta) values (c.tenant_id, null, 'compliance.atlassian_' || p_status, 'connection:' || c.connection_id, jsonb_build_object('rows', v_k));
  end loop;
  if p_status = 'closed' then
    update public.tenant_connections set external_account_id = null, updated_at = now() where external_account_id = p_account_id and coalesce(definition_key, connector_key) in ('jira', 'trello');
  end if;
  return v_n;
end $$;

-- Per-connection non-secret settings (Zendesk subdomain).
create or replace function public.connection_config_set(p_secret text, p_connection uuid, p_config jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'config must be an object'; end if;
  update public.tenant_connections set config = config || p_config, updated_at = now() where id = p_connection;
  return found;
end $$;

create or replace function public.connection_config_get(p_secret text, p_connection uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select config into v from public.tenant_connections where id = p_connection;
  return coalesce(v, '{}'::jsonb);
end $$;

revoke all on function public.shopify_shop_redact(text, text), public.shopify_customer_redact(text, text, text, text, text[]),
  public.compliance_request_log(text, text, text, text, jsonb), public.atlassian_accounts_list(text),
  public.atlassian_account_apply(text, text, text), public.connection_config_set(text, uuid, jsonb), public.connection_config_get(text, uuid) from public;
grant execute on function public.shopify_shop_redact(text, text), public.shopify_customer_redact(text, text, text, text, text[]),
  public.compliance_request_log(text, text, text, text, jsonb), public.atlassian_accounts_list(text),
  public.atlassian_account_apply(text, text, text), public.connection_config_set(text, uuid, jsonb), public.connection_config_get(text, uuid) to anon, authenticated, service_role;
