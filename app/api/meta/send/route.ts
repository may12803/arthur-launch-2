import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

interface SendBody {
  page_id:   string;
  sender_id: string;
  message:   string;
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: SendBody;
  try {
    body = await req.json() as SendBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { page_id, sender_id, message } = body;

  if (!page_id || !sender_id || !message?.trim()) {
    return NextResponse.json({ error: "page_id, sender_id, message required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Get page token
  const { data: page, error: pageErr } = await db
    .from("arthur_meta_pages")
    .select("page_access_token, page_name")
    .eq("page_id", page_id)
    .single();

  if (pageErr || !page) {
    return NextResponse.json({ error: "Page not found or not connected" }, { status: 404 });
  }

  // Send via Facebook Graph API
  const fbRes = await fetch(
    `https://graph.facebook.com/v19.0/${page_id}/messages?access_token=${page.page_access_token}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        recipient: { id: sender_id },
        message:   { text: message.trim() },
      }),
    }
  );

  if (!fbRes.ok) {
    const err = await fbRes.text();
    return NextResponse.json({ error: `Facebook API error: ${err.slice(0, 200)}` }, { status: 502 });
  }

  // Log outbound
  await db.from("arthur_meta_messages").insert({
    page_id,
    sender_id:    page_id,
    sender_name:  page.page_name,
    message_text: message.trim(),
    direction:    "outbound",
    responded_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
