import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { UploadView, type UploadHistoryRow } from "@/components/client-portal/connectors/UploadView";
import { PageHead } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const h = await supabase.from("upload_mappings").select("id, target_object, row_count, status, created_at").eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(20).returns<UploadHistoryRow[]>();
  return (
    <div>
      <PageHead
        eyebrow={`${ctx.tenantName} · Data`}
        title="Upload and map"
        muted="a file."
        lead="For systems without a connector, or one-off exports. Map the columns, check a preview, then import. Nothing is imported until you confirm."
      />
      <UploadView history={h.data ?? []} historyError={h.error?.message} canUpload={ctx.role !== "viewer"} />
    </div>
  );
}
