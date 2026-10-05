import { NextRequest, NextResponse } from "next/server";
import { getApiContext, rpcErrorResponse } from "@/lib/client-portal/api";

export const runtime = "nodejs";

// A client records a decision on one Workstreams task. The workstream_decide() RPC enforces two-factor,
// the member's role and the task's state, moves the task, and writes audit_log.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  const body = await req.json().catch(() => ({}));
  const decision = String(body.decision || "");
  if (!["approve", "approve_with_changes", "not_now"].includes(decision)) return NextResponse.json({ error: "Unknown decision." }, { status: 400 });
  const { data, error } = await ctx.supabase.rpc("workstream_decide", { p_task: String(body.task || ""), p_decision: decision, p_note: String(body.note || "").slice(0, 2000) });
  if (error) {
    const m = error.message, text = m.charAt(0).toUpperCase() + m.slice(1) + ".";
    if (/not found/i.test(m)) return NextResponse.json({ error: text }, { status: 404 });
    if (/already done/i.test(m)) return NextResponse.json({ error: text }, { status: 409 });
    if (/only owners/i.test(m)) return NextResponse.json({ error: text }, { status: 403 });
    return rpcErrorResponse(error.message);
  }
  return NextResponse.json({ ok: true, decision: data });
}
