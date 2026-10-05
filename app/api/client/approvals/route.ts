import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { clip, dbFail, isMemberRole } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";

// approval_decide(p_id, p_decision, p_reason, p_edit): the database checks the caller's role and the gate, writes the
// decision to audit_log, and stamps proof only when the result is observed in the source system. A viewer cannot decide.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isMemberRole(ctx.role)) return NextResponse.json({ error: "Viewers can read approvals but not decide them." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = clip(body.id, 64);
  const decision = clip(body.decision, 16);
  if (!id || !["approved", "rejected", "edited"].includes(decision)) return NextResponse.json({ error: "Choose approve, edit or reject." }, { status: 400 });
  const reason = clip(body.reason, 1000);
  if (decision === "rejected" && reason.length < 3) return NextResponse.json({ error: "Say why you are rejecting this. The reason is kept with the record." }, { status: 400 });
  const edit = decision === "edited" ? (body.edit && typeof body.edit === "object" ? body.edit : null) : null;
  if (decision === "edited" && !edit) return NextResponse.json({ error: "Enter the change you want." }, { status: 400 });
  const { data, error } = await ctx.supabase.rpc("approval_decide", { p_id: id, p_decision: decision, p_reason: reason || null, p_edit: edit });
  if (error) return dbFail(error.message, "Could not record the decision");
  return NextResponse.json({ ok: true, status: data ?? decision });
}
