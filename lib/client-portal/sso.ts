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

// Asked AFTER a password sign-in, about the signed-in person's own companies only: there is no anonymous lookup, so
// nobody can probe which domains enforce single sign-on. The database refuses the session either way.
export async function ssoRequiredForMe(client: { rpc(name: string): PromiseLike<{ data: boolean | null; error: unknown }> }): Promise<boolean> {
  const { data, error } = await client.rpc("sso_required_for_me");
  if (error) throw new Error("Sign-in rules could not be checked. Try again.");
  return data === true;
}

export async function tenantSessionAllowed(client: { rpc(name: string, args: { p_tenant: string }): PromiseLike<{ data: boolean | null; error: unknown }> }, tenantId: string): Promise<boolean> {
  const { data, error } = await client.rpc("sso_session_allowed", { p_tenant: tenantId });
  if (error) throw new Error("Sign-in rules could not be checked. Try again.");
  return data === true;
}
