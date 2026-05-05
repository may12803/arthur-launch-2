import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

function sanitizeIdentifier(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("legal_documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Generate 5-minute signed URL for the file
  let signed_url: string | null = null;
  if (data.storage_path) {
    const { data: urlData, error: urlErr } = await db.storage
      .from("arthur-legal-vault")
      .createSignedUrl(data.storage_path, 300); // 5 min
    if (!urlErr && urlData?.signedUrl) {
      signed_url = urlData.signedUrl;
    }
  }

  // Stamp last_accessed_at + audit log (fire-and-forget)
  const now = new Date().toISOString();
  void Promise.all([
    Promise.resolve(db.from("legal_documents").update({ last_accessed_at: now }).eq("id", id)),
    Promise.resolve(db.from("legal_document_actions").insert({ document_id: id, action: "view", actor: "daniel" })),
  ]).catch(() => {/* intentional fire-and-forget */});

  return NextResponse.json({ ...data, signed_url });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;
  const db = getSupabaseAdmin();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Allowlisted fields — entity/category are free text, sanitized before write
  const ALLOWED = ["title","description","entity","category","effective_date","expires_at","parties","metadata","is_archived"] as const;
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) {
      if (key === "entity" && typeof body[key] === "string") {
        patch[key] = sanitizeIdentifier(body[key] as string);
      } else if (key === "category" && typeof body[key] === "string") {
        // lowercase + trim only, preserve underscores
        patch[key] = (body[key] as string).toLowerCase().trim();
      } else {
        patch[key] = body[key];
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("legal_documents")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Audit
  void Promise.resolve(db.from("legal_document_actions").insert({
    document_id: id,
    action: "update",
    actor: "daniel",
    metadata: { fields: Object.keys(patch) },
  })).catch(() => {});

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;
  const db = getSupabaseAdmin();

  // Soft delete — archive only
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("legal_documents")
    .update({ is_archived: true, archived_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  void Promise.resolve(db.from("legal_document_actions").insert({
    document_id: id,
    action: "archive",
    actor: "daniel",
  })).catch(() => {});

  return NextResponse.json({ ok: true, ...data });
}
