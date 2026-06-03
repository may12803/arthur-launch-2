import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

// Session token derived from server-only secrets — an attacker can't forge it
// without ARTHUR_ONLINE_PASSWORD + ARTHUR_SECRET. Mirror of middleware's edge
// computation (crypto.subtle) so the cookie validates on every request.
function sessionToken(user: string, pass: string): string {
  const secret = process.env.ARTHUR_SECRET || pass;
  return crypto.createHash("sha256").update(`${user}:${pass}:${secret}`).digest("hex");
}

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string } = {};
  try { body = await req.json(); } catch {}

  const expectedUser = process.env.ARTHUR_ONLINE_USER || "daniel";
  const expectedPass = process.env.ARTHUR_ONLINE_PASSWORD;
  if (!expectedPass) {
    return NextResponse.json({ error: "auth not configured on the server" }, { status: 500 });
  }

  const user = (body.username || expectedUser).trim();
  const pass = body.password || "";
  if (user !== expectedUser || pass !== expectedPass) {
    return NextResponse.json({ error: "That password didn't match." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("arthur_session", sessionToken(expectedUser, expectedPass), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
