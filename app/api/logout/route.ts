import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function clear(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set("arthur_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
export async function POST(req: NextRequest) { return clear(req); }
export async function GET(req: NextRequest) { return clear(req); }
