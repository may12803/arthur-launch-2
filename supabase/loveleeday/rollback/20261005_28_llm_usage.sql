-- Rollback for 20261005_28_llm_usage.sql. Drops the writer RPC and the per-model detail table; the per-model breakdown is lost.
-- tenant_cost_usage (migration 23) keeps whatever token totals the RPC already added to it.
drop function if exists public.billing_record_llm_usage(text, uuid, date, text, text, bigint, bigint, bigint);
drop table if exists public.tenant_llm_usage;
