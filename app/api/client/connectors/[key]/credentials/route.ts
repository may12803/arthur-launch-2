import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { dbFail, isAdminRole } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";

// What a person needs to finish a key-pair or file-drop connection on their side: the PUBLIC key we generated and,
// for the SFTP drop, host, user name and folder. Private material is never returned.
// CONTRACT GAP: connection_public_credentials(p_tenant, p_connector) is not listed in CONTRACT.md.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isAdminRole(ctx.role) && ctx.role !== "staff") return NextResponse.json({ error: "Only an owner or admin can see connection details." }, { status: 403 });
  const { data, error } = await ctx.supabase.rpc("connection_public_credentials", { p_tenant: ctx.tenantId, p_connector: key });
  if (error) return dbFail(error.message, "Could not load connection details");
  const d = (data ?? {}) as { public_key?: string; sftp?: { host: string; port: number; username: string; directory: string } };
  return NextResponse.json({ public_key: d.public_key, sftp: d.sftp });
}
