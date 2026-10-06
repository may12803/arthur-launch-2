import { NextRequest, NextResponse } from "next/server";
import { getApiContext, publicOrigin } from "@/lib/client-portal/api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { tokenRequest } from "@/lib/connectors/auth/oauth2";
import { oauthEndpoints } from "@/lib/client-portal/connector-ui";
import { connectorsServerSecret } from "@/lib/client-portal/connector-api";
import { zendeskEndpoints } from "@/lib/connectors/auth/zendesk";
import type { OAuthErrorCode } from "@/lib/client-portal/public-errors";

export const runtime = "nodejs";

type StateRow = { connection_id: string; connector_key: string; code_verifier: string | null; redirect_uri: string };

// The vendor sends the person back here. The signed-in person's tenant and user are resolved from their own session and
// passed to oauth_state_consume, which only releases a state row that is unexpired, unused and bound to exactly that
// tenant AND user (a mismatch consumes nothing). Tokens go straight to the encrypted store; they are never logged,
// returned or put in a URL.
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  // Only a stable code from OAUTH_ERRORS ever reaches the URL; vendor and database text is logged server-side.
  const back = (key: string | null, error?: OAuthErrorCode) => {
    const url = new URL(key ? `/client/connections/${key}` : "/client/connections", origin);
    if (error) url.searchParams.set("error", error);
    else url.searchParams.set("connected", "1");
    return NextResponse.redirect(url, 303);
  };

  const q = req.nextUrl.searchParams;
  const state = q.get("state") || "";
  const code = q.get("code") || "";
  if (q.get("error")) {
    console.error(`[oauth-callback] vendor returned error=${String(q.get("error")).slice(0, 80)}`);
    return back(null, "vendor_declined");
  }
  if (!state || !code) return back(null, "incomplete");

  const secret = connectorsServerSecret();
  if (!secret) return back(null, "not_configured");

  const ctx = await getApiContext();
  if (ctx.error) return NextResponse.redirect(new URL("/client/login", origin), 303);

  const anon = loveleedayAnon();
  const consumed = await anon.rpc("oauth_state_consume", { p_secret: secret, p_state: state, p_tenant: ctx.tenantId, p_user: ctx.userId });
  if (consumed.error) {
    console.error(`[oauth-callback] state consume failed: ${consumed.error.message}`);
    return back(null, "link_expired");
  }
  const st = (Array.isArray(consumed.data) ? consumed.data[0] : consumed.data) as StateRow | null;
  if (!st) return back(null, "link_expired");

  let ep = oauthEndpoints(st.connector_key);
  if (st.connector_key === "zendesk") {
    // The token exchange goes to the customer's own subdomain, saved on the connection when sign-in started.
    const cfg = await anon.rpc("connection_config_get", { p_secret: secret, p_connection: st.connection_id });
    ep = zendeskEndpoints((cfg.data as { subdomain?: string } | null)?.subdomain);
  }
  if (!ep) return back(st.connector_key, "system_not_configured");

  let tokens;
  try {
    tokens = await tokenRequest({
      fetch: (url, init) => fetch(url, init),
      tokenUrl: ep.tokenUrl,
      clientId: ep.clientId,
      clientSecret: ep.clientSecret,
      params: { grant_type: "authorization_code", code, redirect_uri: st.redirect_uri, ...(st.code_verifier ? { code_verifier: st.code_verifier } : {}) },
    });
  } catch (e) {
    console.error(`[oauth-callback] token exchange failed for ${st.connector_key}: ${e instanceof Error ? e.message : "error"}`);
    return back(st.connector_key, "exchange_failed");
  }

  const stored = await anon.rpc("connection_store_tokens", { p_secret: secret, p_connection: st.connection_id, p_tokens: tokens, p_rotated_at: tokens.rotated_at });
  if (stored.error) {
    console.error("[oauth-callback] token store failed", st.connector_key, stored.error.message);
    return back(st.connector_key, "save_failed");
  }
  return back(st.connector_key);
}
