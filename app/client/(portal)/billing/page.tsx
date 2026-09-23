import { Eyebrow, PageTitle, Muted, Card } from "@/components/client-portal/ui";

export default function BillingPage() {
  return (
    <div>
      <Eyebrow>Billing</Eyebrow>
      <PageTitle>Billing</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        Invoices, payment methods, and plan details.
      </Muted>
      <Card className="p-10 text-center">
        <p className="font-serif text-h3 text-text-active mb-2">Coming soon</p>
        <Muted className="mx-auto max-w-[46ch]">
          Billing will open the Stripe customer portal, reusing the Stripe setup already wired
          elsewhere in this app rather than a new integration.
        </Muted>
      </Card>
    </div>
  );
}
