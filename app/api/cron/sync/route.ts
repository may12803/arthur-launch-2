import { NextRequest, NextResponse } from "next/server";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { connectorsServerSecret, safeEqual } from "@/lib/client-portal/connector-api";
import { runConnection } from "@/lib/connectors/runner/runner";
import { SupabaseRpcStore } from "@/lib/connectors/runner/supabase-store";
import { getAdapter } from "@/lib/connectors/adapters/registry";
import { getDefinition } from "@/lib/connectors/definitions";
import { oauthEndpoints } from "@/lib/client-portal/connector-ui";
import { zendeskEndpoints, zendeskUrls } from "@/lib/connectors/auth/zendesk";
import type { TokenSet } from "@/lib/connectors/auth/oauth2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Job = { job_id: string; connection_id: string; tenant_id: string; connector_key: string; definition_key: string | null; auth_method: string | null };
const concurrency = Math.min(16, Math.max(1, Number.parseInt(process.env.SYNC_CONCURRENCY || "4", 10) || 4));

// Scheduled sync entry point. Guarded by the x-connectors-secret header, compared in constant time against the
// connectors server secret; no cookie, no session. Fails closed when the secret is not configured. The response
// carries counts and connection ids only: never credentials, payloads or vendor error bodies.
async function handle(req: NextRequest) {
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const given = req.headers.get("x-connectors-secret") || "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const anon = loveleedayAnon();
  const queued = await anon.rpc("sync_jobs_enqueue", { p_secret: secret });
  if (queued.error) return NextResponse.json({ error: `sync_jobs_enqueue: ${queued.error.message}` }, { status: 502 });
  const worker = crypto.randomUUID();
  const deadline = Date.now() + 285_000;
  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Database address is not configured." }, { status: 503 });
  const store = new SupabaseRpcStore({ url, anonKey, secret, fetch: (u, init) => fetch(u, init) });

  const results: { connection: string; status: "ran" | "failed"; objects?: number; reason?: string }[] = [];
  let claimed = 0;
  const work = async (c: Job) => {
    const id = c.connection_id;
    const key = c.definition_key || c.connector_key;
    try {
      const s = await anon.rpc("connection_secret", { p_secret: secret, p_connection: id });
      if (s.error || !s.data) throw new Error("no stored credential");
      const raw = JSON.parse(String(s.data)) as Record<string, unknown>;
      const creds = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
      if (key === "zendesk") {
        // Per-tenant subdomain (saved on the connection at connect time) drives the token refresh and every API call.
        const cfg = await anon.rpc("connection_config_get", { p_secret: secret, p_connection: c.id });
        const sub = (cfg.data as { subdomain?: string } | null)?.subdomain;
        if (!sub) throw new Error("no Zendesk subdomain saved");
        creds.subdomain = sub;
        creds.api_base = zendeskUrls(sub).apiBase;
      }
      const ep = c.auth_method?.startsWith("oauth2") ? (key === "zendesk" ? zendeskEndpoints(creds.subdomain) : oauthEndpoints(key)) : null;
      const tokenStore = ep ? {
        get: async (): Promise<TokenSet> => {
          const latest = await anon.rpc("connection_secret", { p_secret: secret, p_connection: id });
          if (latest.error || !latest.data) throw new Error("Could not read the connection sign-in.");
          return JSON.parse(String(latest.data)) as TokenSet;
        },
        // One atomic compare-and-set in the database: the write lands only if the stored set is still the one this
        // refresh started from, so two concurrent refreshes can never overwrite each other's rotated refresh token.
        compareAndSet: async (expectedRotatedAt: string, next: TokenSet): Promise<boolean> => {
          const saved = await anon.rpc("connection_rotate_tokens", { p_secret: secret, p_connection: id, p_tokens: next, p_rotated_at: next.rotated_at, p_expected_rotated_at: expectedRotatedAt || null });
          if (saved.error) throw new Error("Could not save the renewed sign-in.");
          return saved.data === true;
        },
      } : null;
      const out = await runConnection({ id: id, tenantId: c.tenant_id, definitionKey: key, creds }, getAdapter(key), store, {
        definition: getDefinition(key), fetch: globalThis.fetch,
        ...(ep && tokenStore ? { oauth: { store: tokenStore, tokenUrl: ep.tokenUrl, clientId: ep.clientId, clientSecret: ep.clientSecret } } : {}),
      });
      const error = out.objects.find((o) => o.status !== "succeeded")?.error || null;
      const finished = await anon.rpc("sync_jobs_finish", { p_secret: secret, p_job: c.job_id, p_worker: worker, p_error: error });
      if (finished.error || finished.data !== true) throw new Error("Could not finish sync job.");
      results.push({ connection: id, status: error ? "failed" : "ran", objects: out.objects.length });
    } catch (e) {
      const reason = e instanceof Error ? e.message.slice(0, 120) : "failed";
      await anon.rpc("sync_jobs_finish", { p_secret: secret, p_job: c.job_id, p_worker: worker, p_error: reason });
      results.push({ connection: id, status: "failed", reason });
    }
  }
  const drain = async () => {
    while (Date.now() < deadline) {
      const claim = await anon.rpc("sync_jobs_claim", { p_secret: secret, p_worker: worker, p_limit: 1 });
      if (claim.error) throw new Error(`sync_jobs_claim: ${claim.error.message}`);
      const job = (claim.data as Job[] | null)?.[0];
      if (!job) return;
      claimed++;
      await work(job);
    }
  };
  try { await Promise.all(Array.from({ length: concurrency }, drain)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "claim failed" }, { status: 502 }); }
  return NextResponse.json({ enqueued: queued.data, attempted: claimed, ran: results.filter((r) => r.status === "ran").length, failed: results.filter((r) => r.status === "failed").length, results });
}

export const GET = handle;
export const POST = handle;
