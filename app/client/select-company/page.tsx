import { redirect } from "next/navigation";
import { requireStrongSession } from "@/lib/client-portal/session";
import { listCandidates } from "@/lib/client-portal/active-tenant";
import { AuthShell } from "@/components/client-portal/AuthShell";

export const dynamic = "force-dynamic";

// A person who belongs to more than one company picks which one the portal acts on. The choice is stored as the
// lv_active_tenant cookie by /api/client/active-tenant after it is validated against their memberships.
export default async function SelectCompanyPage() {
  const { supabase, user } = await requireStrongSession();
  const candidates = await listCandidates(supabase, user.id);
  if (candidates.length === 0) redirect("/client/no-access");
  const { data } = await supabase.from("tenants").select("id, name").in("id", candidates.map((c) => c.tenantId));
  const names = new Map(((data as { id: string; name: string }[] | null) || []).map((t) => [t.id, t.name]));
  const options = candidates
    .map((c) => ({ ...c, name: names.get(c.tenantId) || "Company" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const roleName = (o: (typeof options)[number]) => (o.source === "grant" ? "LOVELEEDAY staff access" : o.role.charAt(0).toUpperCase() + o.role.slice(1));

  return (
    <AuthShell
      eyebrow={user.email ? `Signed in as ${user.email}` : "Client portal"}
      headline="Choose an organization"
      lead="Your account has access to more than one. You can switch at any time from the menu."
      rail={{ kicker: "Your organizations", line: "Each organization keeps its own work, people and records." }}
    >
      <div className="stack">
        {options.map((o) => (
          <form key={o.tenantId} method="post" action="/api/client/active-tenant">
            <input type="hidden" name="tenant" value={o.tenantId} />
            <button type="submit" className="wsrow">
              <span className="org">
                <span className="av" aria-hidden>{initials(o.name)}</span>
                <span>
                  <b>{o.name}</b>
                  <small>Your role: {roleName(o)}</small>
                </span>
              </span>
              <span className="chev" aria-hidden>›</span>
            </button>
          </form>
        ))}
      </div>
    </AuthShell>
  );
}
