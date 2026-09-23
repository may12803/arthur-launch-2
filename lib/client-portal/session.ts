import { redirect } from "next/navigation";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { isSsoSession } from "./sso";

export type TenantRole = "owner" | "admin" | "member" | "viewer" | "staff";
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
  const { supabase, user } = await requireStrongSession();

  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id, role, tenants(name, plan, status)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (!membership || !membership.tenants) {
    // LOVELEEDAY staff enter a client's account only through a live, logged
    // grant (opened on /client/staff); without one they land on that console.
    const { data: grant } = await supabase
      .from("staff_grants")
      .select("tenant_id, tenants(name, plan, status)")
      .eq("staff_user_id", user.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle<MembershipRow>();
    if (grant?.tenants) {
      return {
        userId: user.id, email: user.email ?? null, tenantId: grant.tenant_id, tenantName: grant.tenants.name,
        tenantPlan: grant.tenants.plan, tenantStatus: grant.tenants.status, role: "staff",
      };
    }
    const { data: staff } = await supabase.rpc("is_staff");
    redirect(staff ? "/client/staff" : "/client/no-access");
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

/**
 * Signed in, and past the second factor (TOTP, or a SAML SSO session whose
 * identity provider owns it). Redirects otherwise; never returns weak.
 */
export async function requireStrongSession() {
  const supabase = await getLoveleedayServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/client/login");
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aalError && aal && !isSsoSession(aal.currentAuthenticationMethods)) {
    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/client/mfa/challenge");
    // No verified TOTP factor yet: enrollment is required, not optional.
    if (aal.nextLevel !== "aal2") redirect("/client/mfa/enroll");
  }
  return { supabase, user: userData.user };
}
