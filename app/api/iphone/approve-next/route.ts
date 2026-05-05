import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

  const db = getSupabaseAdmin();

  // Fetch the oldest pending approval with highest priority (priority ASC = most urgent first, then created_at)
  const { data: approval, error } = await db
    .from("arthur_email_approvals")
    .select("id, from_email, from_name, subject, body_excerpt, draft_subject, draft_body, draft_to, created_at, priority")
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !approval) {
    return NextResponse.json({ ok: true, pending: false, message: "No pending approvals — inbox clear." });
  }

  const totalPending = await db
    .from("arthur_email_approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({
    ok: true,
    pending: true,
    total_pending: totalPending.count ?? 0,
    approval: {
      id:            approval.id,
      from:          (approval.from_name as string) || (approval.from_email as string) || "Unknown",
      from_email:    approval.from_email,
      subject:       approval.subject,
      body_excerpt:  approval.body_excerpt,
      draft_subject: approval.draft_subject,
      draft_body:    approval.draft_body,
      draft_to:      approval.draft_to,
      created_at:    approval.created_at,
      priority:      approval.priority,
    },
  });
}
