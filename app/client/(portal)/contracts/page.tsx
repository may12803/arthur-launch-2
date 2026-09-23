import { Eyebrow, PageTitle, Muted, Card } from "@/components/client-portal/ui";

export default function ContractsPage() {
  return (
    <div>
      <Eyebrow>Legal</Eyebrow>
      <PageTitle>Contracts</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        Sign and manage your agreements with Loveleeday.
      </Muted>
      <Card className="p-10 text-center">
        <p className="font-serif text-h3 text-text-active mb-2">Coming soon</p>
        <Muted className="mx-auto max-w-[46ch]">
          Contract signing lands here via the SignWell integration already built for Dabney — we&apos;ll
          reuse it for the client portal rather than build a second one.
        </Muted>
      </Card>
    </div>
  );
}
