import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import type { Connector } from "@/lib/client-portal/connections";
import { buildCatalog, type ConnRow } from "@/lib/client-portal/connector-ui";
import { StatusView } from "./status-view";
import { PageHead, SettingsLayout } from "@/components/client-portal/cp";
import { NotificationForm } from "./notification-form";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [legacy, mine, prefs] = await Promise.all([
    supabase.from("connectors").select("*").order("sort").returns<Connector[]>(),
    supabase.from("tenant_connections").select("*").eq("tenant_id", ctx.tenantId).returns<ConnRow[]>(),
    supabase.from("notification_prefs").select("approvals_digest, sync_failures, weekly_summary").eq("tenant_id", ctx.tenantId).eq("user_id", ctx.userId).maybeSingle<{ approvals_digest: "off" | "daily" | "instant"; sync_failures: boolean; weekly_summary: boolean }>(),
  ]);
  const admin = ctx.role === "owner" || ctx.role === "admin";
  return (
    <div>
      <PageHead eyebrow={`${ctx.tenantName} · Settings`} title="Status and notifications" lead="What is running, what is behind, and how you want to hear about it." />
      <SettingsLayout active="/client/status" isAdmin={admin}>
        <StatusView entries={buildCatalog(legacy.data ?? [])} conns={mine.data ?? []} now={Date.now()} dbOk={!legacy.error && !mine.error} errors={[legacy.error && `Connectors: ${legacy.error.message}`, mine.error && `Connections: ${mine.error.message}`]} />
        {prefs.error ? <p className="ll-feedback warn mt-6">Notification settings could not be loaded. Try again later.</p> : <div className="mt-6"><NotificationForm tenantId={ctx.tenantId} initial={prefs.data ?? { approvals_digest: "off", sync_failures: false, weekly_summary: false }} /></div>}
      </SettingsLayout>
    </div>
  );
}
