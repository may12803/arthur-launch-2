import { NextRequest, NextResponse } from "next/server";
import { getApiContext, clientIp, rpcErrorResponse } from "@/lib/client-portal/api";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every download is a fresh request from a signed-in, two-factor session: the
// database checks membership, decrypts with the company's key, verifies the
// file's checksum and logs the access. There is no reusable link to leak.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;

  const { data, error } = await ctx.supabase.rpc("document_download", { p_id: id, p_ip: clientIp(req) });
  if (error) return rpcErrorResponse(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const body = Buffer.from(row.data_b64 as string, "base64");
  const name = String(row.name);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(body, {
    headers: {
      // Always a download, never rendered inline: an uploaded HTML or SVG file
      // must not be able to run inside the portal's origin.
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-length": String(body.length),
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;

  const { error } = await ctx.supabase.rpc("document_delete", { p_id: id, p_ip: clientIp(req) });
  if (error) return rpcErrorResponse(error.message);
  return NextResponse.json({ ok: true });
}
