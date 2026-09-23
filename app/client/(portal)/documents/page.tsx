import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted, EmptyState } from "@/components/client-portal/ui";
import { DocumentUpload, DeleteDocumentButton } from "@/components/client-portal/DocumentUpload";
import { ShareControls, SharingSwitch, type ShareRow } from "@/components/client-portal/ShareControls";
import { formatDate } from "@/lib/client-portal/format";

export const dynamic = "force-dynamic";

type Doc = { id: string; name: string; size_bytes: number; created_by: string | null; by_staff: boolean; created_at: string };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DocumentsPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const canUpload = ctx.role !== "viewer";
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";

  const [{ data: docs, error }, team, { data: tenant }, { data: shares }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, name, size_bytes, created_by, by_staff, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .returns<Doc[]>(),
    supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId }),
    supabase.from("tenants").select("external_sharing, data_class").eq("id", ctx.tenantId)
      .maybeSingle<{ external_sharing: boolean; data_class: string }>(),
    supabase.from("document_shares").select("id, document_id, recipient_email, expires_at, open_count, revoked_at")
      .eq("tenant_id", ctx.tenantId).is("revoked_at", null)
      .returns<(ShareRow & { document_id: string })[]>(),
  ]);
  const emails = new Map<string, string>(
    ((team.data as { user_id: string; email: string }[] | null) || []).map((m) => [m.user_id, m.email])
  );
  const sharingOn = !!tenant?.external_sharing;
  const regulated = tenant?.data_class === "regulated";
  const canShare = sharingOn && ctx.role !== "viewer";

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Documents</PageTitle>
      <Muted className="mb-8 max-w-[62ch]">
        Files shared between your team and LOVELEEDAY. Every file is encrypted with your company&apos;s own key, opens only
        for signed-in members, and every upload and download is recorded.
      </Muted>

      {canUpload && (
        <Card className="p-6 mb-6">
          <DocumentUpload />
        </Card>
      )}

      {isAdmin && (
        <Card className="p-6 mb-6">
          <SharingSwitch enabled={sharingOn} regulated={regulated} />
        </Card>
      )}

      {error ? (
        <Card className="p-5">
          <p className="ll-feedback warn">Couldn&apos;t load documents. Refresh to try again.</p>
        </Card>
      ) : !docs || docs.length === 0 ? (
        <EmptyState title="No documents yet" body="Files you or LOVELEEDAY upload will appear here." />
      ) : (
        <Card className="px-6 py-2">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 border-b border-line-separator last:border-0">
              <div className="min-w-0">
                <div className="text-[15px] text-text-active truncate">{d.name}</div>
                <div className="text-[12.5px] text-text-muted mt-1">
                  {formatSize(d.size_bytes)} · {d.by_staff || !d.created_by ? "LOVELEEDAY" : emails.get(d.created_by) || "Former member"} · {formatDate(d.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-5 flex-shrink-0">
                <a className="ll-text-link" href={`/api/client/documents/${d.id}`}>
                  Download
                </a>
                {isAdmin && <DeleteDocumentButton id={d.id} name={d.name} />}
              </div>
              {canShare && (
                <ShareControls
                  documentId={d.id}
                  maxDays={regulated ? 7 : 30}
                  shares={(shares || []).filter((s) => s.document_id === d.id)}
                />
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
