import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

  let body: { alert_message?: string; hours?: number } = {};
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { alert_message, hours = 4 } = body;
  if (!alert_message) {
    return NextResponse.json({ error: "alert_message required" }, { status: 400 });
  }

  const hoursNum = Math.max(0.5, Math.min(168, Number(hours) || 4));

  try {
    const snoozeFile = path.join(process.env.HOME ?? "/root", ".arthur", "data", "alerts-snoozed.json");
    let snoozed: Record<string, { until: number }> = {};
    try {
      if (fs.existsSync(snoozeFile)) {
        snoozed = JSON.parse(fs.readFileSync(snoozeFile, "utf8")) as Record<string, { until: number }>;
      }
    } catch { /* ignore parse errors */ }

    const until = Date.now() + hoursNum * 3600000;
    snoozed[alert_message] = { until };

    fs.mkdirSync(path.dirname(snoozeFile), { recursive: true });
    fs.writeFileSync(snoozeFile, JSON.stringify(snoozed, null, 2), "utf8");

    return NextResponse.json({
      ok: true,
      message: alert_message,
      snoozed_until: new Date(until).toISOString(),
      hours: hoursNum,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
