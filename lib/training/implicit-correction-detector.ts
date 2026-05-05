import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordFeedback } from "@/lib/training/feedback-recorder";

// ─────────────────────────────────────────────────────────────────────────────
// Pure classifier — no I/O, no side effects
// ─────────────────────────────────────────────────────────────────────────────

/** Phrases that signal a correction. Order matters — check most-specific first. */
const CORRECTION_PHRASES = [
  "no, actually",
  "that's wrong",
  "that is wrong",
  "i meant",
  "actually i",
  "not quite",
  "no that's",
  "try again",
  "do it differently",
  "that didn't work",
  "let's try",
  "don't do that",
  "actually,",
];

/** "wrong" alone only counts if the turn is ≤6 tokens (whitespace-split). */
const SHORT_WRONG_THRESHOLD = 6;

/**
 * Detect whether `userTurn` looks like an implicit correction to a prior
 * assistant response.  Pure function — does zero I/O.
 */
export function detectImplicitCorrection(
  userTurn: string
): { matched: boolean; phrase?: string } {
  const trimmed = userTurn.trim();

  // Questions are never corrections (even if they contain correction phrases)
  if (trimmed.endsWith("?")) return { matched: false };

  const lower = trimmed.toLowerCase();

  // Check fixed phrases (substring match, case-insensitive)
  for (const phrase of CORRECTION_PHRASES) {
    if (lower.includes(phrase)) {
      return { matched: true, phrase };
    }
  }

  // "wrong" alone — only if ≤6 tokens
  if (lower.includes("wrong")) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length <= SHORT_WRONG_THRESHOLD) {
      return { matched: true, phrase: "wrong" };
    }
  }

  // "stop" alone — only if ≤6 tokens (avoid matching "stop by the store")
  if (lower.includes("stop")) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length <= SHORT_WRONG_THRESHOLD) {
      return { matched: true, phrase: "stop" };
    }
  }

  return { matched: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed detector — reads prior turns and calls recordFeedback
// ─────────────────────────────────────────────────────────────────────────────

interface PriorTurns {
  assistantContent: string;
  assistantMetadata: Record<string, unknown>;
  userPrompt: string;
}

async function loadPriorTurns(sessionId: string): Promise<PriorTurns | null> {
  try {
    const db = getSupabaseAdmin();

    // Fetch last 6 turns for this session (desc) so we can find the most recent
    // assistant turn and the user turn before it.
    const { data, error } = await db
      .from("arthur_dashboard_conversations")
      .select("role,content,metadata,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(6);

    if (error || !data || data.length === 0) return null;

    type ConvTurn = { role: string; content: string; metadata: Record<string, unknown> | null; created_at: string };
    const turns = data as ConvTurn[];

    // Find the most recent assistant turn
    const assistantIdx = turns.findIndex(t => t.role === "assistant");
    if (assistantIdx === -1) return null;

    const assistant = turns[assistantIdx];
    const assistantContent = assistant.content ?? "";

    // Skip placeholders / error stubs
    if (
      !assistantContent.trim() ||
      assistantContent.trim() === "…" ||
      assistantContent.toLowerCase().startsWith("couldn't reach") ||
      assistantContent.toLowerCase().startsWith("network error") ||
      assistantContent.toLowerCase().startsWith("all providers failed")
    ) {
      return null;
    }

    const assistantMetadata = (assistant.metadata as Record<string, unknown>) ?? {};

    // The user turn directly before that assistant turn
    const userIdx = turns.slice(assistantIdx + 1).findIndex(t => t.role === "user");
    if (userIdx === -1) return null;

    const userPrompt = turns[assistantIdx + 1 + userIdx].content ?? "";
    if (!userPrompt.trim()) return null;

    return { assistantContent, assistantMetadata, userPrompt };
  } catch {
    return null;
  }
}

async function alreadyExplicitlyFlagged(sessionId: string): Promise<boolean> {
  try {
    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await db
      .from("arthur_training_pairs")
      .select("id")
      .eq("session_id", sessionId)
      .in("signal", ["reject", "edit"])
      .gte("created_at", since)
      .limit(1);

    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Called on every new user turn (BEFORE the LLM call).
 * Reads prior assistant + user turns from the DB for this session,
 * runs the correction classifier, and writes a training pair if matched.
 * Never throws — all errors are swallowed to keep the chat path clean.
 */
export async function maybeRecordImplicitCorrection(opts: {
  sessionId: string;
  userTurn: string;
}): Promise<void> {
  try {
    const { sessionId, userTurn } = opts;

    // 1. Pure classifier — quick reject before any DB work
    const detection = detectImplicitCorrection(userTurn);
    if (!detection.matched) return;

    // 2. Load prior turns from DB
    const prior = await loadPriorTurns(sessionId);
    if (!prior) return;

    // 3. Skip if already explicitly flagged in the last 60s
    const alreadyFlagged = await alreadyExplicitlyFlagged(sessionId);
    if (alreadyFlagged) return;

    // 4. Extract model/tier from assistant metadata
    const meta = prior.assistantMetadata;
    const modelUsed = (meta.provider as string | undefined) ?? undefined;
    const tierUsed = modelUsed ? undefined : undefined; // tier computed server-side from provider

    // 5. Record the training pair
    await recordFeedback({
      signal: "implicit_reject",
      prompt: prior.userPrompt,
      response: prior.assistantContent,
      correction_text: userTurn,
      session_id: sessionId,
      model_used: modelUsed,
      tier_used: tierUsed,
      source: "dashboard",
      metadata: {
        detector: "implicit_pattern_v1",
        matched_phrase: detection.phrase,
      },
    });
  } catch {
    // Non-fatal — never block the chat path
  }
}
