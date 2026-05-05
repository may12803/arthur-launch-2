import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function requireAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.ARTHUR_SECRET;
  return !!secret && authHeader === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();

  const [total, yahoo, blackmarble, drinkswithdabney, pendingApprovals] = await Promise.all([
    db.from("arthur_inbox_emails")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("is_archived", false)
      .eq("is_deleted", false),

    db.from("arthur_inbox_emails")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("is_archived", false)
      .eq("is_deleted", false)
      .ilike("to_email", "%yahoo%"),

    db.from("arthur_inbox_emails")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("is_archived", false)
      .eq("is_deleted", false)
      .ilike("to_email", "%blackmarble%"),

    db.from("arthur_inbox_emails")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("is_archived", false)
      .eq("is_deleted", false)
      .ilike("to_email", "%drinkswithdabney%"),

    db.from("arthur_email_approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return NextResponse.json({
    total:            total.count            ?? 0,
    yahoo:            yahoo.count            ?? 0,
    blackmarble:      blackmarble.count      ?? 0,
    drinkswithdabney: drinkswithdabney.count ?? 0,
    pending_approvals: pendingApprovals.count ?? 0,
    fetched_at:       new Date().toISOString(),
  });
}
