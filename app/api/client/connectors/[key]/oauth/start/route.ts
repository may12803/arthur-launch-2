import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { oauthRedirectUri } from "@/lib/client-portal/oauth-redirect";
import { CONNECTOR_DEFINITIONS } from "@/lib/connectors/definitions";
import { codeChallengeS256, generateCodeVerifier, generateState } from "@/lib/connectors/auth/pkce";
import { oauthEndpoints } from "@/lib/client-portal/connector-ui";
import { connectorsServerSecret, dbFail, isAdminRole } from "@/lib/client-portal/connector-api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { parseZendeskSubdomain, zendeskEndpoints } from "@/lib/connectors/auth/zendesk";

export const runtime = "nodejs";

// Starts a vendor sign-in. The state and PKCE verifier are generated here; connector_oauth_begin hashes the state,
// encrypts the verifier with the tenant key and binds the row to this tenant and user for ten minutes, single use.
// The browser gets the vendor's authorize URL and nothing secret.
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isAdminRole(ctx.role) && ctx.role !== "staff") return NextResponse.json({ error: "Only an owner or admin can connect a system." }, { status: 403 });

  const def = CONNECTOR_DEFINITIONS.find((s) => s.key === key);
  if (!def) return NextResponse.json({ error: "Unknown connector." }, { status: 404 });
  if (def.auth_method !== "oauth2_authcode") return NextResponse.json({ error: `${def.name} does not use a vendor sign-in. Use the credential form on its page.` }, { status: 400 });
  if (def.access_gate === "partner/license") return NextResponse.json({ error: `${def.name} reviews access before a sign-in can complete. Request access on the connector page and we will start it with you.` }, { status: 409 });

  // Zendesk is per customer account: the sign-in lives on the customer's own subdomain, entered at connect time.
  let subdomain: string | null = null;
  if (key === "zendesk") {
    const body = await req.json().catch(() => ({}));
    subdomain = parseZendeskSubdomain((body as { subdomain?: unknown }).subdomain);
    if (!subdomain) return NextResponse.json({ error: "Enter your Zendesk subdomain: the part before .zendesk.com, using only lowercase letters, numbers and hyphens." }, { status: 400 });
  }
  const ep = key === "zendesk" ? zendeskEndpoints(subdomain) : oauthEndpoints(key);
  if (!ep) return NextResponse.json({ error: `Sign-in for ${def.name} is not set up yet. Request it on the connector page and we will finish the setup with you.` }, { status: 501 });

  const state = generateState();
  const verifier = generateCodeVerifier();
  const redirectUri = oauthRedirectUri();
  const { error } = await ctx.supabase.rpc("connector_oauth_begin", {
    p_tenant: ctx.tenantId,
    p_connector: key,
    p_state: state,
    p_code_verifier: verifier,
    p_redirect_uri: redirectUri,
  });
  if (error) return dbFail(error.message, "Could not start sign-in");

  if (subdomain) {
    const secret = connectorsServerSecret();
    const conn = await ctx.supabase.from("tenant_connections").select("id").eq("tenant_id", ctx.tenantId).eq("connector_key", key).maybeSingle();
    if (!secret || conn.error || !conn.data) return NextResponse.json({ error: "Could not start sign-in." }, { status: 500 });
    const saved = await loveleedayAnon().rpc("connection_config_set", { p_secret: secret, p_connection: conn.data.id, p_config: { subdomain } });
    if (saved.error) return dbFail(saved.error.message, "Could not save the Zendesk subdomain");
  }

  const url = new URL(ep.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", ep.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (ep.scopes.length) url.searchParams.set("scope", ep.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallengeS256(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.json({ url: url.toString() });
}
