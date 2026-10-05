-- Billing: per-tenant Stripe subscription state, webhook idempotency ledger, and a per-tenant cost-usage stub.
-- Members read their own tenant's rows (MFA-gated like every tenant table); writes happen only through the server RPCs below, guarded by
-- private.server_ok_named(p_secret, 'connectors-server') exactly like the connector RPCs. No service-role key in the app.
-- Idempotent: safe to apply twice.

create table if not exists public.tenant_subscriptions (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  plan_key text,
  price_lookup_key text,
  billing_interval text,
  status text not null,
  amount_cents integer,
  currency text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_invoice_status text,
  last_invoice_at timestamptz,
  last_payment_failed_at timestamptz,
  livemode boolean not null default false,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscriptions_pkey primary key (id),
  constraint tenant_subscriptions_sub_key unique (stripe_subscription_id)
);
create index if not exists tenant_subscriptions_tenant_idx on public.tenant_subscriptions (tenant_id, updated_at desc);

create table if not exists public.stripe_events (
  event_id text not null,
  event_type text not null,
  tenant_id uuid,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  constraint stripe_events_pkey primary key (event_id)
);

-- Stub: one row per tenant per day of metered cost. Nothing writes it yet; the shape is fixed so the first meter can.
create table if not exists public.tenant_cost_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day date not null,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  fly_cents integer not null default 0,
  supabase_cents integer not null default 0,
  note text,
  constraint tenant_cost_usage_pkey primary key (tenant_id, day)
);

alter table public.tenant_subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.tenant_cost_usage enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tenant_subscriptions' and policyname = 'require_mfa_aal2') then
    create policy require_mfa_aal2 on public.tenant_subscriptions as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tenant_subscriptions' and policyname = 'tenant_subscriptions_member_select') then
    create policy tenant_subscriptions_member_select on public.tenant_subscriptions as permissive for select to authenticated using (public.is_tenant_member(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tenant_cost_usage' and policyname = 'require_mfa_aal2') then
    create policy require_mfa_aal2 on public.tenant_cost_usage as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tenant_cost_usage' and policyname = 'tenant_cost_usage_member_select') then
    create policy tenant_cost_usage_member_select on public.tenant_cost_usage as permissive for select to authenticated using (public.is_tenant_member(tenant_id));
  end if;
end $$;

revoke all on public.tenant_subscriptions, public.stripe_events, public.tenant_cost_usage from anon, authenticated;
grant select on public.tenant_subscriptions, public.tenant_cost_usage to authenticated;

-- Save the Stripe customer for a tenant. First writer wins; returns the customer id now on record.
create or replace function public.billing_set_customer(p_secret text, p_tenant uuid, p_customer text)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if coalesce(p_customer, '') = '' then raise exception 'customer is required'; end if;
  update public.tenants set stripe_customer_id = p_customer where id = p_tenant and stripe_customer_id is null;
  select stripe_customer_id into v from public.tenants where id = p_tenant;
  if v is null then raise exception 'tenant not found'; end if;
  return v;
end $$;

-- Resolve a tenant from a Stripe customer id (webhook events that carry no tenant metadata).
create or replace function public.billing_tenant_for_customer(p_secret text, p_customer text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select id into v from public.tenants where stripe_customer_id = p_customer;
  return v;
end $$;

-- Apply one subscription snapshot. Returns false when the event was already processed or is older than the stored state.
create or replace function public.billing_subscription_upsert(
  p_secret text, p_event_id text, p_event_type text, p_event_created timestamptz, p_tenant uuid, p_customer text, p_subscription text,
  p_plan_key text, p_price_lookup_key text, p_interval text, p_status text, p_amount_cents integer, p_currency text,
  p_period_end timestamptz, p_cancel_at_period_end boolean, p_livemode boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n int; v_prev timestamptz;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_tenant is null or not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'tenant not found'; end if;
  insert into public.stripe_events (event_id, event_type, tenant_id, livemode) values (p_event_id, p_event_type, p_tenant, coalesce(p_livemode, false)) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  select last_event_at into v_prev from public.tenant_subscriptions where stripe_subscription_id = p_subscription;
  if v_prev is not null and v_prev > p_event_created then return false; end if;
  insert into public.tenant_subscriptions as s (tenant_id, stripe_customer_id, stripe_subscription_id, plan_key, price_lookup_key, billing_interval, status,
      amount_cents, currency, current_period_end, cancel_at_period_end, livemode, last_event_at)
    values (p_tenant, p_customer, p_subscription, p_plan_key, p_price_lookup_key, p_interval, p_status, p_amount_cents, p_currency, p_period_end,
      coalesce(p_cancel_at_period_end, false), coalesce(p_livemode, false), p_event_created)
    on conflict (stripe_subscription_id) do update set
      plan_key = coalesce(excluded.plan_key, s.plan_key), price_lookup_key = coalesce(excluded.price_lookup_key, s.price_lookup_key),
      billing_interval = coalesce(excluded.billing_interval, s.billing_interval), status = excluded.status,
      amount_cents = coalesce(excluded.amount_cents, s.amount_cents), currency = coalesce(excluded.currency, s.currency),
      current_period_end = coalesce(excluded.current_period_end, s.current_period_end), cancel_at_period_end = excluded.cancel_at_period_end,
      last_event_at = excluded.last_event_at, updated_at = now();
  update public.tenants set plan = case when p_status in ('active', 'trialing', 'past_due') then p_plan_key else null end
    where id = p_tenant and (p_status in ('active', 'trialing', 'past_due') or plan = p_plan_key);
  return true;
end $$;

-- Record an invoice outcome against its subscription. Returns false when the event was already processed or the subscription is unknown.
create or replace function public.billing_invoice_record(p_secret text, p_event_id text, p_event_type text, p_event_created timestamptz, p_subscription text, p_paid boolean, p_livemode boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n int; v_tenant uuid;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select tenant_id into v_tenant from public.tenant_subscriptions where stripe_subscription_id = p_subscription;
  -- Invoice events can outrun the subscription event; failing makes Stripe retry later (the event is not recorded).
  if v_tenant is null then raise exception 'subscription not yet known'; end if;
  insert into public.stripe_events (event_id, event_type, tenant_id, livemode) values (p_event_id, p_event_type, v_tenant, coalesce(p_livemode, false)) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  update public.tenant_subscriptions set last_invoice_status = case when p_paid then 'paid' else 'payment_failed' end, last_invoice_at = p_event_created,
    last_payment_failed_at = case when p_paid then last_payment_failed_at else p_event_created end, updated_at = now()
    where stripe_subscription_id = p_subscription;
  return true;
end $$;

revoke all on function public.billing_set_customer(text, uuid, text), public.billing_tenant_for_customer(text, text),
  public.billing_subscription_upsert(text, text, text, timestamptz, uuid, text, text, text, text, text, text, integer, text, timestamptz, boolean, boolean),
  public.billing_invoice_record(text, text, text, timestamptz, text, boolean, boolean) from public;
grant execute on function public.billing_set_customer(text, uuid, text), public.billing_tenant_for_customer(text, text),
  public.billing_subscription_upsert(text, text, text, timestamptz, uuid, text, text, text, text, text, text, integer, text, timestamptz, boolean, boolean),
  public.billing_invoice_record(text, text, text, timestamptz, text, boolean, boolean) to anon, authenticated;
