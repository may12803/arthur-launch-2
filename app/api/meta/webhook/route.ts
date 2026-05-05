import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// ── Meta signature validation ─────────────────────────────────────────────────
function verifyMetaSignature(rawBody: string, sigHeader: string | null, appSecret: string): boolean {
  if (!sigHeader) return false;
  // Meta sends "sha256=<hex>"
  const [algo, expected] = sigHeader.split("=");
  if (algo !== "sha256" || !expected) return false;
  const hmac = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ── GET — Meta webhook verification ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.META_VERIFY_TOKEN;

  if (!expectedToken) {
    console.error("[meta/webhook] META_VERIFY_TOKEN not set");
    return new NextResponse("Webhook not configured", { status: 503 });
  }

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[meta/webhook] Verified by Meta");
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  console.warn("[meta/webhook] Verification failed — token mismatch");
  return new NextResponse("Forbidden", { status: 403 });
}

// ── POST — inbound message handler ───────────────────────────────────────────

interface MetaEntry {
  id: string;
  messaging?: MetaMessagingEvent[];
}

interface MetaMessagingEvent {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid:  string;
    text: string;
  };
  postback?: {
    title:   string;
    payload: string;
  };
}

interface MetaWebhookPayload {
  object: string;
  entry:  MetaEntry[];
}

export async function POST(req: NextRequest) {
  // Validate Meta signature when APP_SECRET is configured
  const rawBody = await req.text();
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, sig, appSecret)) {
      console.warn("[meta/webhook] signature mismatch — dropping request");
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Meta sends object = "page" for Messenger events
  if (payload.object !== "page") {
    return NextResponse.json({ received: true });
  }

  const db = getSupabaseAdmin();

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;

    // Look up page token for auto-response
    const { data: pageRow } = await db
      .from("arthur_meta_pages")
      .select("page_access_token, page_name")
      .eq("page_id", pageId)
      .single();

    for (const event of entry.messaging ?? []) {
      const senderId   = event.sender.id;
      const messageText = event.message?.text ?? event.postback?.title ?? null;

      if (!messageText) continue;
      if (senderId === pageId) continue; // Skip echo of our own sends

      console.log(`[meta/webhook] inbound from ${senderId} on page ${pageId}: ${messageText.slice(0, 80)}`);

      // Insert inbound message
      const { data: inserted, error: insertErr } = await db
        .from("arthur_meta_messages")
        .insert({
          page_id:      pageId,
          sender_id:    senderId,
          sender_name:  null,
          message_text: messageText,
          direction:    "inbound",
          requires_review: false,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("[meta/webhook] insert error:", insertErr.message);
        continue;
      }

      // Auto-respond if we have a page token and Anthropic key
      if (pageRow?.page_access_token && process.env.ANTHROPIC_API_KEY) {
        const responseText = await generateAutoResponse(messageText, pageRow.page_name ?? "our page");

        if (responseText) {
          const sent = await sendFacebookMessage(pageId, senderId, responseText, pageRow.page_access_token);

          if (sent) {
            // Record outbound
            await db.from("arthur_meta_messages").insert({
              page_id:      pageId,
              sender_id:    pageId,
              sender_name:  pageRow.page_name,
              message_text: responseText,
              direction:    "outbound",
              responded_at: new Date().toISOString(),
            });

            // Update inbound with response ref
            await db
              .from("arthur_meta_messages")
              .update({ responded_at: new Date().toISOString(), response_text: responseText })
              .eq("id", inserted.id);
          } else {
            // Could not auto-send — flag for review
            await db
              .from("arthur_meta_messages")
              .update({ requires_review: true })
              .eq("id", inserted.id);
          }
        }
      } else {
        // No token or AI key — flag every message for manual review
        await db
          .from("arthur_meta_messages")
          .update({ requires_review: true })
          .eq("id", inserted.id);
      }
    }
  }

  // Always return 200 — Meta retries if it doesn't receive 200
  return NextResponse.json({ received: true });
}

// ── Auto-response via Anthropic Haiku ────────────────────────────────────────

async function generateAutoResponse(userMessage: string, pageName: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5",
        max_tokens: 300,
        system: `You are a friendly, professional social media assistant for ${pageName}.
Respond to customer messages warmly and helpfully.
Keep responses concise (2-3 sentences max).
For inquiries about hours, reservations, or events, let them know someone will follow up.
Never make up specific hours, prices, or availability.`,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      console.error("[meta/webhook] Anthropic error:", res.status);
      return null;
    }

    const data = await res.json() as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? null;
  } catch (err) {
    console.error("[meta/webhook] auto-response error:", (err as Error).message);
    return null;
  }
}

// ── Send message via Facebook Graph API ──────────────────────────────────────

async function sendFacebookMessage(
  pageId: string,
  recipientId: string,
  text: string,
  pageToken: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/messages?access_token=${pageToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message:   { text },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[meta/webhook] FB send error:", res.status, err.slice(0, 200));
      return false;
    }

    return true;
  } catch (err) {
    console.error("[meta/webhook] FB send exception:", (err as Error).message);
    return false;
  }
}
