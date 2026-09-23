import { NextRequest, NextResponse } from "next/server";
import { loveleedayAnon, shareSecret } from "@/lib/client-portal/anon";
import { sendPortalMail } from "@/lib/client-portal/mailer";

export const runtime = "nodejs";

// Email a one-time code to the link's named recipient. The code is returned
// by the database only to this server (share_issue_code requires the server
// secret) and is never sent back to the browser.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });

  const { data, error } = await loveleedayAnon().rpc("share_issue_code", { p_token: token, p_secret: shareSecret() });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("too many")) return NextResponse.json({ error: "Too many codes requested. Try again in an hour." }, { status: 429 });
    if (m.includes("no longer active")) return NextResponse.json({ error: "This link has expired or been revoked." }, { status: 410 });
    return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  const sent = await sendPortalMail(row.recipient_email, `Your code to open "${row.document_name}"`, [
    `Your one-time code is ${row.code}`,
    `Enter it on the page where you opened the link from ${row.company}. It works once and expires in 10 minutes.`,
  ]);
  if (!sent) return NextResponse.json({ error: "We couldn't send the code. Try again in a minute." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
