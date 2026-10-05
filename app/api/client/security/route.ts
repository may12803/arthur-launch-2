import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { clip, dbFail } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// tenant_security_set: owners only (the RPC enforces it too). SCIM is deliberately not settable here: it is turned on
// by LOVELEEDAY with your identity provider, and the screen reports it as not enabled until it is.
// Enforcing SSO needs at least one domain, so a mistake cannot lock the whole company out.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (ctx.role !== "owner") return NextResponse.json({ error: "Only an owner can change security settings." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const domains: string[] = [...new Set((Array.isArray(body.sso_domains) ? body.sso_domains : []).map((d: unknown) => clip(d, 120).toLowerCase()).filter(Boolean))] as string[];
  const bad = domains.find((d) => !DOMAIN.test(d));
  if (bad) return NextResponse.json({ error: `"${bad}" is not a valid domain. Use the part after the @, for example example.org.` }, { status: 400 });
  const enforced = body.sso_enforced === true;
  if (enforced && !domains.length) return NextResponse.json({ error: "Add at least one domain before enforcing single sign-on." }, { status: 400 });
  const hours = Number(body.session_hours);
  const retention = Number(body.retention_days);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) return NextResponse.json({ error: "Session length must be between 1 and 720 hours." }, { status: 400 });
  if (!Number.isInteger(retention) || retention < 30 || retention > 3650) return NextResponse.json({ error: "Retention must be between 30 and 3650 days." }, { status: 400 });
  // SCIM is not customer-settable; carry the stored value through so saving other settings never flips it.
  const cur = await ctx.supabase.from("tenant_security").select("scim_enabled").eq("tenant_id", ctx.tenantId).maybeSingle<{ scim_enabled: boolean }>();
  if (cur.error) return dbFail(cur.error.message, "Could not read current settings");
  const { error } = await ctx.supabase.rpc("tenant_security_set", { p_tenant: ctx.tenantId, p_sso_enforced: enforced, p_sso_domains: domains, p_scim_enabled: cur.data?.scim_enabled ?? false, p_session_hours: hours, p_retention_days: retention });
  if (error) return dbFail(error.message, "Could not save security settings");
  return NextResponse.json({ ok: true });
}
