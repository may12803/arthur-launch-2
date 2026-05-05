/**
 * make-call.ts — Outbound voice call stub via Telnyx Call Control.
 * Logs to arthur_communications. Wiring pending TELNYX_VOICE_APPLICATION_ID.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface MakeCallParams {
  to: string;
  from?: string;
  entity?: string;
  category?: string;
}

interface MakeCallResult {
  ok: boolean;
  external_id: string | null;
  error?: string;
}

const TELNYX_CALLS_API = "https://api.telnyx.com/v2/calls";

export async function makeCall(params: MakeCallParams): Promise<MakeCallResult> {
  const apiKey   = process.env.TELNYX_API_KEY;
  const appId    = process.env.TELNYX_VOICE_APPLICATION_ID;
  const fromNum  = params.from ?? process.env.TELNYX_PHONE_NUMBER;

  if (!apiKey || !appId || !fromNum) {
    const missing = [
      !apiKey   && "TELNYX_API_KEY",
      !appId    && "TELNYX_VOICE_APPLICATION_ID",
      !fromNum  && "TELNYX_PHONE_NUMBER",
    ].filter(Boolean).join(", ");
    return { ok: false, external_id: null, error: `missing env: ${missing}` };
  }

  const db  = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: row } = await db
    .from("arthur_communications")
    .insert({
      ts:           now,
      channel:      "voice",
      direction:    "outbound",
      from_address: fromNum,
      to_address:   params.to,
      status:       "queued",
      entity:       params.entity ?? null,
      category:     params.category ?? null,
      metadata:     {},
    })
    .select("id")
    .single();

  const rowId = row?.id ?? null;

  let response: Response;
  try {
    response = await fetch(TELNYX_CALLS_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connection_id:    appId,
        from:             fromNum,
        to:               params.to,
        webhook_url:      "https://arthur-online.fly.dev/api/inbound/voice",
        record_audio:     true,
        record_channels:  "dual",
        transcription:    true,
      }),
    });
  } catch {
    if (rowId) await db.from("arthur_communications").update({ status: "failed" }).eq("id", rowId);
    return { ok: false, external_id: null, error: "network error" };
  }

  const json = await response.json() as { data?: { call_control_id?: string }; errors?: unknown[] };

  if (!response.ok || !json.data?.call_control_id) {
    if (rowId) await db.from("arthur_communications").update({ status: "failed" }).eq("id", rowId);
    return { ok: false, external_id: null, error: JSON.stringify(json.errors ?? json) };
  }

  const externalId = json.data.call_control_id;
  if (rowId) {
    await db.from("arthur_communications")
      .update({ status: "sending", external_id: externalId })
      .eq("id", rowId);
  }

  return { ok: true, external_id: externalId };
}
