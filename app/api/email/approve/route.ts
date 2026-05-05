import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { archiveMessage } from "@/lib/nylas";
import { logCorrection } from "@/lib/superlearner/decisions";

export const runtime = "nodejs";

interface ApproveBody {
  approval_id: string;
  action: "approve" | "edit" | "skip";
  edited_body?: string;
}

export async function POST(req: NextRequest) {
  // Auth: AUTOMATION_SECRET or ARTHUR_SECRET
  const authHeader = req.headers.get("authorization") ?? "";
  const secret1 = process.env.AUTOMATION_SECRET;
  const secret2 = process.env.ARTHUR_SECRET;
  if (
    (!secret1 || authHeader !== `Bearer ${secret1}`) &&
    (!secret2 || authHeader !== `Bearer ${secret2}`)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ApproveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { approval_id, action, edited_body } = body;
  if (!approval_id || !action) {
    return NextResponse.json({ error: "approval_id and action required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Fetch the approval row
  const { data: approval, error: fetchErr } = await db
    .from("arthur_email_approvals")
    .select("*")
    .eq("id", approval_id)
    .single();

  if (fetchErr || !approval) {
    return NextResponse.json({ error: "approval not found" }, { status: 404 });
  }

  // Helper: find associated superlearner decision_id for this approval
  const createdAt = approval.created_at as string | null;
  const decisionLookup = async () => {
    const { data } = await db
      .from("arthur_decisions")
      .select("id, created_at, input_summary")
      .eq("domain", "reply_draft")
      .order("created_at", { ascending: false })
      .limit(100);
    // Find the closest decision by msg_id in input_summary
    const match = (data ?? []).find((r) => {
      const s = r.input_summary as Record<string, unknown> | null;
      return s?.msg_id === (approval.yahoo_msg_id as string);
    });
    return match?.id ?? null;
  };

  // Handle: skip
  if (action === "skip") {
    await db
      .from("arthur_email_approvals")
      .update({ status: "skipped" })
      .eq("id", approval_id);
    // Correction: Arthur thought should_reply=true, Daniel said no
    const decisionId = await decisionLookup().catch(() => null);
    const latencyMs = createdAt ? Date.now() - new Date(createdAt).getTime() : null;
    logCorrection({
      decisionId: decisionId ?? undefined,
      domain: "reply_draft",
      priorDecision: "should_reply",
      correctDecision: "skip_reply",
      reward: -1,
      source: "telegram",
      latencyMs: latencyMs ?? undefined,
    }).catch(() => {});
    return NextResponse.json({ ok: true, status: "skipped" });
  }

  // Handle: edit — store the edited body, return current state
  if (action === "edit") {
    const patch: Record<string, unknown> = { status: "edited" };
    if (edited_body) patch.draft_body = edited_body;
    await db
      .from("arthur_email_approvals")
      .update(patch)
      .eq("id", approval_id);
    // Correction: neutral — reply warranted but draft needed editing
    const decisionId = await decisionLookup().catch(() => null);
    const latencyMs = createdAt ? Date.now() - new Date(createdAt).getTime() : null;
    logCorrection({
      decisionId: decisionId ?? undefined,
      domain: "reply_draft",
      priorDecision: "should_reply",
      correctDecision: "should_reply",
      reward: 0,
      source: "telegram",
      latencyMs: latencyMs ?? undefined,
      notes: edited_body ? `edited_body_len:${edited_body.length}` : "edit_requested",
    }).catch(() => {});
    return NextResponse.json({
      ok: true,
      status: "edited",
      draft_to: approval.draft_to,
      draft_subject: approval.draft_subject,
      draft_body: edited_body || approval.draft_body,
    });
  }

  // Handle: approve — send via Resend
  if (action === "approve") {
    // Don't double-send
    if (approval.status === "sent") {
      return NextResponse.json({ ok: true, status: "sent", sent_at: approval.sent_at });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const resend = new Resend(resendKey);
    const finalBody = edited_body || approval.draft_body;
    const sentAt = new Date().toISOString();

    let sendErr: string | null = null;
    let resendId: string | null = null;

    try {
      const { data: sendData, error: sendError } = await resend.emails.send({
        from: "Daniel May <daniel@drinkswithdabney.com>",
        to: [approval.draft_to],
        subject: approval.draft_subject,
        text: finalBody,
      });

      if (sendError) {
        sendErr = sendError.message;
      } else {
        resendId = sendData?.id || null;
      }
    } catch (e: unknown) {
      sendErr = e instanceof Error ? e.message : String(e);
    }

    if (sendErr) {
      await db
        .from("arthur_email_approvals")
        .update({ status: "failed", send_error: sendErr })
        .eq("id", approval_id);

      return NextResponse.json({ ok: false, status: "failed", error: sendErr }, { status: 500 });
    }

    // Mark approval as sent
    await db
      .from("arthur_email_approvals")
      .update({
        status: "sent",
        approved_at: sentAt,
        approved_by: "telegram",
        sent_at: sentAt,
      })
      .eq("id", approval_id);

    // Mark source inbox email as replied (insert outbound row if email_id exists)
    if (approval.email_id) {
      await db.from("arthur_inbox_emails").update({ auto_action: "replied" }).eq("id", approval.email_id);
    }

    // Log outbound in arthur_inbox_emails as a sent record (best-effort)
    try {
      await db
        .from("arthur_inbox_emails")
        .insert({
          from_email: "daniel@drinkswithdabney.com",
          from_name: "Daniel May",
          to_email: approval.draft_to,
          subject: approval.draft_subject,
          body_text: finalBody,
          auto_action: "sent_reply",
          requires_review: false,
        });
    } catch {
      // Best-effort — don't fail the approval on a logging error
    }

    // Archive the source Yahoo message now that the reply has been sent
    const nylasApiKey = process.env.NYLAS_API_KEY;
    if (nylasApiKey && approval.yahoo_msg_id) {
      const grantId = process.env.NYLAS_GRANT_YAHOO || "bccc3ee8-42a4-4acd-8663-ac0533d90135";
      const archiveErr = await archiveMessage(approval.yahoo_msg_id, grantId, nylasApiKey);
      if (archiveErr) {
        console.warn(`[approve] archive source msg failed: ${archiveErr}`);
      }
    }

    // Correction: +1 — Arthur correctly identified a reply was needed, Daniel approved
    const decisionId2 = await decisionLookup().catch(() => null);
    const latencyMs2 = createdAt ? Date.now() - new Date(createdAt).getTime() : null;
    logCorrection({
      decisionId: decisionId2 ?? undefined,
      domain: "reply_draft",
      priorDecision: "should_reply",
      correctDecision: "should_reply",
      reward: 1,
      source: "telegram",
      latencyMs: latencyMs2 ?? undefined,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      status: "sent",
      sent_at: sentAt,
      resend_id: resendId,
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
