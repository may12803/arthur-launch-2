import { NextRequest, NextResponse } from "next/server";
import { getApiContext, rpcErrorResponse } from "@/lib/client-portal/api";

export const runtime = "nodejs";

// Owner/admin switch for sharing outside the company. Turning it off revokes
// every active outside link at once.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  const body = await req.json().catch(() => ({}));
  const { error } = await ctx.supabase.rpc("tenant_set_external_sharing", { p_tenant: ctx.tenantId, p_enabled: !!body.enabled });
  if (error) return rpcErrorResponse(error.message);
  return NextResponse.json({ ok: true });
}
