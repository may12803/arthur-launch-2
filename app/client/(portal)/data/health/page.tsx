import Link from "next/link";
import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import type { Connector } from "@/lib/client-portal/connections";
import { buildCatalog, type ConnRow } from "@/lib/client-portal/connector-ui";
import { HealthView } from "@/components/client-portal/connectors/HealthView";
import { ErrorBanner, PageHead } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function DataHealthPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [legacy, mine] = await Promise.all([
    supabase.from("connectors").select("*").order("sort").returns<Connector[]>(),
    supabase.from("tenant_connections").select("*").eq("tenant_id", ctx.tenantId).returns<ConnRow[]>(),
  ]);
  return (
    <div>
      <PageHead
        eyebrow={`${ctx.tenantName} · Data health`}
        title="Is your data"
        muted="current and complete?"
        lead="See whether the information behind your answers is current. Open a connection to find what is late or failing and what needs attention."
        actions={<><Link href="/client/connections" className="ll-secondary">Connectors</Link><Link href="/client/data/upload" className="ll-primary">Upload a file</Link></>}
      />
      <ErrorBanner label="Health data did not load" errors={[legacy.error && `Connector list: ${legacy.error.message}`, mine.error && `Connections: ${mine.error.message}`]} />
      <HealthView entries={buildCatalog(legacy.data ?? [])} conns={mine.data ?? []} now={Date.now()} />
    </div>
  );
}
