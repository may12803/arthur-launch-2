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
        <section className="mt-8 space-y-3 text-sm">
          <h2 className="text-lg font-semibold">API and webhook reference</h2>
          <p>Send <code>Authorization: Bearer lld_…</code> to <code>GET /api/v1/connections</code>, <code>GET /api/v1/records?connection=&amp;object=&amp;after=</code>, or <code>GET /api/v1/approvals?status=</code>. Use the returned <code>next_cursor</code> as the next <code>after</code> value. Keys need the matching <code>connections:read</code>, <code>records:read</code>, or <code>approvals:read</code> scope. The limit is 60 requests per minute per key.</p>
          <p>Webhook requests contain <code>{'{id, type, tenant, created_at, data}'}</code>. Verify the exact request body before parsing it. The <code>LLD-Signature</code> header contains <code>t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, where the hex value is HMAC-SHA256 of <code>t.body</code> using the signing secret shown when the endpoint is created.</p>
          <pre className="overflow-x-auto rounded bg-slate-100 p-3"><code>{`const [time, digest] = header.match(/^t=(\\d+),v1=([0-9a-f]{64})$/)?.slice(1) ?? [];
const expected = createHmac("sha256", secret).update(time + "." + rawBody).digest("hex");
const valid = !!digest && timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(expected, "hex"));`}</code></pre>
          <p>Retries follow 1 minute, 5 minutes, 30 minutes, 2 hours, and 12 hours after failed attempts. A delivery is marked complete only after a 2xx response.</p>
        </section>
      </SettingsLayout>
    </div>
  );
}
