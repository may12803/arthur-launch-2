import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

// The bucket name for chat uploads.
const BUCKET = "arthur-chat-uploads";
const SIGNED_URL_TTL = 3600; // 1 hour

// Ensure the bucket exists (idempotent — safe to call on every cold start).
let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  const db = getSupabaseAdmin();
  const { error } = await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024, // 20 MB per file
  });
  // Ignore "already exists" error (code 409 / message includes "already exists")
  if (!error || error.message?.toLowerCase().includes("already exists")) {
    bucketEnsured = true;
  }
}

export async function POST(req: NextRequest) {
  const deny = authGate(req, { allowReadFromBrowser: false });
  if (deny) return deny;

  try {
    await ensureBucket();
  } catch {
    // If bucket creation fails (e.g. service role missing storage perms),
    // fall through — the upload itself will fail with a meaningful error.
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "no file in form data (field: 'file')" }, { status: 400 });
  }

  const fileName = (file as File).name ?? `upload-${Date.now()}`;
  const mime = file.type || "application/octet-stream";
  const size = file.size;

  // Path: uploads/<date>/<uuid>-<sanitized_name>
  const safeDate = new Date().toISOString().slice(0, 10);
  const uuid = crypto.randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const path = `uploads/${safeDate}/${uuid}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const db = getSupabaseAdmin();

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: mime,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `storage upload failed: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  // Generate a 1-hour signed URL for the LLM + message display to use
  const { data: signedData, error: signErr } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (signErr || !signedData) {
    return NextResponse.json(
      { error: `signed URL generation failed: ${signErr?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: path,            // storage path (permanent reference)
    signedUrl: signedData.signedUrl,  // time-limited display URL
    mime,
    name: fileName,
    size,
  });
}
