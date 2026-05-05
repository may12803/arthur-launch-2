import { getSupabaseAdmin } from "../supabase/admin";

export type Signal = "accept" | "reject" | "edit" | "implicit_reject";

export interface FeedbackPair {
  prompt: string;
  response: string;
  signal: Signal;
  session_id?: string;
  model_used?: string;
  tier_used?: string;
  tools_used?: unknown[];
  correction_text?: string;
  source?: "dashboard" | "telegram" | "inbox" | "agent";
  metadata?: Record<string, unknown>;
}

export async function recordFeedback(pair: FeedbackPair): Promise<{ id: string } | { error: string }> {
  if (!pair.prompt?.trim() || !pair.response?.trim()) {
    return { error: "prompt and response required" };
  }
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("arthur_training_pairs")
      .insert({
        prompt: pair.prompt,
        response: pair.response,
        signal: pair.signal,
        session_id: pair.session_id ?? null,
        model_used: pair.model_used ?? null,
        tier_used: pair.tier_used ?? null,
        tools_used: pair.tools_used ?? [],
        correction_text: pair.correction_text ?? null,
        source: pair.source ?? "dashboard",
        metadata: pair.metadata ?? {},
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    return { id: data.id as string };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
