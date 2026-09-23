import Link from "next/link";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { requireClientPortal } from "@/lib/client-portal/session";
import { Card, Eyebrow, PageTitle, Muted, StatusBadge, EmptyState } from "@/components/client-portal/ui";

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
    .order("updated_at", { ascending: false })
    .returns<DeliverableRow[]>();

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Deliverables</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        Everything LOVELEEDAY has prepared for {ctx.tenantName} — studies, portfolios, and
        compliance documents — lives here.
      </Muted>

      {error && (
        <Card className="p-5 mb-6 border-red-200">
          <p className="text-small text-red-700">Couldn&apos;t load deliverables: {error.message}</p>
        </Card>
      )}

      {!error && (!deliverables || deliverables.length === 0) && (
        <EmptyState
          title="Nothing here yet"
          body="LOVELEEDAY hasn't published a deliverable to this account yet. Check back soon, or reach out to your contact if you were expecting something."
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
                    Updated {new Date(d.updated_at).toLocaleDateString()}
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
