import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted, StatusBadge } from "@/components/client-portal/ui";
import { InviteForm } from "@/components/client-portal/InviteForm";

export const dynamic = "force-dynamic";

type TeamMember = {
  user_id: string;
  email: string | null;
  role: string;
  accepted: boolean;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
};

export default async function TeamPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";

  // `list_tenant_team(p_tenant uuid)` is a SECURITY DEFINER RPC granted to
  // authenticated — it joins memberships -> auth.users so this page can show
  // real emails instead of truncated user ids. Fall back to the raw
  // membership rows (no email) only if the RPC call itself fails.
  let members: TeamMember[] = [];
  let emailLookupUnavailable = false;
  const rpcResult = await supabase.rpc("list_tenant_team", { p_tenant: ctx.tenantId });
  if (!rpcResult.error && rpcResult.data) {
    members = rpcResult.data as TeamMember[];
  } else {
    emailLookupUnavailable = true;
    const { data } = await supabase
      .from("memberships")
      .select("user_id, role, accepted_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true });
    members = (data || []).map((m) => ({ user_id: m.user_id, role: m.role, email: null, accepted: !!m.accepted_at }));
  }

  let invites: InviteRow[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("invites")
      .select("id, email, role, expires_at, created_at")
      .eq("tenant_id", ctx.tenantId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .returns<InviteRow[]>();
    invites = data || [];
  }

  return (
    <div>
      <Eyebrow>{ctx.tenantName}</Eyebrow>
      <PageTitle>Team</PageTitle>
      <Muted className="mb-8 max-w-[60ch]">
        {isAdmin
          ? "Everyone with access to this account, and anyone you've invited who hasn't joined yet."
          : "Everyone with access to this account. Ask an owner or admin to invite a teammate."}
      </Muted>

      <Card className="p-6 mb-6">
        <h2 className="font-serif text-h3 text-text-active mb-4">Members</h2>
        {emailLookupUnavailable && (
          <p className="text-small text-text-muted mb-3">
            Couldn&apos;t look up member emails right now — showing user IDs instead.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between py-3 border-b border-line-separator last:border-0"
            >
              <div className="min-w-0">
                <div className="text-[14px] text-text-active font-medium truncate">
                  {m.email || `User ${m.user_id.slice(0, 8)}`}
                  {m.user_id === ctx.userId && <span className="text-text-muted font-normal"> (you)</span>}
                </div>
                <div className="text-[12.5px] text-text-muted">{m.accepted ? "Active" : "Invitation pending"}</div>
              </div>
              <StatusBadge status={m.role} />
            </div>
          ))}
        </div>
      </Card>

      {isAdmin && invites.length > 0 && (
        <Card className="p-6 mb-6">
          <h2 className="font-serif text-h3 text-text-active mb-4">Pending invites</h2>
          <div className="flex flex-col gap-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between py-3 border-b border-line-separator last:border-0"
              >
                <div>
                  <div className="text-[14px] text-text-active font-medium">{inv.email}</div>
                  <div className="text-[12.5px] text-text-muted">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={inv.role} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {isAdmin && <InviteForm />}
    </div>
  );
}
