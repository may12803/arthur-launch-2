import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function requireAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.ARTHUR_SECRET;
  return !!secret && authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { title?: string; description?: string; due_iso?: string } = {};
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  // Proxy to the goals POST route
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://arthur-online.fly.dev";
  const proxyRes = await fetch(`${siteUrl}/api/goals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title:       body.title.trim(),
      description: body.description ?? undefined,
      due_iso:     body.due_iso ?? undefined,
      priority:    3,
    }),
  });

  const json = await proxyRes.json().catch(() => ({ error: "invalid response" }));
  return NextResponse.json(json, { status: proxyRes.status });
}
