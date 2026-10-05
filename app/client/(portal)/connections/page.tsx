import Link from "next/link";
import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import type { Connector } from "@/lib/client-portal/connections";
import { buildCatalog, connState, oauthEndpoints, type ConnRow } from "@/lib/client-portal/connector-ui";
import { CatalogView } from "@/components/client-portal/connectors/CatalogView";
import { ErrorBanner, PageHead } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [legacy, mine] = await Promise.all([
    supabase.from("connectors").select("*").order("sort").returns<Connector[]>(),
    supabase.from("tenant_connections").select("*").eq("tenant_id", ctx.tenantId).returns<ConnRow[]>(),
  ]);
  const entries = buildCatalog(legacy.data ?? []);
  // A sign-in connector is only offered once its vendor app credentials are configured on this server; otherwise the
  // card would promise a connection we cannot complete.
  const notReady = entries.filter((e) => e.methods.includes("Sign in") && !oauthEndpoints(e.key)).map((e) => e.key);
  const conns = mine.data ?? [];
  const now = Date.now();
  const live = conns.filter((c) => connState(c, now).id === "live").length;
  const canManage = ["owner", "admin", "staff"].includes(ctx.role);

  return (
    <div>
      <PageHead
        eyebrow={`${ctx.tenantName} · Connections`}
        title="Connect the systems"
        muted="you already run."
        lead={`Each connector shows exactly what it reads before you authorize it. Nothing is written back to your systems without an approval. ${live} of ${conns.length} connected ${conns.length === 1 ? "system is" : "systems are"} live and moving data.`}
        actions={
          <>
            <Link href="/client/data/health" className="ll-secondary">Data health</Link>
            <Link href="/client/data/upload" className="ll-primary">Upload a file</Link>
          </>
        }
      />
      <ErrorBanner label="Connection data did not load" errors={[legacy.error && `Connector list: ${legacy.error.message}`, mine.error && `Your connections: ${mine.error.message}`]} />
      <CatalogView entries={entries} conns={conns} now={now} canManage={canManage} notReady={notReady} />
    </div>
  );
}
