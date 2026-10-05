import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { OrgView } from "@/components/client-portal/connectors/OrgView";
import { ErrorBanner, PageHead, SettingsLayout } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [sec, ents, conns, team] = await Promise.all([
    supabase.from("tenant_security").select("retention_days, session_hours").eq("tenant_id", ctx.tenantId).maybeSingle<{ retention_days: number; session_hours: number }>(),
    supabase.from("entities").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId),
    supabase.from("tenant_connections").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).not("status", "in", "(not_connected,disconnected)"),
    supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId }),
  ]);
  const admin = ctx.role === "owner" || ctx.role === "admin";
  return (
    <div>
      <PageHead eyebrow={`${ctx.tenantName} · Settings`} title="Organization" lead="Your company, how it is structured, and who works in which part of it." />
      <SettingsLayout active="/client/organization" isAdmin={admin}>
        <ErrorBanner errors={[sec.error && `Security settings: ${sec.error.message}`, ents.error && `Entities: ${ents.error.message}`, conns.error && `Connections: ${conns.error.message}`, team.error && `Team: ${team.error.message}`]} />
        <OrgView
          name={ctx.tenantName}
          status={ctx.tenantStatus}
          role={ctx.role}
          retentionDays={sec.data?.retention_days ?? null}
          sessionHours={sec.data?.session_hours ?? null}
          entityCount={ents.count ?? 0}
          memberCount={team.error ? null : ((team.data as unknown[] | null)?.length ?? 0)}
          connectionCount={conns.count ?? 0}
          admin={admin}
        />
      </SettingsLayout>
    </div>
  );
}
