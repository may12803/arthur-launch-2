import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

const DOMAINS = ["inbox", "invoice", "unsubscribe", "calendar_invite", "reply_draft"];

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;
  const db = getSupabaseAdmin();

  const now = new Date();
  const ago7d  = new Date(now.getTime() - 7  * 86400000).toISOString();
  const ago30d = new Date(now.getTime() - 30 * 86400000).toISOString();

  const stats = await Promise.all(DOMAINS.map(async (domain) => {
    const [
      { count: totalDecisions },
      { count: totalCorrections },
      { count: decisions7d },
      { count: corrections7d },
      { count: decisions30d },
      { count: corrections30d },
      { data: activePrompt },
      { data: hardCases },
    ] = await Promise.all([
      db.from("arthur_decisions").select("*", { count: "exact", head: true }).eq("domain", domain),
      db.from("arthur_corrections").select("*", { count: "exact", head: true }).eq("domain", domain),
      db.from("arthur_decisions").select("*", { count: "exact", head: true }).eq("domain", domain).gte("created_at", ago7d),
      db.from("arthur_corrections").select("*", { count: "exact", head: true }).eq("domain", domain).gte("created_at", ago7d),
      db.from("arthur_decisions").select("*", { count: "exact", head: true }).eq("domain", domain).gte("created_at", ago30d),
      db.from("arthur_corrections").select("*", { count: "exact", head: true }).eq("domain", domain).gte("created_at", ago30d),
      db.from("arthur_live_prompts").select("version, created_at").eq("domain", domain).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("arthur_corrections")
        .select("id, prior_decision, correct_decision, reward, created_at, decision_id")
        .eq("domain", domain)
        .lte("reward", -1)
        .gte("created_at", ago7d)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Calculate accuracy: corrections where prior==correct / total corrections
    const { data: correctionRows } = await db
      .from("arthur_corrections")
      .select("prior_decision, correct_decision, reward")
      .eq("domain", domain)
      .gte("created_at", ago7d);

    const total7 = correctionRows?.length ?? 0;
    const correct7 = (correctionRows ?? []).filter(r => r.reward > 0).length;
    const accuracy7d = total7 > 0 ? correct7 / total7 : null;

    const { data: correctionRows30 } = await db
      .from("arthur_corrections")
      .select("prior_decision, correct_decision, reward")
      .eq("domain", domain)
      .gte("created_at", ago30d);

    const total30 = correctionRows30?.length ?? 0;
    const correct30 = (correctionRows30 ?? []).filter(r => r.reward > 0).length;
    const accuracy30d = total30 > 0 ? correct30 / total30 : null;

    // Get input excerpts for hard cases
    const hardCasesWithInput = await Promise.all((hardCases ?? []).map(async (c) => {
      if (!c.decision_id) return { ...c, input_excerpt: null };
      const { data: dec } = await db
        .from("arthur_decisions")
        .select("input_summary, decision, confidence")
        .eq("id", c.decision_id as string)
        .maybeSingle();
      if (!dec) return { ...c, input_excerpt: null };
      const s = dec.input_summary as Record<string, string | null> | null;
      return {
        ...c,
        from: s?.from ?? null,
        subject: s?.subject ?? null,
        predicted: (dec.decision as string) ?? null,
        correct: c.correct_decision,
        confidence: dec.confidence,
        input_excerpt: s?.body_excerpt ? (s.body_excerpt as string).slice(0, 120) : null,
      };
    }));

    return {
      domain,
      total_decisions:  totalDecisions  ?? 0,
      total_corrections: totalCorrections ?? 0,
      decisions_7d:     decisions7d  ?? 0,
      corrections_7d:   corrections7d ?? 0,
      decisions_30d:    decisions30d  ?? 0,
      corrections_30d:  corrections30d ?? 0,
      accuracy_7d:      accuracy7d,
      accuracy_30d:     accuracy30d,
      active_prompt_version: (activePrompt?.version as string) ?? null,
      hard_cases: hardCasesWithInput,
    };
  }));

  return NextResponse.json({ ok: true, stats, generated_at: now.toISOString() });
}
