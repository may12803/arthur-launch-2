import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { ACTIVE_TENANT_COOKIE, ACTIVE_TENANT_HEADER, resolveActiveTenant } from "./active-tenant";
import { tenantSessionAllowed } from "./sso";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

// The caller's company and role for /api/client/* routes. The company is the explicit active tenant (x-tenant-id
// header, else the lv_active_tenant cookie the screens use), validated against the caller's own accepted
// memberships and live staff grants on EVERY call by the same resolver the screens use. There is no "first
// membership": several companies and no valid selection is a 409, a selection the caller does not belong to is a 403.
// The membership read runs under the caller's own session, so the database's require_mfa_aal2 policy answers the
// two-factor question: a password-only session finds no membership.
export async function getApiContext() {
  const supabase = await getLoveleedayRouteClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const requested = (await headers()).get(ACTIVE_TENANT_HEADER) || (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value || null;
  const r = await resolveActiveTenant(supabase, userData.user.id, requested);
  if (r.ok) {
    try {
      if (!await tenantSessionAllowed(supabase, r.tenantId))
        return { supabase, error: NextResponse.json({ error: "Your company signs in with single sign-on." }, { status: 403 }) } as const;
    } catch {
      return { supabase, error: NextResponse.json({ error: "Sign-in rules could not be checked. Try again." }, { status: 503 }) } as const;
    }
    return { supabase, userId: userData.user.id, tenantId: r.tenantId, role: r.role, error: null } as const;
  }
  if (r.reason === "ambiguous") return { supabase, error: NextResponse.json({ error: "Choose a company first.", code: "tenant_ambiguous" }, { status: 409 }) } as const;
  if (r.reason === "not_member") return { supabase, error: NextResponse.json({ error: "You don't have access to that company.", code: "tenant_not_member" }, { status: 403 }) } as const;
  return { supabase, error: NextResponse.json({ error: "Two-factor sign-in and company access are required." }, { status: 403 }) } as const;
}

// Behind Fly's proxy req.url is the container bind address; links sent to
// people are built from the forwarded public host (portal.loveleedaystudios.com
// or arthur-online.fly.dev), never 0.0.0.0. The host is client-controlled, so
// only known hosts are accepted; anything else would let a forged Host header
// put another domain into a link we email (red team F-05, 2026-10-02).
const PUBLIC_HOSTS = new Set(["portal.loveleedaystudios.com", "arthur-online.fly.dev"]);
export function publicOrigin(req: NextRequest): string {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  if (PUBLIC_HOSTS.has(host)) return `https://${host}`;
  return process.env.PORTAL_ORIGIN || "https://portal.loveleedaystudios.com";
}

export function clientIp(req: NextRequest): string | null {
  return req.headers.get("fly-client-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

// Database refusals carry plain-language messages; map them to HTTP status.
export function rpcErrorResponse(message: string) {
  const m = message.toLowerCase();
  const status = m.includes("two-factor") ? 401 : m.includes("not found") ? 404 : m.includes("not allowed") || m.includes("only an owner") ? 403 : m.includes("larger than") || m.includes("empty") ? 413 : 500;
  return NextResponse.json({ error: status === 500 ? "Something went wrong. Try again." : message }, { status });
}
