import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Receives Content-Security-Policy-Report-Only violations (next.config.mjs) and logs a compact line per report, so the
// policy can be tuned from the Fly logs before it is enforced. Bodies are capped; nothing is stored.
export async function POST(req: NextRequest) {
  const raw = (await req.text().catch(() => "")).slice(0, 8000);
  try {
    const body = JSON.parse(raw);
    const r = body["csp-report"] ?? body?.[0]?.body ?? body;
    console.warn("[csp-report]", JSON.stringify({
      page: r["document-uri"] ?? r.documentURL, directive: r["violated-directive"] ?? r.effectiveDirective, blocked: r["blocked-uri"] ?? r.blockedURL,
    }));
  } catch {
    console.warn("[csp-report] unparseable report", raw.length);
  }
  return new NextResponse(null, { status: 204 });
}
