/**
 * POST /api/inbound/voice — Telnyx call-control webhook.
 * Handles: call.initiated, call.recording.saved, call.hangup.
 * Uploads recordings to arthur-comm-attachments bucket.
 * Fails closed: invalid/missing signature → 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyTelnyxSignature } from "@/lib/telnyx/sign-verify";

export const runtime = "nodejs";

interface TelnyxCallEvent {
  data: {
    event_type: string;
    payload: {
      call_control_id?: string;
      call_leg_id?:     string;
      call_session_id?: string;
      from?:            string;
      to?:              string;
      direction?:       string;
      recording_url?:   string;
      transcription_data?: {
        transcription_text?: string;
      };
      hangup_cause?: string;
    };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const sig     = req.headers.get("Telnyx-Signature-Ed25519");
  const ts      = req.headers.get("Telnyx-Timestamp");

  if (!verifyTelnyxSignature(rawBody, sig, ts)) {
    console.warn("[inbound/voice] signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  let event: TelnyxCallEvent;
  try {
    event = JSON.parse(rawBody) as TelnyxCallEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { event_type, payload } = event.data ?? {};
  const callId = payload?.call_control_id ?? payload?.call_session_id ?? "";
  const from   = payload?.from ?? "";
  const to     = payload?.to ?? "";

  const db = getSupabaseAdmin();

  switch (event_type) {
    case "call.initiated": {
      const direction = payload?.direction === "outbound" ? "outbound" : "inbound";
      // Insert a new call row — will be updated on recording/hangup
      await db.from("arthur_communications").insert({
        ts:           new Date().toISOString(),
        channel:      "voice",
        direction,
        from_address: from,
        to_address:   to,
        status:       "received",
        external_id:  callId,
        metadata:     { call_leg_id: payload?.call_leg_id },
      });
      break;
    }

    case "call.recording.saved": {
      const recordingUrl = payload?.recording_url;
      let storedUrl: string | null = null;

      // Download recording and re-upload to our bucket
      if (recordingUrl) {
        try {
          const dlRes = await fetch(recordingUrl, {
            headers: { "Authorization": `Bearer ${process.env.TELNYX_API_KEY}` },
          });
          if (dlRes.ok) {
            const buffer = await dlRes.arrayBuffer();
            const ext    = recordingUrl.includes(".mp3") ? "mp3" : "wav";
            const path   = `voice/${callId}.${ext}`;
            const { error: upErr } = await db.storage
              .from("arthur-comm-attachments")
              .upload(path, Buffer.from(buffer), {
                contentType: ext === "mp3" ? "audio/mpeg" : "audio/wav",
                upsert: true,
              });
            if (!upErr) storedUrl = path;
          }
        } catch (err) {
          console.error("[inbound/voice] recording upload error:", err);
        }
      }

      const transcript = payload?.transcription_data?.transcription_text ?? null;

      await db.from("arthur_communications")
        .update({
          body:           transcript,
          attachment_url: storedUrl,
          metadata:       {
            recording_url: recordingUrl,
            transcription_status: transcript ? "complete" : "pending",
          },
        })
        .eq("external_id", callId);

      break;
    }

    case "call.hangup": {
      await db.from("arthur_communications")
        .update({
          status: "received",
          metadata: { hangup_cause: payload?.hangup_cause },
        })
        .eq("external_id", callId);
      break;
    }

    default:
      // Acknowledge but don't process unknown event types
      return NextResponse.json({ ok: true, skipped: true });
  }

  return NextResponse.json({ ok: true });
}
