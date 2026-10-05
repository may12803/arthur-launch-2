import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/client-portal/api";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { exchangeOAuthCode, oauthEndpoints } from "@/lib/client-portal/connector-ui";
import { connectorsServerSecret, sha256Hex } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";

type StateRow = { tenant_id: string; user_id: string; connector_key: string; code_verifier: string; redirect_uri: string };

// The vendor sends the person back here. The state row is consumed once (single use, ten minute life, bound to a
// tenant and user) and must belong to the signed-in user, or nothing is stored. Tokens go straight to the encrypted
// store; they are never logged, returned or put in a URL.
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const back = (key: string | null, error?: string) => {
    const path = key ? `/client/connections/${key}` : "/client/connections";
    const url = new URL(path, origin);
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

  const supabase = await getLoveleedayRouteClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.redirect(new URL("/client/login", origin), 303);

  const anon = loveleedayAnon();
  const consumed = await anon.rpc("oauth_state_consume", { p_secret: secret, p_state_hash: sha256Hex(state) });
  if (consumed.error) return back(null, `Sign-in could not be verified: ${consumed.error.message}`);
  const st = (Array.isArray(consumed.data) ? consumed.data[0] : consumed.data) as StateRow | null;
  if (!st) return back(null, "That sign-in link expired or was already used. Start again from the connector page.");
  if (st.user_id !== u.user.id) return back(st.connector_key, "That sign-in was started by a different person.");

  const ep = oauthEndpoints(st.connector_key);
  if (!ep) return back(st.connector_key, "Sign-in for this system is not configured on the server.");

  let tokens;
  try {
    tokens = await exchangeOAuthCode(ep, { code, redirectUri: st.redirect_uri, codeVerifier: st.code_verifier });
  } catch (e) {
    return back(st.connector_key, e instanceof Error ? e.message : "The vendor did not complete the sign-in.");
  }

  const stored = await anon.rpc("connection_store_tokens", {
    p_secret: secret,
    p_tenant: st.tenant_id,
    p_connector: st.connector_key,
    p_tokens: tokens,
    p_scopes: tokens.scope ? tokens.scope.split(/[ ,]+/).filter(Boolean) : ep.scopes,
    p_token_expires_at: tokens.expires_at ?? null,
    p_external_account_id: null,
  });
  if (stored.error) return back(st.connector_key, `The sign-in worked but could not be stored: ${stored.error.message}`);
  return back(st.connector_key);
}
