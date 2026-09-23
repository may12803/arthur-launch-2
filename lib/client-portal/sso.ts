// Shared by the portal guard (server) and the login/invite pages (browser).
// A SAML SSO session's second factor belongs to the client's identity
// provider; the database's require_mfa_aal2 policy accepts it on the same terms.
// Supabase reports authentication methods as entries or bare strings.
export function isSsoSession(methods: ReadonlyArray<{ method: string } | string> | undefined | null): boolean {
  return !!methods?.some((m) => (typeof m === "string" ? m : m.method) === "sso/saml");
}

export function emailDomain(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  const domain = at > 0 ? email.trim().toLowerCase().slice(at + 1) : "";
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}
