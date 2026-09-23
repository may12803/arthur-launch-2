import { NextRequest, NextResponse } from "next/server";
import { getApiContext, clientIp, rpcErrorResponse, MAX_DOCUMENT_BYTES } from "@/lib/client-portal/api";

export const runtime = "nodejs";

// Upload one document into the caller's company. Encryption happens in the
// database (document_upload): the file is sealed with this company's own Vault
// key before it is stored, and the upload is written to the access log.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "Files can be up to 20 MB." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { data, error } = await ctx.supabase.rpc("document_upload", {
    p_tenant: ctx.tenantId,
    p_name: file.name.slice(0, 255),
    p_content_type: file.type || "application/octet-stream",
    p_data_b64: bytes.toString("base64"),
    p_ip: clientIp(req),
  });
  if (error) return rpcErrorResponse(error.message);
  return NextResponse.json({ id: data });
}
