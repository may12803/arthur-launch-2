import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

// GET /api/communications/attachment?path=arthur-comm-attachments/<key>
// Validates the path is under our private bucket, signs a short-lived URL,
// and 302-redirects so the browser downloads directly from Supabase Storage.
export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("path");
  if (!raw) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // Normalize: strip a leading "arthur-comm-attachments/" if present
  const PREFIX = "arthur-comm-attachments/";
  const key = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;

  // Reject path traversal attempts and absolute paths
  if (key.includes("..") || key.startsWith("/") || key.startsWith("http")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db.storage
    .from("arthur-comm-attachments")
    .createSignedUrl(key, 300); // 5 min

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "could not sign url" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
