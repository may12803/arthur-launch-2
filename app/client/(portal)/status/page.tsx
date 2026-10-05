import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import type { Connector } from "@/lib/client-portal/connections";
import { buildCatalog, type ConnRow } from "@/lib/client-portal/connector-ui";
import { StatusView } from "@/components/client-portal/connectors/StatusView";
import { PageHead, SettingsLayout } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [legacy, mine] = await Promise.all([
    supabase.from("connectors").select("*").order("sort").returns<Connector[]>(),
    supabase.from("tenant_connections").select("*").eq("tenant_id", ctx.tenantId).returns<ConnRow[]>(),
  ]);
  const admin = ctx.role === "owner" || ctx.role === "admin";
  return (
    <div>
      <PageHead eyebrow={`${ctx.tenantName} · Settings`} title="Status and notifications" lead="What is running, what is behind, and how you want to hear about it." />
      <SettingsLayout active="/client/status" isAdmin={admin}>
        <StatusView entries={buildCatalog(legacy.data ?? [])} conns={mine.data ?? []} now={Date.now()} dbOk={!legacy.error && !mine.error} errors={[legacy.error && `Connectors: ${legacy.error.message}`, mine.error && `Connections: ${mine.error.message}`]} />
      </SettingsLayout>
    </div>
  );
}
