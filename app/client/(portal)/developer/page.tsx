import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { DeveloperView, type ApiKeyRow, type DeliveryRow, type WebhookRow } from "@/components/client-portal/connectors/DeveloperView";
import { Notice, PageHead, SettingsLayout } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const ctx = await requireClientPortal();
  const admin = ctx.role === "owner" || ctx.role === "admin";
  let keys: ApiKeyRow[] = [], hooks: WebhookRow[] = [], deliveries: DeliveryRow[] = [];
  const errors: (string | null)[] = [];
  if (admin) {
    const supabase = await getLoveleedayServer();
    const [k, w, d] = await Promise.all([
      supabase.from("api_keys").select("id, name, prefix, scopes, created_at, last_used_at, revoked_at").eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).returns<ApiKeyRow[]>(),
      supabase.from("webhook_endpoints").select("id, url, events, active, created_at").eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).returns<WebhookRow[]>(),
      supabase.from("webhook_deliveries").select("id, endpoint_id, event, status, response_code, attempt, at").eq("tenant_id", ctx.tenantId).order("at", { ascending: false }).limit(25).returns<DeliveryRow[]>(),
    ]);
    keys = k.data ?? []; hooks = w.data ?? []; deliveries = d.data ?? [];
    errors.push(k.error && `API keys: ${k.error.message}`, w.error && `Webhooks: ${w.error.message}`, d.error && `Delivery log: ${d.error.message}`);
  }
  return (
    <div>
      <PageHead eyebrow={`${ctx.tenantName} · Settings`} title="Developer settings" lead="Read-only API keys and signed webhooks for your own tools. Secrets are shown once and never again." />
      <SettingsLayout active="/client/developer" isAdmin={admin}>
        {admin ? <DeveloperView keys={keys} webhooks={hooks} deliveries={deliveries} canManage errors={errors} /> : <Notice tone="info"><div>Developer settings are visible to owners and admins.</div></Notice>}
      </SettingsLayout>
    </div>
  );
}
