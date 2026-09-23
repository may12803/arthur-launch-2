import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted, EmptyState } from "@/components/client-portal/ui";

export const dynamic = "force-dynamic";

type Entry = { id: number; actor: string | null; action: string; meta: Record<string, unknown> | null; at: string };

const VERBS: Record<string, string> = {
  "document.uploaded": "Uploaded",
  "document.downloaded": "Downloaded",
  "document.deleted": "Deleted",
  "invite.accepted": "Joined the account",
  "tenant.created": "Account created",
};

function when(at: string): string {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Owners and admins see every recorded action on their company's documents
// and account. The database only returns rows for this company, and only to a
// two-factor session (audit_log_select_members + require_mfa_aal2).
export default async function AccessHistoryPage() {
  const ctx = await requireClientPortal();
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";

  if (!isAdmin) {
    return (
      <div>
        <Eyebrow>{ctx.tenantName}</Eyebrow>
        <PageTitle>Access history</PageTitle>
        <EmptyState title="For account owners and admins" body="Ask an owner or admin on your team if you need to see who opened a document." />
      </div>
    );
  }

  const supabase = await getLoveleedayServer();
  const [{ data: rows }, team] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, actor, action, meta, at")
      .eq("tenant_id", ctx.tenantId)
      .order("at", { ascending: false })
      .limit(200)
      .returns<Entry[]>(),
    supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId }),
  ]);
  const emails = new Map<string, string>(
    ((team.data as { user_id: string; email: string }[] | null) || []).map((m) => [m.user_id, m.email])
  );

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Access history</PageTitle>
      <Muted className="mb-8 max-w-[62ch]">
        Every upload, download and deletion of your documents, and every change to who can sign in, recorded as it
        happens. Entries cannot be edited or removed from here.
      </Muted>

      {!rows || rows.length === 0 ? (
        <EmptyState title="Nothing recorded yet" body="Activity on your documents and account will appear here." />
      ) : (
        <Card className="px-6 py-2 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="ll-label">
                <th className="py-3 pr-4 font-normal">When</th>
                <th className="py-3 pr-4 font-normal">Who</th>
                <th className="py-3 pr-4 font-normal">What</th>
                <th className="py-3 font-normal">From</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = typeof r.meta?.name === "string" ? r.meta.name : null;
                const ip = typeof r.meta?.ip === "string" ? r.meta.ip : null;
                return (
                  <tr key={r.id} className="border-t border-line-separator text-[13.5px]">
                    <td className="py-3 pr-4 whitespace-nowrap text-text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{when(r.at)}</td>
                    <td className="py-3 pr-4 text-text-active">{r.actor ? emails.get(r.actor) || "Former member" : "LOVELEEDAY"}</td>
                    <td className="py-3 pr-4 text-text-active">
                      {VERBS[r.action] || r.action}
                      {name && <span className="text-text-muted"> · {name}</span>}
                    </td>
                    <td className="py-3 text-text-muted font-mono text-[12px]">{ip || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
