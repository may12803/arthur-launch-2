import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();

  // ── Per-channel aggregate stats ───────────────────────────────────────────
  const { data: evalRows, error: evalErr } = await db
    .from("arthur_external_evals")
    .select("channel, domain, is_correct, confidence, created_at")
    .order("created_at", { ascending: false });

  if (evalErr) {
    // Table may not exist yet
    if (evalErr.code === "42P01") {
      return NextResponse.json({
        channels: [],
        total_free_cases: 0,
        hard_cases: [],
        corpus_count: 0,
        generated_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ error: evalErr.message }, { status: 500 });
  }

  const rows = evalRows ?? [];

  // Group by channel
  const channelMap = new Map<string, { total: number; correct: number; dates: string[] }>();
  for (const row of rows) {
    const ch = row.channel ?? "unknown";
    if (!channelMap.has(ch)) channelMap.set(ch, { total: 0, correct: 0, dates: [] });
    const c = channelMap.get(ch)!;
    c.total++;
    if (row.is_correct === true) c.correct++;
    c.dates.push(row.created_at);
  }

  // Build trend: last 30 days grouped by day per channel
  const channels = Array.from(channelMap.entries()).map(([channel, c]) => {
    // Daily accuracy bucketing
    const byDay = new Map<string, { total: number; correct: number }>();
    for (const row of rows.filter(r => r.channel === channel)) {
      const day = row.created_at.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, { total: 0, correct: 0 });
      const d = byDay.get(day)!;
      d.total++;
      if (row.is_correct === true) d.correct++;
    }
    const trend_30d = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, d]) => ({
        date,
        accuracy: d.total > 0 ? d.correct / d.total : 0,
      }));

    const last_run = c.dates.sort().pop() ?? null;
    const accuracy = c.total > 0 ? c.correct / c.total : null;

    return { channel, total_evals: c.total, correct: c.correct, accuracy, last_run, trend_30d };
  });

  // Total free cases = all non-frontier-gap evals (those use $0 models)
  const total_free_cases = rows.filter(r => r.channel !== "frontier_gap").length;

  // ── Hard cases: cross-LLM disagreements this week ────────────────────────
  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: hardData } = await db
    .from("arthur_external_evals")
    .select("case_id, domain, arthur_decision, ground_truth, confidence, created_at")
    .eq("channel", "cross_llm")
    .eq("is_correct", false)
    .gte("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(5);

  const hard_cases = (hardData ?? []).map(r => ({
    case_id:          (r.case_id ?? "").slice(0, 8) + "...", // anonymize
    domain:           r.domain ?? "—",
    arthur_decision:  r.arthur_decision ?? "—",
    ground_truth:     r.ground_truth ?? "—",
    confidence:       r.confidence ?? null,
    created_at:       r.created_at,
  }));

  // ── Corpus count ──────────────────────────────────────────────────────────
  const { count: corpus_count } = await db
    .from("arthur_external_corpus")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    channels,
    total_free_cases,
    hard_cases,
    corpus_count: corpus_count ?? 0,
    generated_at: new Date().toISOString(),
  });
}
