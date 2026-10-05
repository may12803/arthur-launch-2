import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { ApprovalsView, type Approval } from "@/components/client-portal/connectors/ApprovalsView";
import { ErrorBanner, PageHead } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const r = await supabase.from("approvals").select("*").eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(300).returns<Approval[]>();
  return (
    <div>
      <PageHead
        eyebrow={`${ctx.tenantName} · Approvals`}
        title="Approvals"
        lead="We prepare the work and stop here. Nothing that moves money, sends a message or binds you leaves without a person saying yes. An approval closes only when the result is observed in your systems."
      />
      <ErrorBanner label="Approvals did not load" errors={[r.error && r.error.message]} />
      <ApprovalsView approvals={r.data ?? []} role={ctx.role} />
    </div>
  );
}
