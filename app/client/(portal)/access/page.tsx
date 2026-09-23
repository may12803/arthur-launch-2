import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted, EmptyState } from "@/components/client-portal/ui";
import { LocalTime } from "@/components/client-portal/LocalTime";
import { StaffGrantEnd } from "@/components/client-portal/StaffGrantEnd";

export const dynamic = "force-dynamic";

type Entry = { id: number; actor: string | null; action: string; meta: Record<string, unknown> | null; at: string };

const VERBS: Record<string, string> = {
  "document.uploaded": "Uploaded",
  "document.downloaded": "Downloaded",
  "document.deleted": "Deleted",
  "invite.accepted": "Joined the account",
  "tenant.created": "Account created",
  "share.created": "Shared outside the company",
  "share.opened": "Opened a shared link",
  "share.revoked": "Revoked a shared link",
  "sharing.enabled": "Turned outside sharing on",
  "sharing.disabled": "Turned outside sharing off",
  "staff.access_opened": "Opened staff access",
  "staff.access_closed": "Ended staff access",
  "tenant.data_class_set": "Set data classification",
};

// Who did it, in words the client recognises: a team member's email, a
// LOVELEEDAY staff member (named), or an outside recipient of a shared link.
function who(r: Entry, emails: Map<string, string>): string {
  const staff = typeof r.meta?.staff_email === "string" ? r.meta.staff_email : null;
  if (r.action === "share.opened" && typeof r.meta?.recipient === "string") return `${r.meta.recipient} (outside)`;
  if (staff) return `LOVELEEDAY · ${staff}`;
  if (!r.actor) return "LOVELEEDAY";
  return emails.get(r.actor) || "LOVELEEDAY or a former member";
}

function detail(r: Entry): string | null {
  const m = r.meta || {};
  if (typeof m.name === "string") return m.name + (typeof m.recipient === "string" && r.action === "share.created" ? ` → ${m.recipient}` : "");
  if (typeof m.reason === "string") return `${m.reason}${typeof m.hours === "number" ? ` (${m.hours}h)` : ""}`;
  if (typeof m.recipient === "string") return m.recipient;
  if (typeof m.class === "string") return m.class;
  return null;
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
  const [{ data: rows }, team, { data: grants }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, actor, action, meta, at")
      .eq("tenant_id", ctx.tenantId)
      .order("at", { ascending: false })
      .limit(200)
      .returns<Entry[]>(),
    supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId }),
    supabase.from("staff_grants").select("id, staff_email, reason, expires_at")
      .eq("tenant_id", ctx.tenantId).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .returns<{ id: string; staff_email: string; reason: string; expires_at: string }[]>(),
  ]);
  const emails = new Map<string, string>(
    ((team.data as { user_id: string; email: string }[] | null) || []).map((m) => [m.user_id, m.email])
  );

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Access history</PageTitle>
      <Muted className="mb-8 max-w-[62ch]">
        Every upload, download, share and deletion of your documents, every time LOVELEEDAY staff open access, and every
        change to who can sign in, recorded as it happens. Entries cannot be edited or removed from here.
      </Muted>

      {grants && grants.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="ll-eyebrow mb-3">LOVELEEDAY staff access, open now</div>
          {grants.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-[13.5px]">
              <span className="text-text-active">{g.staff_email} · <span className="text-text-muted">{g.reason}</span></span>
              <span className="text-text-muted">until <LocalTime iso={g.expires_at} /> <span className="ml-3"><StaffGrantEnd grantId={g.id} /></span></span>
            </div>
          ))}
        </Card>
      )}

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
                const name = detail(r);
                const ip = typeof r.meta?.ip === "string" ? r.meta.ip : null;
                return (
                  <tr key={r.id} className="border-t border-line-separator text-[13.5px]">
                    <td className="py-3 pr-4 whitespace-nowrap text-text-muted" style={{ fontVariantNumeric: "tabular-nums" }}><LocalTime iso={r.at} /></td>
                    <td className="py-3 pr-4 text-text-active">{who(r, emails)}</td>
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
