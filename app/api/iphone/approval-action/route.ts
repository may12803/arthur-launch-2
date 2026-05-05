import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

// Verify HMAC callback token (for Pushcut action button URLs)
// Token format: <hmac_hex>:<hourTs>
function verifyCallbackToken(action: string, approvalId: string, token: string): boolean {
  const secret = process.env.ARTHUR_SECRET ?? "";
  const parts  = token.split(":");
  if (parts.length !== 2) return false;
  const [hmac, hourTsStr] = parts;
  const hourTs  = parseInt(hourTsStr, 10);
  if (isNaN(hourTs)) return false;
  const nowHour = Math.floor(Date.now() / 3600000);
  if (nowHour - hourTs > 48) return false;
  const payload  = `${action}:${approvalId}:${hourTs}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Auth: Bearer token (Shortcut) OR signed nonce in query (Pushcut callback)
  const authHeader = req.headers.get("authorization") ?? "";
  const secret     = process.env.ARTHUR_SECRET ?? "";
  const bearerOk   = authHeader === `Bearer ${secret}`;

  // Pushcut callback token in query params
  const { searchParams } = new URL(req.url);
  const qToken     = searchParams.get("token") ?? "";
  const qAction    = searchParams.get("action") ?? "";
  const qApproval  = searchParams.get("approval_id") ?? "";
  const nonceOk    = qToken && qAction && qApproval && verifyCallbackToken(qAction, qApproval, qToken);

  if (!bearerOk && !nonceOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Body can come from JSON (shortcut) OR query params (Pushcut GET-style callback)
  let body: { approval_id?: string; action?: string; edited_body?: string } = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = await req.json() as typeof body;
    }
  } catch { /* ignore — will fall through to query params */ }

  const approval_id  = body.approval_id  || qApproval;
  const action       = body.action       || qAction;
  const edited_body  = body.edited_body;

  if (!approval_id || !action) {
    return NextResponse.json({ error: "approval_id and action required" }, { status: 400 });
  }

  // Proxy to the main approve route logic
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://arthur-online.fly.dev";
  const proxyRes = await fetch(`${siteUrl}/api/email/approve`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${secret}`,
    },
    body: JSON.stringify({ approval_id, action, edited_body }),
  });

  const json = await proxyRes.json().catch(() => ({ error: "invalid response" }));
  return NextResponse.json(json, { status: proxyRes.status });
}

// Also handle GET (Pushcut action button URLs are GET requests)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token      = searchParams.get("token") ?? "";
  const action     = searchParams.get("action") ?? "";
  const approvalId = searchParams.get("approval_id") ?? "";
  const secret     = process.env.ARTHUR_SECRET ?? "";

  if (!token || !action || !approvalId || !verifyCallbackToken(action, approvalId, token)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://arthur-online.fly.dev";
  const proxyRes = await fetch(`${siteUrl}/api/email/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${secret}`,
    },
    body: JSON.stringify({ approval_id: approvalId, action }),
  });

  const json = await proxyRes.json().catch(() => ({})) as Record<string, unknown>;

  // Return a simple success page that Pushcut shows in its browser view
  const status = json.status ?? "done";
  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#111;color:#fff">
      <h2 style="color:#22c55e">✓ ${action} — ${status}</h2>
      <p>Arthur handled it.</p>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
