import Link from "next/link";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { requireClientPortal } from "@/lib/client-portal/session";
import { Card, Eyebrow, PageTitle, Muted, StatusBadge, EmptyState, LoadError } from "@/components/client-portal/ui";
import { LocalDate } from "@/components/client-portal/LocalTime";
import { GettingStarted } from "@/components/client-portal/GettingStarted";

export const dynamic = "force-dynamic";

type DeliverableRow = {
  id: string;
  kind: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
};

const KIND_LABEL: Record<string, string> = {
  study: "Study",
  portfolio: "Portfolio",
  compliance: "Compliance",
  other: "Deliverable",
};

export default async function ClientDashboardPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();

  const { data: deliverables, error } = await supabase
    .from("deliverables")
    .select("id, kind, title, slug, status, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .order("updated_at", { ascending: false })
    .returns<DeliverableRow[]>();

  // Getting-started counts. A failed count reads as zero, which only keeps a step open; it never hides one.
  const head = { count: "exact" as const, head: true };
  const [conns, ups, docs, team, decided] = await Promise.all([
    supabase.from("tenant_connections").select("id", head).eq("tenant_id", ctx.tenantId).not("status", "in", "(not_connected,disconnected)"),
    supabase.from("upload_mappings").select("id", head).eq("tenant_id", ctx.tenantId),
    supabase.from("documents").select("id", head).eq("tenant_id", ctx.tenantId),
    supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId }),
    supabase.from("approvals").select("id", head).eq("tenant_id", ctx.tenantId).not("decided_at", "is", null),
  ]);
  const counts = { connections: conns.count ?? 0, uploads: ups.count ?? 0, documents: docs.count ?? 0, teammates: Array.isArray(team.data) ? team.data.length : 0, approvals: decided.count ?? 0 };

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Home</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        Your systems, your documents and the work LOVELEEDAY has prepared for {ctx.tenantName}, in one place.
      </Muted>

      <GettingStarted counts={counts} role={ctx.role} />

      <h2 className="font-serif text-h3 text-text-active mb-4">Deliverables</h2>
      {error && (
        <LoadError what="deliverables" />
      )}

      {!error && (!deliverables || deliverables.length === 0) && (
        <EmptyState
          title="No deliverables yet"
          body="Studies, audits and compliance documents LOVELEEDAY prepares for you appear here. Connecting a system or sharing documents above is what gets the first one started."
        />
      )}

      {deliverables && deliverables.length > 0 && (
        <div className="flex flex-col gap-3">
          {deliverables.map((d) => (
            <Link key={d.id} href={`/client/deliverables/${d.slug}`}>
              <Card className="p-5 flex items-center justify-between gap-4 hover:border-accent-orange transition-colors">
                <div className="min-w-0">
                  <div className="ll-eyebrow mb-1.5">
                    {KIND_LABEL[d.kind] || d.kind}
                  </div>
                  <div className="font-serif text-[17px] text-text-active truncate">{d.title}</div>
                  <div className="text-[12.5px] text-text-muted mt-1">
                    Updated <LocalDate iso={d.updated_at} />
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
