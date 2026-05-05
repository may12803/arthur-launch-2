/**
 * POST /api/inbound/fax — Telnyx inbound fax webhook.
 * Downloads the PDF, uploads to arthur-comm-attachments, writes to arthur_communications.
 * If sender matches a government domain pattern, also triggers legal vault upload.
 * Fails closed: invalid/missing signature → 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyTelnyxSignature } from "@/lib/telnyx/sign-verify";

export const runtime = "nodejs";

// Government/regulatory sender patterns — auto-forward to legal vault
const GOV_SENDER_PATTERNS = [
  /michigan/i,
  /mdard/i,
  /treasury/i,
  /county.*health/i,
  /health.*county/i,
  /dept.*revenue/i,
  /revenue.*dept/i,
  /kalamazoo.*county/i,
  /\bliquor\b.*control/i,
  /\bmlcc\b/i,
  /irs\.gov/i,
  /state\.mi\.us/i,
];

function isGovernmentSender(from: string): boolean {
  return GOV_SENDER_PATTERNS.some(p => p.test(from));
}

interface TelnyxFaxEvent {
  data: {
    event_type: string;
    payload: {
      fax_id?:           string;
      from?:             string;
      to?:               string;
      media_url?:        string;
      page_count?:       number;
      quality?:          string;
      status?:           string;
      cost?:             { amount?: string };
    };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const sig     = req.headers.get("Telnyx-Signature-Ed25519");
  const ts      = req.headers.get("Telnyx-Timestamp");

  if (!verifyTelnyxSignature(rawBody, sig, ts)) {
    console.warn("[inbound/fax] signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  let event: TelnyxFaxEvent;
  try {
    event = JSON.parse(rawBody) as TelnyxFaxEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { event_type, payload } = event.data ?? {};

  if (event_type !== "fax.received") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const from      = payload?.from ?? "";
  const to        = payload?.to ?? "";
  const faxId     = payload?.fax_id ?? "";
  const mediaUrl  = payload?.media_url;
  const costRaw   = parseFloat(payload?.cost?.amount ?? "0");
  const costCents = isNaN(costRaw) ? 0 : Math.round(costRaw * 100);
  const isGov     = isGovernmentSender(from);
  const category  = isGov ? "government" : "other";

  const db = getSupabaseAdmin();

  let storedPath: string | null = null;
  let extractedText: string | null = null;

  // Download and store the fax PDF
  if (mediaUrl) {
    try {
      const apiKey = process.env.TELNYX_API_KEY;
      const dlRes  = await fetch(mediaUrl, {
        headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
      });

      if (dlRes.ok) {
        const buffer  = await dlRes.arrayBuffer();
        const path    = `fax/${faxId}.pdf`;
        const { error: upErr } = await db.storage
          .from("arthur-comm-attachments")
          .upload(path, Buffer.from(buffer), {
            contentType: "application/pdf",
            upsert: true,
          });

        if (!upErr) {
          storedPath = path;

          // If government sender, also trigger legal vault pipeline via internal call
          // (reuses the extract pipeline without importing from app/api to avoid circular deps)
          if (isGov) {
            try {
              const legalRes = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL ?? "https://arthur-online.fly.dev"}/api/legal/upload`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/pdf", "X-Filename": `fax-${faxId}.pdf` },
                  body: Buffer.from(buffer),
                }
              );
              if (!legalRes.ok) {
                console.warn("[inbound/fax] legal vault upload failed:", legalRes.status);
              }
            } catch (err) {
              console.warn("[inbound/fax] legal vault call error:", err);
            }
          }
        }
      }
    } catch (err) {
      console.error("[inbound/fax] PDF download/upload error:", err);
    }
  }

  const { error: insertErr } = await db.from("arthur_communications").insert({
    ts:             new Date().toISOString(),
    channel:        "fax",
    direction:      "inbound",
    from_address:   from,
    to_address:     to,
    body:           extractedText,
    attachment_url: storedPath,
    status:         "received",
    external_id:    faxId,
    cost_cents:     costCents,
    category,
    metadata: {
      page_count:  payload?.page_count ?? null,
      quality:     payload?.quality ?? null,
      gov_sender:  isGov,
    },
  });

  if (insertErr) {
    console.error("[inbound/fax] DB insert error:", insertErr.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
