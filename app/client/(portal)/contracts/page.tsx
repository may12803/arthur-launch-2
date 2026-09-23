import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { getDocument } from "@/lib/signwell";
import { Card, Eyebrow, PageTitle, Muted, StatusBadge, EmptyState } from "@/components/client-portal/ui";

export const dynamic = "force-dynamic";

type ContractRow = {
  id: string;
  title: string;
  status: string;
  signwell_document_id: string | null;
  signed_url: string | null;
  created_at: string;
};

type ContractView = ContractRow & { signingUrl: string | null };

// Best effort — SignWell may be unreachable, unconfigured (no
// SIGNWELL_API_KEY yet), or the document may already be signed (no live
// signing link needed). Any of those degrade to no link, never an error on
// the page.
async function resolveSigningUrl(row: ContractRow): Promise<string | null> {
  if (row.status === "signed" || !row.signwell_document_id) return null;
  try {
    const doc = await getDocument(row.signwell_document_id);
    return doc.recipients.find((r) => r.signing_url)?.signing_url ?? null;
  } catch {
    return null;
  }
}

export default async function ContractsPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();

  // `contracts` is a proposed table (see the task report SQL — not applied
  // yet). Select defensively so this page renders the empty state instead
  // of erroring until the migration lands.
  const { data, error } = await supabase
    .from("contracts")
    .select("id, title, status, signwell_document_id, signed_url, created_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .returns<ContractRow[]>();

  const rows = error ? [] : data || [];
  const contracts: ContractView[] = await Promise.all(
    rows.map(async (row) => ({ ...row, signingUrl: await resolveSigningUrl(row) })),
  );

  return (
    <div>
      <Eyebrow>Legal</Eyebrow>
      <PageTitle>Contracts</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">Sign and manage your agreements with LOVELEEDAY.</Muted>

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          body="LOVELEEDAY hasn't sent a contract to this account yet. Check back once one is on its way."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {contracts.map((c) => (
            <Card key={c.id} className="p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-serif text-[17px] text-text-active truncate">{c.title}</div>
                <div className="text-[12.5px] text-text-muted mt-1">
                  {new Date(c.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <StatusBadge status={c.status} />
                {c.status === "signed" && c.signed_url && (
                  <a
                    href={c.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-accent-orange whitespace-nowrap"
                  >
                    View signed copy
                  </a>
                )}
                {c.status !== "signed" && c.signingUrl && (
                  <a
                    href={c.signingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-accent-orange whitespace-nowrap"
                  >
                    Review &amp; sign
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
