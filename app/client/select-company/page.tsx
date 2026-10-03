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

  return (
    <AuthShell eyebrow="Client portal" headline="Choose your" muted="company." lead="Your account belongs to more than one company. Everything you see and do in the portal applies to the one you choose here.">
      <div className="flex flex-col gap-3">
        {options.map((o) => (
          <form key={o.tenantId} method="post" action="/api/client/active-tenant">
            <input type="hidden" name="tenant" value={o.tenantId} />
            <button type="submit" className="ll-nav-cta w-full text-left">
              {o.name}
              <span className="ml-2 text-[12px] opacity-70">{o.source === "grant" ? "staff access" : o.role}</span>
            </button>
          </form>
        ))}
      </div>
    </AuthShell>
  );
}
