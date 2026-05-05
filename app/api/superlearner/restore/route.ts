import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logCorrection } from "@/lib/superlearner/decisions";

export const runtime = "nodejs";

interface RestoreBody {
  msg_id: string;
  domain?: string;
  notes?: string;
}

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

  let body: RestoreBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { msg_id, domain = "inbox", notes } = body;
  if (!msg_id) {
    return NextResponse.json({ error: "msg_id required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Look up the original decision for this msg_id
  const { data: decisions } = await db
    .from("arthur_decisions")
    .select("id, decision, created_at, input_summary")
    .eq("domain", domain)
    .order("created_at", { ascending: false })
    .limit(200);

  // Find the most recent delete/archive decision for this msg_id
  const match = (decisions ?? []).find((r) => {
    const s = r.input_summary as Record<string, unknown> | null;
    return s?.msg_id === msg_id && (r.decision === "delete" || r.decision === "archive");
  });

  const priorDecision = (match?.decision as string) ?? "delete";
  const latencyMs = match?.created_at
    ? Date.now() - new Date(match.created_at as string).getTime()
    : null;

  // -1 correction: Arthur deleted/archived something Daniel manually restored
  const correctionId = await logCorrection({
    decisionId: match?.id ?? null,
    domain,
    priorDecision,
    correctDecision: "keep",
    reward: -1,
    source: "restore_from_trash",
    latencyMs,
    notes: notes ?? `msg_id:${msg_id}`,
  });

  return NextResponse.json({ ok: true, correction_id: correctionId, prior_decision: priorDecision });
}
