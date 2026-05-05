import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function requireAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.ARTHUR_SECRET;
  return !!secret && authHeader === `Bearer ${secret}`;
}

async function sendTestPushcut(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const body = {
    title: "Arthur connected",
    text:  "Your iPhone and Arthur are linked. Notifications will appear here.",
  };
  try {
    const res = await fetch("https://api.pushcut.io/v1/notifications/arthur-action", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Pushcut API ${res.status}: ${txt}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function POST(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { api_key?: string } = {};
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const apiKey = body.api_key?.trim();
  if (!apiKey || apiKey.length < 10) {
    return NextResponse.json({ error: "valid api_key required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Upsert into arthur_secrets (key = 'pushcut_api_key')
  const { error: upsertErr } = await db
    .from("arthur_secrets")
    .upsert({ key: "pushcut_api_key", value: apiKey, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (upsertErr) {
    // Table might not exist yet — try to create and retry once
    await db.rpc("exec_sql", {
      sql: `CREATE TABLE IF NOT EXISTS arthur_secrets (
        key text primary key,
        value text not null,
        updated_at timestamptz default now()
      );`,
    });

    const { error: retryErr } = await db
      .from("arthur_secrets")
      .upsert({ key: "pushcut_api_key", value: apiKey, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (retryErr) {
      return NextResponse.json({ ok: false, error: retryErr.message }, { status: 500 });
    }
  }

  // Fire test notification
  const testResult = await sendTestPushcut(apiKey);

  return NextResponse.json({
    ok:         true,
    saved:      true,
    test_sent:  testResult.ok,
    test_error: testResult.error ?? null,
    message:    testResult.ok
      ? "Pushcut connected — test notification sent to your iPhone."
      : `API key saved but test notification failed: ${testResult.error}`,
  });
}
