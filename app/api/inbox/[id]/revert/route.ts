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

  // Fetch the email to know what was done
  const { data: email, error: emailErr } = await db
    .from("arthur_inbox_emails")
    .select("id,auto_action,is_archived,is_deleted,requires_review,draft_subject,draft_body,draft_to")
    .eq("id", id)
    .single();

  if (emailErr) {
    const status = emailErr.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: emailErr.message }, { status });
  }

  if (!email.auto_action || email.auto_action === "none") {
    return NextResponse.json({ error: "no auto_action to revert" }, { status: 400 });
  }

  // Build the undo patch
  const patch: Record<string, unknown> = {
    auto_action: null,
    auto_action_at: null,
    requires_review: false,
  };

  if (email.auto_action === "archive") {
    patch.is_archived = false;
  } else if (email.auto_action === "delete") {
    patch.is_deleted = false;
  } else if (email.auto_action === "draft") {
    patch.draft_subject = null;
    patch.draft_body = null;
    patch.draft_to = null;
  }
  // "flag" reverts just require_review=false (already in patch)

  const { data: updated, error: updateErr } = await db
    .from("arthur_inbox_emails")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Mark the most recent non-reverted audit action for this email as reverted
  const now = new Date().toISOString();
  await db
    .from("arthur_inbox_actions")
    .update({ reverted: true, reverted_at: now })
    .eq("email_id", id)
    .eq("reverted", false)
    .order("created_at", { ascending: false })
    .limit(1);

  return NextResponse.json(updated);
}
