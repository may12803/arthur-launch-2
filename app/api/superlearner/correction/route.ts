import { NextRequest, NextResponse } from "next/server";
import { logCorrection } from "@/lib/superlearner/decisions";

export const runtime = "nodejs";

interface CorrectionBody {
  decision_id?: string;
  domain: string;
  prior_decision: string;
  correct_decision: string;
  source?: string;
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

  let body: CorrectionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { decision_id, domain, prior_decision, correct_decision, source, notes } = body;

  if (!domain || !prior_decision || !correct_decision) {
    return NextResponse.json({ error: "domain, prior_decision, and correct_decision are required" }, { status: 400 });
  }

  // Infer reward: if correct_decision contradicts prior_decision = -1, same = +1, manual = 0 default
  const reward = prior_decision === correct_decision ? 0 : -1;

  const correctionId = await logCorrection({
    decisionId: decision_id ?? null,
    domain,
    priorDecision: prior_decision,
    correctDecision: correct_decision,
    reward,
    source: source ?? "manual",
    notes: notes ?? null,
  });

  if (!correctionId) {
    return NextResponse.json({ error: "failed to insert correction" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, correction_id: correctionId });
}
