import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

interface ReplyBody {
  to: string;
  subject?: string;
  text: string;
  from_alias?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;

  let body: ReplyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.to || !body.text) {
    return NextResponse.json({ error: "to and text are required" }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 503 });
  }

  const db = getSupabaseAdmin();

  // Fetch the source email to determine the FROM address
  const { data: src, error: srcError } = await db
    .from("arthur_inbox_emails")
    .select("to_email,subject")
    .eq("id", id)
    .single();

  if (srcError) {
    const status = srcError.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: srcError.message }, { status });
  }

  const fromEmail = body.from_alias ?? (src.to_email as string);
  const replySubject = body.subject ?? `Re: ${(src.subject as string) ?? ""}`;

  // Send via Resend REST API
  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [body.to],
      subject: replySubject,
      text: body.text,
    }),
  });

  const resendData = (await resendResp.json()) as { id?: string; message?: string };
  if (!resendResp.ok) {
    console.error("[inbox/reply] Resend error:", resendData);
    return NextResponse.json(
      { error: resendData.message ?? "send failed", detail: resendData },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();

  // Persist the outbound message as a Sent row
  await db.from("arthur_inbox_emails").insert({
    direction: "outbound",
    from_email: fromEmail,
    to_email: body.to,
    subject: replySubject,
    body_text: body.text,
    received_at: now,
    is_read: true,
    in_reply_to: id,
    raw_headers: { "x-resend-id": resendData.id ?? "" },
  });

  // Mark replied_at on source (inbound) row
  await db
    .from("arthur_inbox_emails")
    .update({ replied_at: now })
    .eq("id", id);

  return NextResponse.json({ ok: true, resend_id: resendData.id });
}
