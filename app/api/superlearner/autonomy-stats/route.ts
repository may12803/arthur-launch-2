import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const type  = searchParams.get("type") ?? "";
  const since = searchParams.get("since") ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const db = getSupabaseAdmin();

  // ── Signal counts (last 24h) ──────────────────────────────────────────────
  if (type === "signals") {
    const { data, error } = await db
      .from("arthur_reward_events")
      .select("signal_type, reward")
      .gte("created_at", since);

    if (error) {
      // Table may not exist if migration hasn't run yet on this env
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json([]);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const byType: Record<string, { count: number; reward_sum: number }> = {};
    for (const row of data ?? []) {
      if (!byType[row.signal_type]) byType[row.signal_type] = { count: 0, reward_sum: 0 };
      byType[row.signal_type].count++;
      byType[row.signal_type].reward_sum += Number(row.reward);
    }

    const result = Object.entries(byType).map(([signal_type, v]) => ({
      signal_type,
      count: v.count,
      avg_reward: Math.round((v.reward_sum / v.count) * 1000) / 1000,
    }));

    return NextResponse.json(result);
  }

  // ── Active reward models ──────────────────────────────────────────────────
  if (type === "models") {
    const { data, error } = await db
      .from("arthur_reward_model")
      .select("domain, version, validation_accuracy, trained_on_n_examples, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) return NextResponse.json([]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  }

  // ── Curriculum stats per domain ───────────────────────────────────────────
  if (type === "curriculum") {
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await db
      .from("arthur_curriculum_items")
      .select("domain, mutation_kind, is_correct")
      .gte("created_at", since30);

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) return NextResponse.json([]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const domains: Record<string, { total: number; correct: number; by_kind: Record<string, { total: number; correct: number }> }> = {};

    for (const row of data ?? []) {
      if (!domains[row.domain]) domains[row.domain] = { total: 0, correct: 0, by_kind: {} };
      domains[row.domain].total++;
      if (row.is_correct) domains[row.domain].correct++;

      const kind = row.mutation_kind ?? "unknown";
      if (!domains[row.domain].by_kind[kind]) domains[row.domain].by_kind[kind] = { total: 0, correct: 0 };
      domains[row.domain].by_kind[kind].total++;
      if (row.is_correct) domains[row.domain].by_kind[kind].correct++;
    }

    const result = Object.entries(domains).map(([domain, v]) => ({
      domain,
      total: v.total,
      correct: v.correct,
      accuracy: v.total > 0 ? Math.round(100 * v.correct / v.total) / 100 : 0,
      by_kind: v.by_kind,
    }));

    return NextResponse.json(result);
  }

  // ── Top 5 hardest cases ───────────────────────────────────────────────────
  if (type === "hard_cases") {
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await db
      .from("arthur_curriculum_items")
      .select("domain, mutation_kind, generated_input, predicted_decision, expected_decision, created_at")
      .eq("is_correct", false)
      .gte("created_at", since30)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) return NextResponse.json([]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  }

  // ── Cross-model agreement history (7d, daily buckets) ────────────────────
  if (type === "agreement_history") {
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await db
      .from("arthur_reward_events")
      .select("signal_type, created_at")
      .in("signal_type", ["cross_model_agree", "cross_model_disagree"])
      .gte("created_at", since7)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) return NextResponse.json([]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bucket by day
    const days: Record<string, { agree: number; disagree: number }> = {};
    for (const row of data ?? []) {
      const day = row.created_at.slice(0, 10);
      if (!days[day]) days[day] = { agree: 0, disagree: 0 };
      if (row.signal_type === "cross_model_agree") days[day].agree++;
      else days[day].disagree++;
    }

    const result = Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { agree, disagree }]) => ({
        date,
        agree_rate: (agree + disagree) > 0 ? Math.round((agree / (agree + disagree)) * 1000) / 1000 : 0,
        agree,
        disagree,
      }));

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
