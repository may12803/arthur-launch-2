import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTOMATION_SECRET not configured" }, { status: 503 });
  }

  // Accept either the header (external callers) or the query param (launchd curl convenience)
  const auth = req.headers.get("authorization") ?? "";
  const querySecret = new URL(req.url).searchParams.get("secret") ?? "";
  if (auth !== `Bearer ${secret}` && querySecret !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };

  // Step 1: classify
  const classifyResp = await fetch(`${base}/api/inbox/automation/classify`, {
    method: "POST",
    headers,
  });
  const classifyResult = classifyResp.ok ? await classifyResp.json() : { error: await classifyResp.text() };

  // Step 2: apply rules (always runs even if classify had errors — backlog may already be classified)
  const applyResp = await fetch(`${base}/api/inbox/automation/apply-rules`, {
    method: "POST",
    headers,
  });
  const applyResult = applyResp.ok ? await applyResp.json() : { error: await applyResp.text() };

  return NextResponse.json({
    ok: true,
    tick_at: new Date().toISOString(),
    classify: classifyResult,
    apply_rules: applyResult,
  });
}
