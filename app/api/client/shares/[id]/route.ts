import { NextRequest, NextResponse } from "next/server";
import { getApiContext, rpcErrorResponse } from "@/lib/client-portal/api";

export const runtime = "nodejs";

// Revoke an outside link. Its creator, or an owner/admin, may revoke it; the
// recipient's next attempt is refused and the revocation is logged.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  const { error } = await ctx.supabase.rpc("share_revoke", { p_share: id });
  if (error) return rpcErrorResponse(error.message);
  return NextResponse.json({ ok: true });
}
