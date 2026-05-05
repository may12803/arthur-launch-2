/**
 * send-sms.ts — Outbound SMS via Telnyx. Logs every send to arthur_communications.
 * Fails closed if TELNYX_API_KEY or TELNYX_MESSAGING_PROFILE_ID are missing.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface SendSmsParams {
  to: string;
  body: string;
  entity?: string;
  category?: string;
  from?: string; // defaults to TELNYX_PHONE_NUMBER
}

interface SendSmsResult {
  ok: boolean;
  external_id: string | null;
  error?: string;
}

const TELNYX_API = "https://api.telnyx.com/v2/messages";

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const apiKey    = process.env.TELNYX_API_KEY;
  const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const fromNum   = params.from ?? process.env.TELNYX_PHONE_NUMBER;

  if (!apiKey || !profileId || !fromNum) {
    const missing = [
      !apiKey    && "TELNYX_API_KEY",
      !profileId && "TELNYX_MESSAGING_PROFILE_ID",
      !fromNum   && "TELNYX_PHONE_NUMBER",
    ].filter(Boolean).join(", ");
    console.error(`[send-sms] missing env vars: ${missing}`);
    return { ok: false, external_id: null, error: `missing env: ${missing}` };
  }

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Insert queued row optimistically — status updates on callback
  const { data: insertedRow, error: insertErr } = await db
    .from("arthur_communications")
    .insert({
      ts:           now,
      channel:      "sms",
      direction:    "outbound",
      from_address: fromNum,
      to_address:   params.to,
      body:         params.body,
      status:       "queued",
      entity:       params.entity ?? null,
      category:     params.category ?? null,
      metadata:     {},
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[send-sms] DB insert error:", insertErr.message);
  }

  const rowId = insertedRow?.id ?? null;

  // Send via Telnyx
  let response: Response;
  try {
    response = await fetch(TELNYX_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:                    fromNum,
        to:                      params.to,
        text:                    params.body,
        messaging_profile_id:    profileId,
        webhook_failover_url:    null,
        use_profile_webhooks:    true,
      }),
    });
  } catch (err) {
    console.error("[send-sms] network error:", err);
    if (rowId) {
      await db.from("arthur_communications").update({ status: "failed" }).eq("id", rowId);
    }
    return { ok: false, external_id: null, error: "network error sending to Telnyx" };
  }

  const json = await response.json() as { data?: { id?: string }; errors?: unknown[] };

  if (!response.ok || !json.data?.id) {
    const errMsg = JSON.stringify(json.errors ?? json);
    console.error("[send-sms] Telnyx error:", errMsg);
    if (rowId) {
      await db.from("arthur_communications")
        .update({ status: "failed", metadata: { telnyx_error: json.errors } })
        .eq("id", rowId);
    }
    return { ok: false, external_id: null, error: errMsg };
  }

  const externalId = json.data.id;

  if (rowId) {
    await db.from("arthur_communications")
      .update({ status: "sending", external_id: externalId })
      .eq("id", rowId);
  }

  return { ok: true, external_id: externalId };
}
