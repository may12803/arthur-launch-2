import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { archiveMessage } from "@/lib/nylas";

export const runtime = "nodejs";

interface SentArchiveBody {
  approval_id: string;
}

/**
 * POST /api/email/approve/sent-archive
 *
 * After an approval is sent, call this to archive the source Yahoo message.
 * Body: { approval_id: string }
 * Returns: { ok: boolean, archived?: boolean, error?: string }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret1 = process.env.AUTOMATION_SECRET;
  const secret2 = process.env.ARTHUR_SECRET;
  if (
    (!secret1 || authHeader !== `Bearer ${secret1}`) &&
    (!secret2 || authHeader !== `Bearer ${secret2}`)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SentArchiveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { approval_id } = body;
  if (!approval_id) {
    return NextResponse.json({ error: "approval_id required" }, { status: 400 });
  }

  const nylasApiKey = process.env.NYLAS_API_KEY;
  if (!nylasApiKey) {
    return NextResponse.json({ error: "NYLAS_API_KEY not set" }, { status: 500 });
  }

  const db = getSupabaseAdmin();

  const { data: approval, error: fetchErr } = await db
    .from("arthur_email_approvals")
    .select("yahoo_msg_id")
    .eq("id", approval_id)
    .single();

  if (fetchErr || !approval?.yahoo_msg_id) {
    return NextResponse.json({ error: "approval not found or no yahoo_msg_id" }, { status: 404 });
  }

  // Resolve grant_id for this message via arthur_email_accounts or use the default Yahoo grant
  const grantId = process.env.NYLAS_GRANT_YAHOO || "bccc3ee8-42a4-4acd-8663-ac0533d90135";

  const archiveErr = await archiveMessage(approval.yahoo_msg_id, grantId, nylasApiKey);
  if (archiveErr) {
    console.error(`[sent-archive] archive failed for approval ${approval_id}: ${archiveErr}`);
    return NextResponse.json({ ok: false, archived: false, error: archiveErr });
  }

  return NextResponse.json({ ok: true, archived: true });
}
