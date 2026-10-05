import { NextRequest, NextResponse } from "next/server";
import { getApiContext, publicOrigin } from "@/lib/client-portal/api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { tokenRequest } from "@/lib/connectors/auth/oauth2";
import { oauthEndpoints } from "@/lib/client-portal/connector-ui";
import { connectorsServerSecret } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";

type StateRow = { connection_id: string; connector_key: string; code_verifier: string | null; redirect_uri: string };

// The vendor sends the person back here. The signed-in person's tenant and user are resolved from their own session and
// passed to oauth_state_consume, which only releases a state row that is unexpired, unused and bound to exactly that
// tenant AND user (a mismatch consumes nothing). Tokens go straight to the encrypted store; they are never logged,
// returned or put in a URL.
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const back = (key: string | null, error?: string) => {
    const url = new URL(key ? `/client/connections/${key}` : "/client/connections", origin);
    if (error) url.searchParams.set("error", error.slice(0, 180));
    else url.searchParams.set("connected", "1");
    return NextResponse.redirect(url, 303);
  };

  const q = req.nextUrl.searchParams;
  const state = q.get("state") || "";
  const code = q.get("code") || "";
  if (q.get("error")) return back(null, `The vendor declined: ${q.get("error")}`);
  if (!state || !code) return back(null, "The sign-in response was incomplete. Start again from the connector page.");

  const secret = connectorsServerSecret();
  if (!secret) return back(null, "Connector sign-in is not configured on the server.");

  const ctx = await getApiContext();
  if (ctx.error) return NextResponse.redirect(new URL("/client/login", origin), 303);

  const anon = loveleedayAnon();
  const consumed = await anon.rpc("oauth_state_consume", { p_secret: secret, p_state: state, p_tenant: ctx.tenantId, p_user: ctx.userId });
  if (consumed.error) return back(null, "That sign-in link expired, was already used, or was started by someone else. Start again from the connector page.");
  const st = (Array.isArray(consumed.data) ? consumed.data[0] : consumed.data) as StateRow | null;
  if (!st) return back(null, "That sign-in link expired or was already used. Start again from the connector page.");

  const ep = oauthEndpoints(st.connector_key);
  if (!ep) return back(st.connector_key, "Sign-in for this system is not configured on the server.");

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
    return back(st.connector_key, e instanceof Error ? e.message : "The vendor did not complete the sign-in.");
  }

  const stored = await anon.rpc("connection_store_tokens", { p_secret: secret, p_connection: st.connection_id, p_tokens: tokens, p_rotated_at: tokens.rotated_at });
  if (stored.error) return back(st.connector_key, `The sign-in worked but could not be stored: ${stored.error.message}`);
  return back(st.connector_key);
}
