import Link from "next/link";
import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted } from "@/components/client-portal/ui";
import { formatDate } from "@/lib/client-portal/format";
import { CONN_LABEL, METHOD_LABEL, type Connector, type TenantConnection } from "@/lib/client-portal/connections";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [{ data: catalog }, { data: mine }] = await Promise.all([
    supabase.from("connectors").select("*").order("sort").returns<Connector[]>(),
    supabase.from("tenant_connections").select("connector_key, status, access, managed_by, note, proof, error, last_probe_at, updated_at").eq("tenant_id", ctx.tenantId).returns<TenantConnection[]>(),
  ]);
  const by = Object.fromEntries((mine ?? []).map((m) => [m.connector_key, m]));
  const live = (mine ?? []).filter((m) => m.status === "live").length;
  const categories = [...new Set((catalog ?? []).map((c) => c.category))];

  return (
    <div>
      <Eyebrow>{ctx.tenantName} · Connections</Eyebrow>
      <PageTitle>Your platforms. <span className="text-[#8c8e95]">{live} live and verified.</span></PageTitle>
      <Muted className="max-w-[62ch]">Connect the systems your business runs on so we can review them and do the work. Everything is read-only unless you approve a change, every connection shows how we proved it works, and you can disconnect any time.</Muted>

      <div className="mt-10 grid gap-10">
        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#777980]">{cat}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {(catalog ?? []).filter((c) => c.category === cat).map((c) => {
                const m = by[c.key]; const s = m?.status ?? "not_connected";
                return (
                  <Link key={c.key} href={`/client/connections/${c.key}`}>
                    <Card className="flex h-full flex-col gap-2 p-5 transition-colors hover:border-[#c9ccd3]">
                      <span className="flex items-start justify-between gap-3"><span className="text-[16px] font-medium text-[var(--ink)]">{c.name}</span><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${CONN_LABEL[s][1]}`}>{CONN_LABEL[s][0]}</span></span>
                      <span className="text-[13px] leading-[1.55] text-[var(--muted)]">{m?.proof || m?.error || m?.note || c.uses}</span>
                      <span className="mt-auto flex flex-wrap justify-between gap-2 pt-1 text-[12px] text-[var(--muted)]"><span>{m?.managed_by === "loveleeday" ? "Managed by LOVELEEDAY" : METHOD_LABEL[c.method]}</span>{m?.last_probe_at && <span>Checked {formatDate(m.last_probe_at)}</span>}</span>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
