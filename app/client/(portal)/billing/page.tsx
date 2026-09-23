import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted } from "@/components/client-portal/ui";
import { ManageBillingButton } from "@/components/client-portal/ManageBillingButton";

export const dynamic = "force-dynamic";

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

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Billing</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        Manage your payment method, invoices, and plan through Stripe.
      </Muted>

      {stripeCustomerId ? (
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
          <p className="font-serif text-h3 text-text-active mb-2">No billing set up yet</p>
          <Muted className="mx-auto max-w-[46ch]">
            Loveleeday hasn&apos;t connected billing for {ctx.tenantName} yet. Reach out to your contact if
            you were expecting to manage a subscription here.
          </Muted>
        </Card>
      )}
    </div>
  );
}
