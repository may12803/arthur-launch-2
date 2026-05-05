import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface InboundPayload {
  from: string;
  from_name?: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  raw_mime?: string;  // base64-encoded original MIME (recovery surface)
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    disposition?: string;
  }>;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.EMAIL_INBOUND_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: InboundPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.from || !body.to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("arthur_inbox_emails")
    .insert({
      from_email:   body.from,
      from_name:    body.from_name ?? null,
      to_email:     body.to,
      subject:      body.subject ?? null,
      body_text:    body.text ?? null,
      body_html:    body.html ?? null,
      raw_headers:  body.headers ?? null,
      raw_mime:     body.raw_mime ?? null,
      // domain and mailbox are GENERATED columns — omit them
    })
    .select("id")
    .single();

  if (error) {
    console.error("[email/inbound] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fire-and-forget classification — don't await; cron will catch failures
  const automationSecret = process.env.AUTOMATION_SECRET;
  if (automationSecret) {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    fetch(`${base}/api/inbox/automation/classify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${automationSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batch_size: 1 }),
    }).catch(() => {
      // intentional fire-and-forget — cron will catch failures
    });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}
