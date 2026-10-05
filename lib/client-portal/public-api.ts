import { createHash } from "node:crypto";

export type ApiKey = { key_id: string; tenant_id: string; scopes: string[] };
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
type Bucket = { tokens: number; at: number };
const buckets = new Map<string, Bucket>();
const LIMIT = 60;

export function resetRateLimits() { buckets.clear(); }

export function takeToken(id: string, now = Date.now()): number {
  if (buckets.size > 10000) for (const [key, value] of buckets) if (now - value.at > 120000) buckets.delete(key);
  const b = buckets.get(id) ?? { tokens: LIMIT, at: now };
  b.tokens = Math.min(LIMIT, b.tokens + Math.max(0, now - b.at) / 1000);
  b.at = now;
  if (b.tokens < 1) { buckets.set(id, b); return Math.max(1, Math.ceil(1 - b.tokens)); }
  b.tokens -= 1;
  buckets.set(id, b);
  return 0;
}

export function cursor(value: string | null): number | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return null;
    return Number(raw);
  } catch { return null; }
}
export const nextCursor = (id: number) => Buffer.from(String(id)).toString("base64url");

export async function handlePublicApi(req: Request, kind: "connections" | "records" | "approvals", rpc: Rpc, secret: string | null, now = Date.now()): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const key = /^Bearer (lld_[A-Za-z0-9_-]+)$/.exec(auth)?.[1];
  if (!key) return json({ error: "An API key is required." }, 401);
  if (!secret) return json({ error: "API is not configured." }, 503);
  const verified = await rpc("api_key_verify", { p_secret: secret, p_key: key });
  if (verified.error) return json({ error: "API key could not be checked." }, 502);
  const owner = (verified.data as ApiKey[] | null)?.[0];
  if (!owner) return json({ error: "API key is invalid or revoked." }, 401);
  if (!owner.scopes.includes(`${kind}:read`)) return json({ error: "API key lacks the required scope." }, 403);
  const retry = takeToken(createHash("sha256").update(owner.key_id).digest("hex"), now);
  if (retry) return json({ error: "Too many requests." }, 429, { "Retry-After": String(retry) });
  const url = new URL(req.url);
  const after = cursor(url.searchParams.get("after"));
  if (url.searchParams.has("after") && after === null) return json({ error: "Invalid cursor." }, 400);
  const status = url.searchParams.get("status");
  if (kind === "approvals" && status && !["pending", "approved", "rejected", "edited", "expired"].includes(status)) return json({ error: "Invalid status." }, 400);
  const args = { p_secret: secret, p_tenant: owner.tenant_id, p_after: after, p_limit: 101, ...(kind === "records" ? { p_connection: url.searchParams.get("connection"), p_object: url.searchParams.get("object") } : {}), ...(kind === "approvals" ? { p_status: status } : {}) };
  const result = await rpc(`public_api_${kind}`, args);
  if (result.error) return json({ error: "Data could not be loaded." }, 502);
  const rows = (result.data ?? []) as Array<{ seq: number }>;
  const data = rows.slice(0, 100);
  return json({ data, next_cursor: rows.length > 100 ? nextCursor(data[99].seq) : null }, 200);
}

function json(data: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
}
