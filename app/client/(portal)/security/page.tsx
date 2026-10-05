import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { SecurityView, type SecurityRow } from "@/components/client-portal/connectors/SecurityView";
import { Notice, PageHead, SettingsLayout } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const ctx = await requireClientPortal();
  const admin = ctx.role === "owner" || ctx.role === "admin";
  let row: SecurityRow | null = null;
  let loadError: string | null = null;
  if (admin) {
    const supabase = await getLoveleedayServer();
    const r = await supabase.from("tenant_security").select("sso_enforced, sso_domains, scim_enabled, session_hours, retention_days").eq("tenant_id", ctx.tenantId).maybeSingle<SecurityRow>();
    row = r.data;
    loadError = r.error?.message ?? null;
  }
  return (
    <div>
      <PageHead eyebrow={`${ctx.tenantName} · Settings`} title="Security center" lead="Single sign-on, sign-in rules, retention and who has access to your account." />
      <SettingsLayout active="/client/security" isAdmin={admin}>
        {admin ? <SecurityView security={row} isOwner={ctx.role === "owner"} loadError={loadError} /> : <Notice tone="info"><div>The security center is visible to owners and admins.</div></Notice>}
      </SettingsLayout>
    </div>
  );
}
