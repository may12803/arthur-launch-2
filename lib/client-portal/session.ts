import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { clientMfaVerdict } from "./mfa-gate";
import { isSsoSession, tenantSessionAllowed } from "./sso";
import { ACTIVE_TENANT_COOKIE, resolveActiveTenant } from "./active-tenant";

export type TenantRole = "owner" | "admin" | "member" | "viewer" | "staff";
export type ClientPortalContext = {
  userId: string;
  email: string | null;
  tenantId: string;
  tenantName: string;
  tenantPlan: string | null;
  tenantStatus: string;
  role: TenantRole;
  canSwitch: boolean;
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

  // One resolver for screens and API routes: the active company is the explicit lv_active_tenant selection,
  // validated against this user's memberships/grants, never "the first membership".
  const requested = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value || null;
  const r = await resolveActiveTenant(supabase, user.id, requested);
  if (!r.ok) {
    if (r.reason === "ambiguous" || r.reason === "not_member") redirect("/client/select-company");
    // LOVELEEDAY staff without a live, logged grant land on the staff console.
    const { data: staff } = await supabase.rpc("is_staff");
    redirect(staff ? "/client/staff" : "/client/no-access");
  }

  if (!await tenantSessionAllowed(supabase, r.tenantId)) redirect("/client/login?error=Your%20company%20signs%20in%20with%20single%20sign-on.");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, plan, status")
    .eq("id", r.tenantId)
    .maybeSingle<{ name: string; plan: string | null; status: string }>();
  if (!tenant) redirect("/client/no-access");

  return {
    userId: user.id,
    email: user.email ?? null,
    tenantId: r.tenantId,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    tenantStatus: tenant.status,
    role: (r.role as TenantRole) ?? "member",
    canSwitch: r.candidates.length > 1,
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
  const verdict = clientMfaVerdict(aal, aalError, isSsoSession(aal?.currentAuthenticationMethods));
  if (verdict === "challenge") redirect("/client/mfa/challenge");
  // No verified TOTP factor yet: enrollment is required, not optional.
  if (verdict === "enroll") redirect("/client/mfa/enroll");
  // Assurance could not be established (auth error or no answer): fail closed, back to sign-in.
  if (verdict === "unavailable") redirect("/client/login?error=mfa_unavailable");
  return { supabase, user: userData.user };
}
