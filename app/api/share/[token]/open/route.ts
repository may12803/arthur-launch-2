import { NextRequest, NextResponse } from "next/server";
import { loveleedayAnon, shareSecret } from "@/lib/client-portal/anon";
import { clientIp } from "@/lib/client-portal/api";
import { watermarkPdf, isPdf } from "@/lib/client-portal/watermark";

export const runtime = "nodejs";

const MESSAGES: Record<string, [number, string]> = {
  wrong_code: [400, "That code doesn't match. Check the latest email and try again."],
  code_expired: [400, "That code has expired or was already used. Request a new one."],
  too_many_attempts: [429, "Too many wrong codes. Request a new one."],
  inactive: [410, "This link has expired or been revoked."],
  not_found: [404, "This link isn't valid."],
  integrity: [500, "This file failed its integrity check, so it wasn't opened. Let the person who shared it know."],
};

// Verify the code and deliver the file. The database checks the code, decrypts
// with the owning company's key, verifies the checksum and logs the open;
// PDFs are stamped with the recipient's address and the date.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) return NextResponse.json({ error: MESSAGES.not_found[1] }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);

  const { data, error } = await loveleedayAnon().rpc("share_redeem", {
    p_token: token, p_code: code, p_secret: shareSecret(), p_ip: clientIp(req),
  });
  if (error) return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.status !== "ok") {
    const [status, message] = MESSAGES[row?.status] || MESSAGES.not_found;
    return NextResponse.json({ error: message }, { status });
  }

  let bytes: Buffer = Buffer.from(row.data_b64 as string, "base64");
  const name = String(row.name);
  if (isPdf(name, String(row.content_type))) {
    const stamp = `Shared with ${row.recipient_email} on ${new Date().toISOString().slice(0, 10)} via LOVELEEDAY. Do not forward.`;
    bytes = await watermarkPdf(bytes, stamp);
  }
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-length": String(bytes.length),
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
