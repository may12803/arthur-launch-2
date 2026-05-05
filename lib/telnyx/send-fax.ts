/**
 * send-fax.ts — Outbound fax via Telnyx. Logs to arthur_communications.
 * Requires TELNYX_FAX_CONNECTION_ID to be provisioned (pending Daniel's setup).
 * Fails closed if env vars are missing.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface SendFaxParams {
  to: string;
  mediaUrl: string;       // publicly accessible PDF URL
  from?: string;          // defaults to TELNYX_PHONE_NUMBER
  subject?: string;
  entity?: string;
  category?: string;
}

interface SendFaxResult {
  ok: boolean;
  external_id: string | null;
  error?: string;
}

const TELNYX_FAX_API = "https://api.telnyx.com/v2/faxes";

export async function sendFax(params: SendFaxParams): Promise<SendFaxResult> {
  const apiKey       = process.env.TELNYX_API_KEY;
  const connectionId = process.env.TELNYX_FAX_CONNECTION_ID;
  const fromNum      = params.from ?? process.env.TELNYX_PHONE_NUMBER;

  if (!apiKey || !connectionId || !fromNum) {
    const missing = [
      !apiKey        && "TELNYX_API_KEY",
      !connectionId  && "TELNYX_FAX_CONNECTION_ID",
      !fromNum       && "TELNYX_PHONE_NUMBER",
    ].filter(Boolean).join(", ");
    console.error(`[send-fax] missing env vars: ${missing}`);
    return { ok: false, external_id: null, error: `missing env: ${missing}` };
  }

  const db  = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: insertedRow, error: insertErr } = await db
    .from("arthur_communications")
    .insert({
      ts:           now,
      channel:      "fax",
      direction:    "outbound",
      from_address: fromNum,
      to_address:   params.to,
      subject:      params.subject ?? null,
      attachment_url: params.mediaUrl,
      status:       "queued",
      entity:       params.entity ?? null,
      category:     params.category ?? null,
      metadata:     {},
    })
    .select("id")
    .single();

  if (insertErr) console.error("[send-fax] DB insert error:", insertErr.message);
  const rowId = insertedRow?.id ?? null;

  let response: Response;
  try {
    response = await fetch(TELNYX_FAX_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connection_id: connectionId,
        from:          fromNum,
        to:            params.to,
        media_url:     params.mediaUrl,
      }),
    });
  } catch (err) {
    if (rowId) {
      await db.from("arthur_communications").update({ status: "failed" }).eq("id", rowId);
    }
    return { ok: false, external_id: null, error: "network error sending to Telnyx" };
  }

  const json = await response.json() as { data?: { id?: string }; errors?: unknown[] };

  if (!response.ok || !json.data?.id) {
    if (rowId) {
      await db.from("arthur_communications")
        .update({ status: "failed", metadata: { telnyx_error: json.errors } })
        .eq("id", rowId);
    }
    return { ok: false, external_id: null, error: JSON.stringify(json.errors ?? json) };
  }

  const externalId = json.data.id;
  if (rowId) {
    await db.from("arthur_communications")
      .update({ status: "sending", external_id: externalId })
      .eq("id", rowId);
  }

  return { ok: true, external_id: externalId };
}
