import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

// 25 MB hard cap on legal document uploads
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

// Allowed MIME types for legal documents
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
]);

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart form" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // File size check
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `file too large — max ${MAX_SIZE_BYTES / 1024 / 1024} MB` },
      { status: 413 }
    );
  }

  // MIME allowlist
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: `file type not allowed — upload PDF, Word doc, or plain text` },
      { status: 415 }
    );
  }

  const originalName = file.name;
  const ext = originalName.includes(".") ? originalName.split(".").pop()! : "";
  const id = randomUUID();
  const pendingPath = `_pending/${id}${ext ? "." + ext : ""}`;

  // Upload to _pending/ immediately
  const bytes = await file.arrayBuffer();
  const { error: uploadErr } = await db.storage
    .from("arthur-legal-vault")
    .upload(pendingPath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[legal/upload] storage upload error:", uploadErr);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // Insert row with extraction_status=pending — entity/category/title left null
  const { data: doc, error: insertErr } = await db
    .from("legal_documents")
    .insert({
      id,
      storage_path: pendingPath,
      file_name: originalName,
      mime_type: file.type || null,
      size_bytes: file.size,
      extraction_status: "pending",
      uploaded_by: "daniel",
    })
    .select("id, storage_path, extraction_status")
    .single();

  if (insertErr) {
    console.error("[legal/upload] db insert error:", insertErr);
    // Clean up the orphaned storage file
    void db.storage.from("arthur-legal-vault").remove([pendingPath]).catch(() => {});
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Audit
  void Promise.resolve(db.from("legal_document_actions").insert({
    document_id: doc.id,
    action: "upload",
    actor: "daniel",
    metadata: { file_name: originalName, size_bytes: file.size },
  })).catch(() => {});

  // Fire-and-forget extraction
  const automationSecret = process.env.AUTOMATION_SECRET;
  if (automationSecret) {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    fetch(`${base}/api/legal/extract/${doc.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${automationSecret}` },
    }).catch(() => {/* intentional fire-and-forget */});
  }

  return NextResponse.json({ ok: true, id: doc.id, extraction_status: "pending" });
}
