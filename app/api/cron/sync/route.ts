import { NextRequest, NextResponse } from "next/server";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { connectorsServerSecret, safeEqual } from "@/lib/client-portal/connector-api";
import { runConnection } from "@/lib/connectors/runner/runner";
import { SupabaseRpcStore } from "@/lib/connectors/runner/supabase-store";
import { getAdapter } from "@/lib/connectors/adapters/registry";
import { getDefinition } from "@/lib/connectors/definitions";
import { oauthEndpoints } from "@/lib/client-portal/connector-ui";
import type { TokenSet } from "@/lib/connectors/auth/oauth2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Due = { id: string; tenant_id: string; connector_key: string; definition_key: string | null; auth_method: string | null };
const MAX_PER_RUN = 20;

// Scheduled sync entry point. Guarded by the x-connectors-secret header, compared in constant time against the
// connectors server secret; no cookie, no session. Fails closed when the secret is not configured. The response
// carries counts and connection ids only: never credentials, payloads or vendor error bodies.
async function handle(req: NextRequest) {
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const given = req.headers.get("x-connectors-secret") || "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const anon = loveleedayAnon();
  const due = await anon.rpc("connections_due", { p_secret: secret });
  if (due.error) return NextResponse.json({ error: `connections_due: ${due.error.message}` }, { status: 502 });
  const list = ((due.data ?? []) as Due[]).slice(0, MAX_PER_RUN);

  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Database address is not configured." }, { status: 503 });
  const store = new SupabaseRpcStore({ url, anonKey, secret, fetch: (u, init) => fetch(u, init) });

  const results: { connection: string; status: "ran" | "failed"; objects?: number; reason?: string }[] = [];
  for (const c of list) {
    const key = c.definition_key || c.connector_key;
    try {
      const s = await anon.rpc("connection_secret", { p_secret: secret, p_connection: c.id });
      if (s.error || !s.data) throw new Error("no stored credential");
      const raw = JSON.parse(String(s.data)) as Record<string, unknown>;
      const creds = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
      const ep = c.auth_method?.startsWith("oauth2") ? oauthEndpoints(key) : null;
      const tokenStore = ep ? {
        get: async (): Promise<TokenSet> => {
          const latest = await anon.rpc("connection_secret", { p_secret: secret, p_connection: c.id });
          if (latest.error || !latest.data) throw new Error("Could not read the connection sign-in.");
          return JSON.parse(String(latest.data)) as TokenSet;
        },
        // One atomic compare-and-set in the database: the write lands only if the stored set is still the one this
        // refresh started from, so two concurrent refreshes can never overwrite each other's rotated refresh token.
        compareAndSet: async (expectedRotatedAt: string, next: TokenSet): Promise<boolean> => {
          const saved = await anon.rpc("connection_rotate_tokens", { p_secret: secret, p_connection: c.id, p_tokens: next, p_rotated_at: next.rotated_at, p_expected_rotated_at: expectedRotatedAt || null });
          if (saved.error) throw new Error("Could not save the renewed sign-in.");
          return saved.data === true;
        },
      } : null;
      const out = await runConnection({ id: c.id, tenantId: c.tenant_id, definitionKey: key, creds }, getAdapter(key), store, {
        definition: getDefinition(key), fetch: globalThis.fetch,
        ...(ep && tokenStore ? { oauth: { store: tokenStore, tokenUrl: ep.tokenUrl, clientId: ep.clientId, clientSecret: ep.clientSecret } } : {}),
      });
      results.push({ connection: c.id, status: out.objects.every((o) => o.status === "succeeded") ? "ran" : "failed", objects: out.objects.length });
    } catch (e) {
      results.push({ connection: c.id, status: "failed", reason: e instanceof Error ? e.message.slice(0, 120) : "failed" });
    }
  }
  return NextResponse.json({ due: (due.data ?? []).length, attempted: list.length, ran: results.filter((r) => r.status === "ran").length, failed: results.filter((r) => r.status === "failed").length, results });
}

export const GET = handle;
export const POST = handle;
