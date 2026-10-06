import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted } from "@/components/client-portal/ui";
import { ManageBillingButton } from "@/components/client-portal/ManageBillingButton";
import { UsageView, type Usage } from "@/components/client-portal/connectors/UsageView";

import { PlanPicker } from "@/components/client-portal/PlanPicker";
import { PLANS, currentLookupKey, money, stripeMode } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

type Sub = { plan_key: string | null; billing_interval: string | null; status: string; amount_cents: number | null; current_period_end: string | null; cancel_at_period_end: boolean; last_invoice_status: string | null; livemode: boolean };

export default async function BillingPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();

  // `tenants.stripe_customer_id` is a proposed nullable column (see the task
  // report SQL — not applied yet). Select defensively: a missing column
  // errors on Postgres's side, and this page treats that identically to "no
  // customer id set" rather than 500ing, so it renders correctly both before
  // and after the migration lands.
  let stripeCustomerId: string | null = null;
  const { data, error } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", ctx.tenantId)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (!error) stripeCustomerId = data?.stripe_customer_id ?? null;

  const subRes = await supabase
    .from("tenant_subscriptions")
    .select("plan_key, billing_interval, status, amount_cents, current_period_end, cancel_at_period_end, last_invoice_status, livemode")
    .eq("tenant_id", ctx.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<Sub>();
  // A failed subscription read is not "no subscription": show the load error instead of a purchase prompt.
  const subError = !!subRes.error;
  if (subError) console.error("[billing] subscription read failed", { tenant: ctx.tenantId, error: subRes.error?.message });
  const sub = subError ? null : subRes.data;
  const planName = PLANS.find((p) => p.key === sub?.plan_key)?.name ?? sub?.plan_key ?? "";
  const canBuy = ctx.role === "owner" || ctx.role === "admin";
  const active = !!sub && ["active", "trialing", "past_due"].includes(sub.status);

  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [team, conns, runs, ups, docs, keys] = await Promise.all([
    supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId }),
    supabase.from("tenant_connections").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).not("status", "in", "(not_connected,disconnected)"),
    supabase.from("sync_runs").select("rows_read").eq("tenant_id", ctx.tenantId).gte("started_at", since).order("started_at", { ascending: false }).limit(5000).returns<{ rows_read: number | null }[]>(),
    supabase.from("upload_mappings").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).gte("created_at", since),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId),
    supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).is("revoked_at", null),
  ]);
  const usage: Usage = {
    members: team.error ? null : ((team.data as unknown[] | null)?.length ?? 0),
    connections: conns.error ? null : conns.count ?? 0,
    rowsRead30d: runs.error ? null : (runs.data ?? []).reduce((a, r) => a + (r.rows_read ?? 0), 0),
    rowsTruncated: (runs.data?.length ?? 0) >= 5000,
    syncs30d: runs.error ? null : runs.data?.length ?? 0,
    uploads30d: ups.error ? null : ups.count ?? 0,
    documents: docs.error ? null : docs.count ?? 0,
    apiKeys: keys.error ? null : keys.count ?? 0,
  };
  const usageErrors = [team.error && `Members: ${team.error.message}`, conns.error && `Connections: ${conns.error.message}`, runs.error && `Sync records: ${runs.error.message}`, ups.error && `Uploads: ${ups.error.message}`, docs.error && `Documents: ${docs.error.message}`, keys.error && `API keys: ${keys.error.message}`];

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Billing</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        Manage your payment method, invoices, and plan through Stripe.
      </Muted>

      {stripeMode() === "test" && <p className="ll-feedback warn mb-4">Test mode: no real charges are made.</p>}
      {sub && (
        <Card className="p-8 mb-8">
          <p className="font-serif text-h3 text-text-active mb-2">Current subscription</p>
          <p data-testid="current-subscription" className="text-[15px] text-text-active">
            {planName}{sub.billing_interval ? `, billed ${sub.billing_interval}` : ""}{sub.amount_cents != null ? `, ${money(sub.amount_cents)}` : ""}. Status: {sub.status}
            {sub.cancel_at_period_end ? ", ends at period end" : ""}
            {sub.current_period_end ? `. Renews or ends ${new Date(sub.current_period_end).toLocaleDateString("en-US", { timeZone: "America/New_York" })}` : ""}.
            {sub.last_invoice_status === "payment_failed" ? " Your last payment failed. Update your payment method below." : ""}
          </p>
        </Card>
      )}
      {!error && !subError && <PlanPicker canBuy={canBuy} currentLookupKey={active ? currentLookupKey(sub?.plan_key, sub?.billing_interval) : null} />}

      {error || subError ? (
        <Card className="p-10 text-center">
          <p role="alert" className="font-serif text-h3 text-text-active mb-2">Couldn&apos;t load your billing details</p>
          <Muted className="mx-auto max-w-[46ch]">
            This is on our side, not yours. Refresh in a moment; if it keeps happening, tell your LOVELEEDAY contact.
          </Muted>
        </Card>
      ) : stripeCustomerId ? (
        <Card className="p-8">
          <p className="font-serif text-h3 text-text-active mb-2">Manage billing</p>
          <Muted className="mb-6 max-w-[46ch]">
            Update your payment method, view invoices, and change your plan in Stripe&apos;s secure billing
            portal.
          </Muted>
          <ManageBillingButton />
        </Card>
      ) : (
        <Card className="p-10 text-center">
          <p className="font-serif text-h3 text-text-active mb-2">No subscription yet</p>
          <Muted className="mx-auto max-w-[46ch]">
            Pick a plan above to start. Your payment method and invoices will appear here once you do.
          </Muted>
        </Card>
      )}

      <UsageView u={usage} errors={usageErrors} />
    </div>
  );
}
