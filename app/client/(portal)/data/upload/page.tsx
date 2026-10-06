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
        title="Bring in"
        muted="a file."
        lead="Use a spreadsheet to help answer a question when a direct connection is unavailable. Check the preview before adding anything. Nothing is added until you confirm."
      />
      <p className="ll-feedback warn mb-6 max-w-[70ch]">
        Do not upload student records, patient records or other regulated personal data here until your data agreement covers them and your LOVELEEDAY contact has confirmed the access rules. Summary and aggregate files are fine.
      </p>
      <UploadView history={h.data ?? []} historyError={h.error?.message} canUpload={ctx.role !== "viewer"} />
    </div>
  );
}
