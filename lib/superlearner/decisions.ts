// Arthur Superlearner — Decision corpus + correction capture
// TypeScript module for Next.js API routes.
// All functions are resilient — never throw to caller on logging failure.

import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface DecisionInput {
  from?: string;
  subject?: string;
  body_excerpt?: string;
  msg_id?: string | null;
  grant_id?: string | null;
  folder?: string | null;
  age_days?: number | null;
}

export interface LogDecisionParams {
  domain: string;
  source: string;
  input: DecisionInput;
  decision: string;
  reason?: string | null;
  confidence?: number | null;
  modelMetadata?: Record<string, unknown>;
  promptVersion?: string | null;
}

export interface LogCorrectionParams {
  decisionId?: string | null;
  domain: string;
  priorDecision: string;
  correctDecision: string;
  reward: number;
  source: string;
  latencyMs?: number | null;
  notes?: string | null;
}

function computeInputHash(domain: string, input: DecisionInput): string {
  const raw = [
    domain,
    (input.from ?? "").toLowerCase(),
    (input.subject ?? "").toLowerCase(),
    (input.body_excerpt ?? "").slice(0, 500),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * logDecision — record a classifier decision to arthur_decisions.
 * Returns decision_id or null on failure.
 */
export async function logDecision(params: LogDecisionParams): Promise<string | null> {
  try {
    const db = getSupabaseAdmin();
    const { domain, source, input, decision, reason, confidence, modelMetadata, promptVersion } = params;

    const summary = {
      from:         input.from         ?? null,
      subject:      input.subject      ?? null,
      body_excerpt: (input.body_excerpt ?? "").slice(0, 500),
      msg_id:       input.msg_id       ?? null,
      grant_id:     input.grant_id     ?? null,
      folder:       input.folder       ?? null,
      age_days:     input.age_days     ?? null,
    };

    const hash = computeInputHash(domain, input);

    const { data, error } = await db
      .from("arthur_decisions")
      .insert({
        domain,
        source,
        input_hash:     hash,
        input_summary:  summary,
        decision,
        reason:         reason ?? null,
        confidence:     confidence != null ? parseFloat(confidence.toFixed(2)) : null,
        model_metadata: modelMetadata ?? {},
        prompt_version: promptVersion ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[superlearner] logDecision error:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("[superlearner] logDecision threw:", (e as Error).message);
    return null;
  }
}

/**
 * logCorrection — record a human correction to arthur_corrections.
 * Returns correction row id or null.
 */
export async function logCorrection(params: LogCorrectionParams): Promise<string | null> {
  try {
    const db = getSupabaseAdmin();
    const { decisionId, domain, priorDecision, correctDecision, reward, source, latencyMs, notes } = params;

    const { data, error } = await db
      .from("arthur_corrections")
      .insert({
        decision_id:           decisionId ?? null,
        domain,
        prior_decision:        priorDecision,
        correct_decision:      correctDecision,
        reward:                parseFloat(Number(reward).toFixed(2)),
        source,
        correction_latency_ms: latencyMs != null ? Math.round(latencyMs) : null,
        notes:                 notes ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[superlearner] logCorrection error:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("[superlearner] logCorrection threw:", (e as Error).message);
    return null;
  }
}

/**
 * lookupRecentDecisions — for dedup checks.
 */
export async function lookupRecentDecisions(domain: string, hours = 24) {
  try {
    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { data, error } = await db
      .from("arthur_decisions")
      .select("id, input_hash, decision, created_at")
      .eq("domain", domain)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { console.error("[superlearner] lookupRecentDecisions:", error.message); return []; }
    return data ?? [];
  } catch (e) {
    console.error("[superlearner] lookupRecentDecisions threw:", (e as Error).message);
    return [];
  }
}

/**
 * loadActivePrompt — returns active prompt for a domain or null.
 * Caller falls back to hardcoded prompt if null.
 */
export async function loadActivePrompt(domain: string): Promise<{
  promptText: string;
  fewshotExamples: Array<{ input: unknown; decision: string; reason: string }>;
  version: string;
} | null> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("arthur_live_prompts")
      .select("prompt_text, fewshot_examples, version")
      .eq("domain", domain)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) { console.error("[superlearner] loadActivePrompt:", error.message); return null; }
    if (!data) return null;

    return {
      promptText:      data.prompt_text as string,
      fewshotExamples: (data.fewshot_examples as Array<{ input: unknown; decision: string; reason: string }>) ?? [],
      version:         data.version as string,
    };
  } catch (e) {
    console.error("[superlearner] loadActivePrompt threw:", (e as Error).message);
    return null;
  }
}
