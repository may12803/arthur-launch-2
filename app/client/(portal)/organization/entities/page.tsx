import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { EntitiesView, type EntityRow } from "@/components/client-portal/connectors/EntitiesView";
import { ErrorBanner, PageHead, SettingsLayout } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const r = await supabase.from("entities").select("id, parent_id, kind, name, code").eq("tenant_id", ctx.tenantId).order("name").returns<EntityRow[]>();
  const admin = ctx.role === "owner" || ctx.role === "admin";
  return (
    <div>
      <PageHead eyebrow={`${ctx.tenantName} · Settings`} title="Entities and locations" lead="Model how your organization is actually shaped, from legal entities down to stores, properties, plants or departments. Access and reporting can follow it." />
      <SettingsLayout active="/client/organization/entities" isAdmin={admin}>
        <ErrorBanner label="The structure did not load" errors={[r.error && r.error.message]} />
        <EntitiesView entities={r.data ?? []} canEdit={admin} />
      </SettingsLayout>
    </div>
  );
}
