import { NextRequest, NextResponse } from "next/server";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

const NYLAS_BASE = "https://api.us.nylas.com";
const REDIRECT_URI = "https://arthur-online.fly.dev/api/email/connect/callback";

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: { provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const provider = body.provider;
  if (!provider || !["gmail", "microsoft"].includes(provider)) {
    return NextResponse.json({ error: "provider must be gmail or microsoft" }, { status: 400 });
  }

  const clientId = process.env.NYLAS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({
      error: "NYLAS_CLIENT_ID not configured",
      setup_required: true,
      instructions: "Add NYLAS_CLIENT_ID to Fly secrets: fly secrets set NYLAS_CLIENT_ID=<id> -a arthur-online",
    }, { status: 503 });
  }

  const scope = provider === "gmail"
    ? "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar"
    : "Mail.ReadWrite Mail.Send Calendars.ReadWrite";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    provider,
    access_type: "offline",
    scope,
  });

  const auth_url = `${NYLAS_BASE}/v3/connect/auth?${params.toString()}`;
  return NextResponse.json({ auth_url });
}
