import { requireClientPortal } from "@/lib/client-portal/session";
import { Card, Eyebrow, PageTitle, Muted, StatusBadge } from "@/components/client-portal/ui";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-line-separator last:border-0">
      <span className="text-small text-text-muted">{label}</span>
      <span className="text-[14px] text-text-active font-medium">{value}</span>
    </div>
  );
}

export default async function AccountPage() {
  const ctx = await requireClientPortal();

  return (
    <div>
      <Eyebrow>Company</Eyebrow>
      <PageTitle>Account</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        Details for your LOVELEEDAY account. Reach out to your contact to change any of this.
      </Muted>

      <Card className="p-6">
        <Row label="Company" value={ctx.tenantName} />
        <Row label="Plan" value={ctx.tenantPlan || "—"} />
        <Row label="Status" value={<StatusBadge status={ctx.tenantStatus} />} />
        <Row label="Your role" value={ctx.role} />
        <Row label="Signed in as" value={ctx.email || "—"} />
      </Card>
    </div>
  );
}
