/**
 * Shared auth + rate-limit helpers for arthur-online API routes.
 *
 * Auth pattern: Authorization: Bearer <ARTHUR_SECRET>
 * Also accepts AUTOMATION_SECRET for internal cron/pipeline callers.
 *
 * Rate limiting: Supabase arthur_rate_limits table (already present).
 * In-memory fallback per cold-start window for low-traffic scenarios.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ── Auth ─────────────────────────────────────────────────────────────────────

const APP_HOST = "arthur-online.fly.dev";

/**
 * Returns true if the request is from a same-origin browser session — Origin
 * header set to our app, sec-fetch-site: same-origin, and method is GET.
 * Browsers reliably set these headers; non-browser callers don't.
 */
function isSameOriginBrowser(req: NextRequest): boolean {
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  const sfs = req.headers.get("sec-fetch-site") || "";
  if (sfs === "same-origin") return true;
  try {
    if (origin && new URL(origin).hostname === APP_HOST) return true;
    if (referer && new URL(referer).hostname === APP_HOST) return true;
  } catch {}
  return false;
}

/**
 * Returns true if the request carries a valid arthur secret.
 * Accepts either ARTHUR_SECRET or AUTOMATION_SECRET.
 */
export function isAuthed(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const s1 = process.env.ARTHUR_SECRET;
  const s2 = process.env.AUTOMATION_SECRET;
  return (!!s1 && auth === `Bearer ${s1}`) || (!!s2 && auth === `Bearer ${s2}`);
}

/**
 * Returns true if the request has valid HTTP Basic Auth matching the
 * dashboard credentials. Browser-rendered dashboard pages auto-include this
 * header on every same-origin fetch after middleware authed the page load.
 * Mirrors checkBasicAuth() in middleware.ts so route handlers can trust it.
 */
export function hasValidBasicAuth(req: NextRequest): boolean {
  const expectedUser = process.env.ARTHUR_ONLINE_USER || "daniel";
  const expectedPass = process.env.ARTHUR_ONLINE_PASSWORD;
  if (!expectedPass) return false;
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) return false;
  try {
    const decoded = atob(header.slice(6).trim());
    const idx = decoded.indexOf(":");
    if (idx < 0) return false;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    return user === expectedUser && pass === expectedPass;
  } catch {
    return false;
  }
}

/**
 * Returns a 401 response with brand-voice error message.
 * Use when isAuthed() returns false.
 */
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "this endpoint requires the arthur secret in `Authorization: Bearer <secret>`" },
    { status: 401 }
  );
}

/**
 * Inline auth gate — call at top of route handler.
 * Returns a NextResponse to return early, or null if authed.
 *
 * Default behavior (allowReadFromBrowser=true): same-origin GET requests from
 * the arthur-online dashboard pass through without a Bearer token, so
 * browser-rendered dashboards can fetch their data. Mutations (POST/PATCH/DELETE)
 * still require the Bearer secret regardless of origin.
 *
 * Pass allowReadFromBrowser=false to require Bearer on every method (e.g. for
 * /api/chat which fires LLM calls and shouldn't be public even via browser).
 */
export function authGate(
  req: NextRequest,
  opts: { allowReadFromBrowser?: boolean } = {}
): NextResponse | null {
  const allowRead = opts.allowReadFromBrowser ?? true;
  if (isAuthed(req)) return null;
  // Browser sessions that already passed middleware Basic Auth are trusted
  // (middleware gates every non-public route). This lets the dashboard chat,
  // mutations, etc. work from an authed browser without exposing ARTHUR_SECRET
  // to client JS.
  if (hasValidBasicAuth(req)) return null;
  if (allowRead && req.method === "GET" && isSameOriginBrowser(req)) return null;
  return unauthorized();
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

// In-memory fallback (resets on cold start — fine for low-traffic routes)
const _memCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limit a route using the Supabase arthur_rate_limits table.
 * Falls through to in-memory if DB is unreachable.
 *
 * @param key     Unique key for this rate limit bucket (e.g. "chat", "process-inbox")
 * @param maxReq  Max requests per window (default 60)
 * @param windowS Window in seconds (default 60)
 * @returns NextResponse (429) if rate limited, null otherwise
 */
export async function rateLimit(
  key: string,
  maxReq = 60,
  windowS = 60
): Promise<NextResponse | null> {
  const now = Date.now();
  const windowMs = windowS * 1000;

  try {
    const db = getSupabaseAdmin();
    const windowStart = new Date(now - windowMs).toISOString();

    // Upsert a count row — increment or create
    const { data, error } = await db.rpc("rate_limit_check", {
      p_key: key,
      p_max_requests: maxReq,
      p_window_seconds: windowS,
    });

    if (!error && data != null) {
      // RPC returns: { allowed: boolean, current: number }
      const result = data as { allowed: boolean; current: number };
      if (!result.allowed) {
        return NextResponse.json(
          { error: `too many requests — slow down. limit: ${maxReq}/min` },
          { status: 429, headers: { "Retry-After": String(windowS) } }
        );
      }
      return null;
    }
    // Fall through to in-memory if RPC doesn't exist yet
  } catch {
    // DB unreachable — use in-memory
  }

  // In-memory fallback
  const bucket = _memCounts.get(key);
  if (!bucket || bucket.resetAt < now) {
    _memCounts.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count++;
  if (bucket.count > maxReq) {
    return NextResponse.json(
      { error: `too many requests — slow down. limit: ${maxReq}/min` },
      { status: 429, headers: { "Retry-After": String(windowS) } }
    );
  }
  return null;
}

// ── HTTPS callback guard ──────────────────────────────────────────────────────

const ALLOWED_HOST = "arthur-online.fly.dev";

/**
 * Returns true if the redirect_uri / callback_url is a valid HTTPS callback
 * on the arthur-online host. Blocks open redirects.
 */
export function isValidCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === ALLOWED_HOST;
  } catch {
    return false;
  }
}

// ── Error helpers ─────────────────────────────────────────────────────────────

export function badRequest(msg: string): NextResponse {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function serverError(msg: string): NextResponse {
  return NextResponse.json({ error: msg }, { status: 500 });
}
