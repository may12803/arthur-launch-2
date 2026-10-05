-- Rollback for 20261005_23_billing.sql. Drops billing RPCs and tables; subscription state and the event ledger are lost
-- (Stripe remains the source of truth and can replay events). tenants.stripe_customer_id and tenants.plan are left as they are.
drop function if exists public.billing_invoice_record(text, text, text, timestamptz, text, boolean, boolean);
drop function if exists public.billing_subscription_upsert(text, text, text, timestamptz, uuid, text, text, text, text, text, text, integer, text, timestamptz, boolean, boolean);
drop function if exists public.billing_tenant_for_customer(text, text);
drop function if exists public.billing_set_customer(text, uuid, text);
drop table if exists public.tenant_cost_usage;
drop table if exists public.stripe_events;
drop table if exists public.tenant_subscriptions;
