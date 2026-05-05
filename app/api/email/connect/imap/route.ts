import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

const NYLAS_BASE = "https://api.us.nylas.com";

// IMAP defaults by provider
const IMAP_DEFAULTS: Record<string, { imap_host: string; imap_port: number; smtp_host: string; smtp_port: number }> = {
  yahoo:     { imap_host: "imap.mail.yahoo.com", imap_port: 993, smtp_host: "smtp.mail.yahoo.com", smtp_port: 465 },
  aol:       { imap_host: "imap.aol.com",        imap_port: 993, smtp_host: "smtp.aol.com",        smtp_port: 465 },
  gmail:     { imap_host: "imap.gmail.com",       imap_port: 993, smtp_host: "smtp.gmail.com",      smtp_port: 587 },
  outlook:   { imap_host: "outlook.office365.com",imap_port: 993, smtp_host: "smtp.office365.com",  smtp_port: 587 },
};

function detectProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain.includes("yahoo")) return "yahoo";
  if (domain.includes("aol"))   return "aol";
  if (domain.includes("gmail")) return "gmail";
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) return "outlook";
  return "other";
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: {
    email?: string;
    password?: string;
    imap_host?: string;
    imap_port?: number;
    smtp_host?: string;
    smtp_port?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const nylasApiKey = process.env.NYLAS_API_KEY;
  if (!nylasApiKey) {
    return NextResponse.json({ error: "NYLAS_API_KEY not configured" }, { status: 503 });
  }

  const clientId = process.env.NYLAS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({
      error: "NYLAS_CLIENT_ID not configured",
      setup_required: true,
    }, { status: 503 });
  }

  const detectedProvider = detectProvider(email);
  const defaults = IMAP_DEFAULTS[detectedProvider] ?? IMAP_DEFAULTS.yahoo;

  const imapHost = body.imap_host ?? defaults.imap_host;
  const imapPort = body.imap_port ?? defaults.imap_port;
  const smtpHost = body.smtp_host ?? defaults.smtp_host;
  const smtpPort = body.smtp_port ?? defaults.smtp_port;

  // Call Nylas custom auth (IMAP)
  const customAuthPayload = {
    provider: "imap",
    settings: {
      imap_username: email,
      imap_password: password,
      imap_host: imapHost,
      imap_port: imapPort,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
    },
  };

  const nylasRes = await fetch(`${NYLAS_BASE}/v3/connect/custom`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nylasApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(customAuthPayload),
  });

  if (!nylasRes.ok) {
    const txt = await nylasRes.text();
    console.error("[connect/imap] Nylas custom auth failed:", txt.slice(0, 300));
    return NextResponse.json({
      error: "IMAP connection failed",
      details: txt.slice(0, 200),
    }, { status: 502 });
  }

  const nylasData = await nylasRes.json() as { id?: string; email?: string; grant_id?: string };
  const grantId = nylasData.id ?? nylasData.grant_id;

  if (!grantId) {
    return NextResponse.json({ error: "no grant_id returned by Nylas" }, { status: 502 });
  }

  // Insert into arthur_email_accounts
  const db = getSupabaseAdmin();
  const { error: upsertErr } = await db
    .from("arthur_email_accounts")
    .upsert({
      email,
      provider: "imap",
      grant_id: grantId,
      display_name: email,
      connected_at: new Date().toISOString(),
      is_active: true,
      metadata: {
        imap_host: imapHost,
        imap_port: imapPort,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        detected_provider: detectedProvider,
      },
    }, { onConflict: "email" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email, grant_id: grantId, provider: "imap" });
}
