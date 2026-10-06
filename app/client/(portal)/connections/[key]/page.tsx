import { notFound } from "next/navigation";
import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import type { Connector } from "@/lib/client-portal/connections";
import { buildCatalog, findConnection, type ConnRow, type SyncRun } from "@/lib/client-portal/connector-ui";
import { oauthErrorText } from "@/lib/client-portal/public-errors";
import { DetailView } from "@/components/client-portal/connectors/DetailView";

export const dynamic = "force-dynamic";

export default async function ConnectorPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [legacy, mine] = await Promise.all([
    supabase.from("connectors").select("*").order("sort").returns<Connector[]>(),
    supabase.from("tenant_connections").select("*").eq("tenant_id", ctx.tenantId).returns<ConnRow[]>(),
  ]);
  const entry = buildCatalog(legacy.data ?? []).find((e) => e.key === key || e.legacy?.key === key);
  if (!entry) notFound();
  const row = findConnection(mine.data ?? [], entry);

  let runs: SyncRun[] = [];
  let runsError: string | null = null;
  if (row?.id) {
    const r = await supabase.from("sync_runs").select("*").eq("tenant_id", ctx.tenantId).eq("connection_id", row.id).order("started_at", { ascending: false }).limit(100).returns<SyncRun[]>();
    runs = r.data ?? [];
    if (r.error) console.error(`[connections] sync history: ${r.error.message}`);
    runsError = r.error ? "Sync history could not be loaded." : null;
  }

  const flash = sp.connected ? `${entry.name} is authorized. The first sync runs on schedule, and this page reads Live only after rows have moved.` : null;
  if (legacy.error) console.error(`[connections] connector details: ${legacy.error.message}`);
  if (mine.error) console.error(`[connections] connection state: ${mine.error.message}`);
  const errors = [legacy.error && "Connector details could not be loaded.", mine.error && "Connection state could not be loaded.", runsError, sp.error ? `Sign-in did not complete: ${oauthErrorText(sp.error)}` : null];
  const canManage = ["owner", "admin", "staff"].includes(ctx.role);

  return <DetailView entry={entry} row={row} runs={runs} now={Date.now()} canManage={canManage} flash={flash} errors={errors} />;
}
