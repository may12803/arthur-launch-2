import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

// The caller's company and role for /api/client/* routes. The membership read
// runs under the caller's own session, so the database's require_mfa_aal2 policy
// answers the two-factor question: a password-only session finds no membership.
export async function getApiContext() {
  const supabase = await getLoveleedayRouteClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const { data: m } = await supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", userData.user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle<{ tenant_id: string; role: string }>();
  if (m) return { supabase, userId: userData.user.id, tenantId: m.tenant_id, role: m.role, error: null } as const;
  // LOVELEEDAY staff act in a client's account only through a live, logged grant.
  const { data: g } = await supabase
    .from("staff_grants")
    .select("tenant_id")
    .eq("staff_user_id", userData.user.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ tenant_id: string }>();
  if (g) return { supabase, userId: userData.user.id, tenantId: g.tenant_id, role: "staff", error: null } as const;
  return { supabase, error: NextResponse.json({ error: "Two-factor sign-in and company access are required." }, { status: 403 }) } as const;
}

// Behind Fly's proxy req.url is the container bind address; links sent to
// people are built from the forwarded public host (portal.loveleedaystudios.com
// or arthur-online.fly.dev), never 0.0.0.0.
export function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost)(:|$)/.test(host)) {
    return `${req.headers.get("x-forwarded-proto") || "https"}://${host}`;
  }
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
