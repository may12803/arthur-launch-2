import { NextRequest, NextResponse } from "next/server";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { connectorsServerSecret, safeEqual } from "@/lib/client-portal/connector-api";
import { oauthEndpoints } from "@/lib/client-portal/connector-ui";
import { needsRefresh, refreshTokens, type TokenSet } from "@/lib/connectors/auth/oauth2";
import { runAtlassianReport, type AccountRow } from "@/lib/connectors/privacy/atlassian-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Atlassian Personal Data Reporting (https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/).
// Run weekly by the in-process scheduler. Same guard as the other cron routes: constant-time x-connectors-secret, fail
// closed when unset. Returns counts only: never account ids, tokens or vendor bodies.
async function handle(req: NextRequest) {
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const given = req.headers.get("x-connectors-secret") || "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const anon = loveleedayAnon();
  const keys = new Map<string, string>();
  try {
    const summary = await runAtlassianReport({
      fetch: (u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(30_000) }),
      list: async () => {
        const r = await anon.rpc("atlassian_accounts_list", { p_secret: secret });
        if (r.error) throw new Error("atlassian_accounts_list failed");
        const rows = (r.data ?? []) as AccountRow[];
        for (const x of rows) keys.set(x.connection_id, x.definition_key);
        return rows;
      },
      tokenFor: async (connection) => {
        const read = async (): Promise<TokenSet | null> => {
          const s = await anon.rpc("connection_secret", { p_secret: secret, p_connection: connection });
          return s.error || !s.data ? null : (JSON.parse(String(s.data)) as TokenSet);
        };
        const t = await read();
        if (!t?.access_token) return null;
        const ep = oauthEndpoints(keys.get(connection) || "jira");
        if (!needsRefresh(t) || !ep) return t.access_token;
        const fresh = await refreshTokens({
          fetch: (u, init) => fetch(u, init),
          tokenUrl: ep.tokenUrl, clientId: ep.clientId, clientSecret: ep.clientSecret,
          store: {
            get: async () => (await read()) as TokenSet,
            compareAndSet: async (expected, next) => {
              const saved = await anon.rpc("connection_rotate_tokens", { p_secret: secret, p_connection: connection, p_tokens: next, p_rotated_at: next.rotated_at, p_expected_rotated_at: expected || null });
              if (saved.error) throw new Error("Could not save the renewed sign-in.");
              return saved.data === true;
            },
          },
        });
        return fresh.access_token;
      },
      apply: async (accountId, status) => {
        const r = await anon.rpc("atlassian_account_apply", { p_secret: secret, p_account_id: accountId, p_status: status });
        if (r.error) throw new Error("atlassian_account_apply failed");
      },
    });
    console.log(`[atlassian-privacy] accounts=${summary.accounts} reported=${summary.reported} closed=${summary.closed} updated=${summary.updated} failed=${summary.failed}`);
    return NextResponse.json({ ...summary, errors: summary.errors.length });
  } catch (e) {
    return NextResponse.json({ error: `report failed: ${e instanceof Error ? e.message.slice(0, 80) : "error"}` }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
