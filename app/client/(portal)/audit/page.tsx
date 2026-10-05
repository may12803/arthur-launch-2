import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { AuditView, PAGE_SIZE, type AuditRow } from "@/components/client-portal/connectors/AuditView";
import { ErrorBanner, Notice, PageHead, SettingsLayout } from "@/components/client-portal/cp";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireClientPortal();
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";
  const filters = {
    prefix: /^[a-z_]{2,20}$/.test(sp.action ?? "") ? (sp.action as string) : "",
    actor: /^[0-9a-f-]{36}$/i.test(sp.actor ?? "") ? (sp.actor as string) : "",
    from: DATE.test(sp.from ?? "") ? (sp.from as string) : "",
    to: DATE.test(sp.to ?? "") ? (sp.to as string) : "",
  };
  const after = /^\d{1,15}$/.test(sp.after ?? "") ? Number(sp.after) : null;

  let rows: AuditRow[] = [];
  let nextAfter: number | null = null;
  let total: number | null = null;
  const errors: (string | null)[] = [];
  let people: { id: string; email: string }[] = [];

  if (isAdmin) {
    const supabase = await getLoveleedayServer();
    let q = supabase.from("audit_log").select("id, actor, action, target, meta, at", { count: "exact" }).eq("tenant_id", ctx.tenantId).order("id", { ascending: false }).limit(PAGE_SIZE + 1);
    if (filters.prefix) q = q.like("action", `${filters.prefix}.%`);
    if (filters.actor) q = q.eq("actor", filters.actor);
    if (filters.from) q = q.gte("at", `${filters.from}T00:00:00Z`);
    if (filters.to) q = q.lt("at", new Date(Date.parse(`${filters.to}T00:00:00Z`) + 864e5).toISOString());
    if (after != null) q = q.lt("id", after);
    const [r, team] = await Promise.all([q.returns<AuditRow[]>(), supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId })]);
    if (r.error) errors.push(`Audit trail: ${r.error.message}`);
    const all = r.data ?? [];
    rows = all.slice(0, PAGE_SIZE);
    nextAfter = all.length > PAGE_SIZE ? rows[rows.length - 1].id : null;
    total = after == null ? r.count ?? null : null;
    if (team.error) errors.push(`Team names: ${team.error.message}`);
    people = ((team.data ?? []) as { user_id: string; email: string | null }[]).filter((m) => m.email).map((m) => ({ id: m.user_id, email: m.email as string }));
  }
  const emails = Object.fromEntries(people.map((p) => [p.id, p.email]));

  return (
    <div>
      <PageHead eyebrow={`${ctx.tenantName} · Settings`} title="Audit trail" lead="Who did what, written by the system as it happens. Page back as far as you need, or export the full range for your own records." />
      <SettingsLayout active="/client/audit" isAdmin={isAdmin}>
        {isAdmin ? (
          <>
            <ErrorBanner errors={errors} />
            <AuditView rows={rows} filters={filters} nextAfter={nextAfter} hasPrev={after != null} people={people} emails={emails} total={total} />
          </>
        ) : (
          <Notice tone="info"><div>The audit trail is visible to owners and admins. Ask one of them if you need something from it.</div></Notice>
        )}
      </SettingsLayout>
    </div>
  );
}
