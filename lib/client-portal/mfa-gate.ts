// Pure MFA decisions, shared by the client portal session guard and the admin middleware so the fail-closed rule is
// one piece of code with one test. No framework imports: callers turn the verdict into a redirect or a response.

export type AalData = { currentLevel?: string | null; nextLevel?: string | null } | null | undefined;
export type AuthErr = { status?: number; name?: string; message?: string } | null | undefined;

/** Client portal: verdict for a signed-in person. SSO sessions carry their provider's second factor. */
export function clientMfaVerdict(aal: AalData, aalError: AuthErr, isSso: boolean): "ok" | "challenge" | "enroll" | "unavailable" {
  // Assurance could not be established: never treat that as a pass.
  if (aalError || !aal) return "unavailable";
  if (isSso) return "ok";
  if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return "challenge";
  if (aal.nextLevel !== "aal2") return "enroll";
  return "ok";
}

export type AdminMfaInput = {
  requireMfa: boolean;
  configured: boolean;
  hasAuthCookie: boolean;
  user: unknown;
  userError?: AuthErr;
  aal?: AalData;
  aalError?: AuthErr;
  threw?: boolean;
};
export type AdminMfaVerdict = { kind: "pass" } | { kind: "redirect"; to: string } | { kind: "deny" };

const transient = (e: AuthErr) => !!e && ((e.status ?? 0) >= 500 || e.name === "AuthRetryableFetchError" || e.name === "AuthUnknownError");

/**
 * Admin app: verdict for a request that already holds the arthur_session cookie. A session "requires MFA" when
 * ARTHUR_REQUIRE_MFA=1 or when a Supabase auth session is present. For those, any failure to establish assurance
 * (missing config, auth error, exception) denies. Only a request with no Supabase session at all, in a deployment that
 * does not mandate MFA, passes untouched.
 */
export function adminMfaVerdict(i: AdminMfaInput): AdminMfaVerdict {
  const mustCheck = i.requireMfa || i.hasAuthCookie;
  if (!i.configured) return i.requireMfa ? { kind: "deny" } : { kind: "pass" };
  if (i.threw) return mustCheck ? { kind: "deny" } : { kind: "pass" };
  if (!i.user) {
    // A transient auth fault on a request that carries auth cookies is not "no session".
    if (transient(i.userError) && mustCheck) return { kind: "deny" };
    return { kind: "pass" };
  }
  if (i.aalError || !i.aal) return { kind: "deny" };
  if (i.aal.nextLevel === "aal2" && i.aal.currentLevel !== "aal2") return { kind: "redirect", to: "/mfa/challenge" };
  if (i.requireMfa && i.aal.nextLevel !== "aal2") return { kind: "redirect", to: "/settings/security?enroll=1" };
  return { kind: "pass" };
}
