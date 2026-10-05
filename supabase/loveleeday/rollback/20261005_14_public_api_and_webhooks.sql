-- Rollback for 20261005_14_public_api_and_webhooks.sql. Drops the public API reads, the webhook triggers and worker RPCs, the atomic
-- rotation RPC, and the added columns. Queued webhook payloads are lost (deliveries rows stay, without payload/next_at).
drop trigger if exists webhook_sync_runs on public.sync_runs;
drop trigger if exists webhook_approvals on public.approvals;
drop trigger if exists webhook_connection_health on public.tenant_connections;
drop function if exists private.tg_webhook_sync_runs();
drop function if exists private.tg_webhook_approvals();
drop function if exists private.tg_webhook_connection_health();
drop function if exists private.webhook_enqueue(uuid, text, jsonb);
drop function if exists public.webhook_deliveries_due(text, integer);
drop function if exists public.webhook_delivery_record(text, uuid, text, integer, integer, timestamptz);
drop function if exists public.public_api_connections(text, uuid, bigint, integer);
drop function if exists public.public_api_records(text, uuid, bigint, integer, text, text);
drop function if exists public.public_api_approvals(text, uuid, bigint, integer, text);
drop function if exists public.connection_rotate_tokens(text, uuid, jsonb, timestamptz, timestamptz);
drop index if exists public.webhook_deliveries_due_idx;
alter table public.webhook_deliveries drop constraint if exists webhook_deliveries_status_check;
alter table public.webhook_deliveries drop column if exists next_at, drop column if exists payload;
drop index if exists public.approvals_tenant_seq_idx;
drop index if exists public.tenant_connections_tenant_seq_idx;
alter table public.approvals drop column if exists seq;
alter table public.tenant_connections drop column if exists seq;
