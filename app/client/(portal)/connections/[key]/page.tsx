import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, Muted } from "@/components/client-portal/ui";
import { formatDate } from "@/lib/client-portal/format";
import { CONN_LABEL, METHOD_LABEL, type Connector, type TenantConnection } from "@/lib/client-portal/connections";
import { ConnectPanel } from "./ConnectPanel";

export const dynamic = "force-dynamic";

export default async function ConnectorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [{ data: c }, { data: m }] = await Promise.all([
    supabase.from("connectors").select("*").eq("key", key).maybeSingle<Connector>(),
    supabase.from("tenant_connections").select("connector_key, status, access, managed_by, note, proof, error, last_probe_at, updated_at").eq("connector_key", key).maybeSingle<TenantConnection>(),
  ]);
  if (!c) notFound();
  const s = m?.status ?? "not_connected";
  const canManage = ["owner", "admin", "staff"].includes(ctx.role ?? "");

  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]"><Link href="/client/connections">Connections</Link> / <b className="font-medium text-[var(--ink)]">{c.name}</b></p>
      <div className="mt-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${CONN_LABEL[s][1]}`}>{CONN_LABEL[s][0]}</span><span className="text-[12px] text-[var(--muted)]">{c.category} · {m?.managed_by === "loveleeday" ? "Managed by LOVELEEDAY" : METHOD_LABEL[c.method]}</span></div>
      <h1 className="ll-title !mt-3 !text-[42px] max-md:!text-[32px]">{c.name}</h1>
      <Muted className="max-w-[62ch]">{c.uses}</Muted>

      <div className="mt-10 grid items-start gap-7 md:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          <Eyebrow>What we can see</Eyebrow><p className="mt-2 text-[15px] text-[#303238]">{c.read_scope}</p>
          <div className="mt-6"><Eyebrow>What we can change</Eyebrow><p className="mt-2 text-[15px] text-[#303238]">{c.write_scope ? `${c.write_scope}, only after you approve it as a decision.` : "Nothing. This connection is read-only."}</p></div>
          <div className="mt-6"><Eyebrow>What we will never do</Eyebrow><p className="mt-2 text-[15px] text-[#303238]">{c.never}</p></div>
          {(m?.proof || m?.error || m?.note) && (
            <div className="mt-6 rounded-xl bg-[#f5f5f7] p-4">
              <Eyebrow>{m?.error ? "What needs attention" : "How we know it works"}</Eyebrow>
              <p className={`mt-1 text-[14px] ${m?.error ? "text-[#a1291f]" : "text-[#1e6b3a]"}`}>{m?.error || m?.proof || m?.note}</p>
              {m?.last_probe_at && <p className="mt-1 text-[12px] text-[var(--muted)]">Checked {formatDate(m.last_probe_at)}</p>}
            </div>
          )}
        </Card>
        <Card className="p-6">
          {canManage ? (
            <ConnectPanel connector={{ key: c.key, name: c.name, method: c.method, invite_steps: c.invite_steps, key_fields: c.key_fields, key_help: c.key_help, oneclick_ready: c.oneclick_ready }} status={s} managedBy={m?.managed_by ?? "client"} />
          ) : (
            <><Eyebrow>Connection</Eyebrow><p className="mt-2 text-[14.5px] text-[#303238]">Ask an owner or admin on your account to manage this connection.</p></>
          )}
        </Card>
      </div>
    </div>
  );
}
