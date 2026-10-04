import Link from "next/link";
import { requireClientPortal } from "@/lib/client-portal/session";
import { Card, Eyebrow, PageTitle, Muted, StatusBadge } from "@/components/client-portal/ui";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-line-separator last:border-0">
      <span className="text-small text-text-muted shrink-0">{label}</span>
      <span className="text-[14px] text-text-active font-medium min-w-0 break-all text-right">{value}</span>
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

      <Card className="p-6 mt-6">
        <h2 className="font-serif text-h3 text-text-active mb-2">Your sign-in</h2>
        <Muted className="mb-4 max-w-[60ch]">
          You sign in with your password and a 6-digit code from your authenticator app. To choose a new password we
          email you a link; you will still need your authenticator code afterwards. Lost your phone or backup codes?
          Email <a className="underline" href="mailto:daniel@loveleedaystudios.com?subject=Reset%20my%20two-factor">daniel@loveleedaystudios.com</a>.
        </Muted>
        <Link href="/client/forgot" className="ll-secondary inline-block">Change my password</Link>
      </Card>
    </div>
  );
}
