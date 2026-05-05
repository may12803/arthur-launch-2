import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data: goal, error } = await db
    .from("arthur_goals")
    .update({
      status:            "approved",
      approved_at:       new Date().toISOString(),
      approved_by:       "daniel",
      arthur_can_execute: true,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!goal)  return NextResponse.json({ error: "not found" }, { status: 404 });

  // Telegram notification (best-effort — don't fail if missing)
  try {
    const telegramToken  = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    if (telegramToken && telegramChatId) {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text:    `approved: ${goal.title as string}. starting execution.`,
        }),
      });
    }
  } catch {
    // ignore
  }

  return NextResponse.json(goal);
}
