import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Auth: Bearer ${AUTOMATION_SECRET} — cron-callable

const ALERT_THRESHOLDS = [30, 14, 7, 1] as const;

async function sendTelegram(message: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("[legal/expirations] Telegram not configured — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
    });
    if (!res.ok) {
      console.error("[legal/expirations] Telegram send failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[legal/expirations] Telegram fetch error:", e);
  }
}

export async function GET(req: NextRequest) {
  // Auth gate
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Fetch docs expiring within 30 days
  const { data: docs, error } = await db
    .from("legal_documents")
    .select("id, title, entity, category, expires_at")
    .eq("is_archived", false)
    .not("expires_at", "is", null)
    .gte("expires_at", todayStr)
    .lte("expires_at", in30Days);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!docs || docs.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, alerted: 0 });
  }

  let alertCount = 0;

  for (const doc of docs) {
    const expDate = new Date(doc.expires_at as string);
    const msUntil = expDate.getTime() - today.getTime();
    const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));

    // Find the matching threshold(s)
    const matchingThresholds = ALERT_THRESHOLDS.filter(t => daysUntil <= t);
    if (matchingThresholds.length === 0) continue;

    // The most specific (smallest) threshold that covers this doc
    const threshold = Math.min(...matchingThresholds);

    // Check if we've already sent an alert at this threshold for this doc
    const { data: priorAlerts } = await db
      .from("legal_document_actions")
      .select("id")
      .eq("document_id", doc.id)
      .eq("action", "expire_alert")
      .contains("metadata", { threshold_days: threshold })
      .limit(1);

    if (priorAlerts && priorAlerts.length > 0) continue; // already alerted at this threshold

    // Send Telegram alert
    const entityLabel = (doc.entity as string).replace(/_/g, " ");
    const message = [
      `⚠️ *Legal Document Expiring Soon*`,
      ``,
      `*${doc.title}*`,
      `Entity: ${entityLabel}`,
      `Category: ${(doc.category as string).replace(/_/g, " ")}`,
      `Expires: ${doc.expires_at} (${daysUntil} day${daysUntil === 1 ? "" : "s"})`,
    ].join("\n");

    await sendTelegram(message);

    // Record alert in audit log
    await db.from("legal_document_actions").insert({
      document_id: doc.id,
      action: "expire_alert",
      actor: "system",
      metadata: { threshold_days: threshold, days_until: daysUntil, expires_at: doc.expires_at },
    });

    alertCount++;
  }

  return NextResponse.json({ ok: true, checked: docs.length, alerted: alertCount });
}
