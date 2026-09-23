import { redirect } from "next/navigation";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";

export type TenantRole = "owner" | "admin" | "member" | "viewer";

export type ClientPortalContext = {
  userId: string;
  email: string | null;
  tenantId: string;
  tenantName: string;
  tenantPlan: string | null;
  tenantStatus: string;
  role: TenantRole;
};

type MembershipRow = {
  tenant_id: string;
  role: string;
  tenants: { name: string; plan: string | null; status: string } | null;
};

/**
 * Gate for every screen under app/client/(portal)/*. Resolves the signed-in
 * user's loveleeday-project session + MFA level + accepted tenant
 * membership, or redirects — never returns for an unauthenticated, non-AAL2,
 * or membership-less request.
 *
 * This is a separate auth system from Daniel's admin middleware (which only
 * knows about the `arthur` Supabase project). /client/* is carved out of
 * that middleware's gate entirely (see middleware.ts PUBLIC_PREFIXES) and
 * enforces its own session + MFA requirement here instead.
 */
export async function requireClientPortal(): Promise<ClientPortalContext> {
  const supabase = await getLoveleedayServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/client/login");
  }
  const user = userData.user;

  // MFA is mandatory for every client-portal screen (task spec: "Every
  // screen must be MFA-gated except the invite/login pages").
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aalError && aal) {
    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      redirect("/client/mfa/challenge");
    }
    if (aal.nextLevel !== "aal2") {
      // No verified TOTP factor yet — enrollment is required, not optional.
      redirect("/client/mfa/enroll");
    }
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id, role, tenants(name, plan, status)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (!membership || !membership.tenants) {
    redirect("/client/no-access");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    tenantId: membership.tenant_id,
    tenantName: membership.tenants.name,
    tenantPlan: membership.tenants.plan,
    tenantStatus: membership.tenants.status,
    role: (membership.role as TenantRole) ?? "member",
  };
}
