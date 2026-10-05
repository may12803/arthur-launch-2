-- Per-tenant LLM usage detail (provider and model per day) and the writer RPC for it.
-- Needed because tenant_cost_usage (migration 23) is one row per tenant per day with only token totals: it cannot hold
-- provider, model or an estimated cost. This table adds that breakdown; the RPC also adds the tokens to the tenant_cost_usage
-- totals so the existing row stays the day's rollup. Same access pattern as migration 23: members read their own tenant
-- (MFA-gated), writes only through the server RPC guarded by private.server_ok_named(p_secret, 'connectors-server').
-- Idempotent: safe to apply twice. Rollback: rollback/20261005_28_llm_usage.sql

create table if not exists public.tenant_llm_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day date not null,
  provider text not null,
  model text not null,
  calls integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  est_cost_micros bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint tenant_llm_usage_pkey primary key (tenant_id, day, provider, model)
);

alter table public.tenant_llm_usage enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tenant_llm_usage' and policyname = 'require_mfa_aal2') then
    create policy require_mfa_aal2 on public.tenant_llm_usage as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tenant_llm_usage' and policyname = 'tenant_llm_usage_member_select') then
    create policy tenant_llm_usage_member_select on public.tenant_llm_usage as permissive for select to authenticated using (public.is_tenant_member(tenant_id));
  end if;
end $$;

revoke all on public.tenant_llm_usage from anon, authenticated;
grant select on public.tenant_llm_usage to authenticated;

-- Add one call's usage to the tenant's day. est_cost_micros is millionths of a dollar.
create or replace function public.billing_record_llm_usage(
  p_secret text, p_tenant uuid, p_day date, p_provider text, p_model text, p_tokens_in bigint, p_tokens_out bigint, p_cost_micros bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_tenant is null or not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'tenant not found'; end if;
  if coalesce(p_provider, '') = '' or coalesce(p_model, '') = '' then raise exception 'provider and model are required'; end if;
  if p_day is null or p_tokens_in < 0 or p_tokens_out < 0 or p_cost_micros < 0 then raise exception 'invalid usage'; end if;
  insert into public.tenant_llm_usage as u (tenant_id, day, provider, model, calls, tokens_in, tokens_out, est_cost_micros)
    values (p_tenant, p_day, p_provider, p_model, 1, p_tokens_in, p_tokens_out, p_cost_micros)
    on conflict (tenant_id, day, provider, model) do update set
      calls = u.calls + 1, tokens_in = u.tokens_in + excluded.tokens_in, tokens_out = u.tokens_out + excluded.tokens_out,
      est_cost_micros = u.est_cost_micros + excluded.est_cost_micros, updated_at = now();
  insert into public.tenant_cost_usage as c (tenant_id, day, tokens_in, tokens_out)
    values (p_tenant, p_day, p_tokens_in, p_tokens_out)
    on conflict (tenant_id, day) do update set tokens_in = c.tokens_in + excluded.tokens_in, tokens_out = c.tokens_out + excluded.tokens_out;
end $$;

revoke all on function public.billing_record_llm_usage(text, uuid, date, text, text, bigint, bigint, bigint) from public;
grant execute on function public.billing_record_llm_usage(text, uuid, date, text, text, bigint, bigint, bigint) to anon, authenticated;
