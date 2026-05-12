import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordFeedback } from "@/lib/training/feedback-recorder";

// ─────────────────────────────────────────────────────────────────────────────
// Pure classifiers — no I/O, no side effects
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

/** Phrases that signal Daniel wants the prior response REDONE in a different shape.
 *  Different from a correction — the prior reply wasn't wrong, just wrong shape. */
const EDIT_PHRASES = [
  "redo",
  "rewrite",
  "rephrase",
  "make it shorter",
  "make it longer",
  "shorter please",
  "in one line",
  "one sentence",
  "more detail",
  "more concise",
  "be concise",
  "be brief",
  "expand on",
  "elaborate",
  "summarize that",
  "summarize this",
  "in bullets",
  "as a table",
  "in a table",
  "as a list",
  "simplify",
  "dumb it down",
  "plain english",
  "in plain english",
  "tighten this up",
  "tighten that up",
  "punch this up",
];

/** Time threshold after which a new user turn is taken as an "accept" of the
 *  prior assistant reply (Daniel moved on without complaint). */
const ACCEPT_THRESHOLD_SECONDS = 120;

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

/**
 * Detect whether `userTurn` is an EDIT REQUEST against the prior assistant reply
 * — "redo shorter", "in one line", "rewrite as a table". Different from a
 * correction (the prior content wasn't wrong, just wrong shape).
 */
export function detectEditRequest(
  userTurn: string
): { matched: boolean; phrase?: string } {
  const trimmed = userTurn.trim();
  // Long prompts that happen to contain "redo" or "shorter" are usually NEW
  // requests, not edits of the prior turn. Edit requests are typically short.
  if (trimmed.split(/\s+/).length > 18) return { matched: false };
  const lower = trimmed.toLowerCase();
  for (const phrase of EDIT_PHRASES) {
    if (lower.includes(phrase)) return { matched: true, phrase };
  }
  return { matched: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed detector — reads prior turns and calls recordFeedback
// ─────────────────────────────────────────────────────────────────────────────

interface PriorTurns {
  assistantContent: string;
  assistantMetadata: Record<string, unknown>;
  assistantCreatedAt: string;
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
    const assistantCreatedAt = assistant.created_at;

    // The user turn directly before that assistant turn
    const userIdx = turns.slice(assistantIdx + 1).findIndex(t => t.role === "user");
    if (userIdx === -1) return null;

    const userPrompt = turns[assistantIdx + 1 + userIdx].content ?? "";
    if (!userPrompt.trim()) return null;

    return { assistantContent, assistantMetadata, assistantCreatedAt, userPrompt };
  } catch {
    return null;
  }
}

async function priorTurnAlreadyHasSignal(sessionId: string, assistantCreatedAt: string): Promise<boolean> {
  try {
    const db = getSupabaseAdmin();
    // Look for ANY signal already recorded for a prompt/response pair created
    // around this assistant turn (give a 10s grace window for clock skew).
    const lowerBound = new Date(new Date(assistantCreatedAt).getTime() - 10_000).toISOString();
    const upperBound = new Date(new Date(assistantCreatedAt).getTime() + 10_000).toISOString();
    const { data, error } = await db
      .from("arthur_training_pairs")
      .select("id, ts")
      .eq("session_id", sessionId)
      .gte("ts", lowerBound)
      .lte("ts", upperBound)
      .limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
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
 *
 * Classifies the PRIOR assistant turn relative to this new user turn and
 * writes ONE training pair if classifiable. Three possible signals:
 *
 *   implicit_reject — user used a corrective phrase ("no actually", "wrong")
 *   edit            — user used an edit-request phrase ("redo shorter", "in a table")
 *   accept          — user waited > 120s before sending the new turn AND didn't correct
 *
 * Never throws — all errors swallowed so the chat path is never blocked.
 *
 * Back-compat alias: `maybeRecordImplicitCorrection` (old callsite name).
 */
export async function maybeRecordChatSignal(opts: {
  sessionId: string;
  userTurn: string;
}): Promise<void> {
  try {
    const { sessionId, userTurn } = opts;

    // 1. Pure classifiers (no DB)
    const correction = detectImplicitCorrection(userTurn);
    const edit = !correction.matched ? detectEditRequest(userTurn) : { matched: false } as ReturnType<typeof detectEditRequest>;

    // 2. Load prior turns
    const prior = await loadPriorTurns(sessionId);
    if (!prior) return;

    // 3. Don't double-write — skip if this prior turn already has a signal
    const alreadyHas = await priorTurnAlreadyHasSignal(sessionId, prior.assistantCreatedAt);
    if (alreadyHas) return;

    // 4. Decide signal
    const elapsedSec = (Date.now() - new Date(prior.assistantCreatedAt).getTime()) / 1000;
    let signal: "implicit_reject" | "edit" | "accept" | null = null;
    let detectorTag = "";
    let matchedPhrase: string | undefined;

    if (correction.matched) {
      signal = "implicit_reject";
      detectorTag = "implicit_pattern_v1";
      matchedPhrase = correction.phrase;
    } else if (edit.matched) {
      signal = "edit";
      detectorTag = "edit_request_v1";
      matchedPhrase = edit.phrase;
    } else if (elapsedSec >= ACCEPT_THRESHOLD_SECONDS) {
      // Daniel didn't follow up for 2+ minutes → he accepted the answer enough
      // to walk away. Counts as implicit acceptance.
      signal = "accept";
      detectorTag = "time_elapsed_v1";
    }

    if (!signal) return;

    // 5. Extract model/tier from assistant metadata
    const meta = prior.assistantMetadata;
    const modelUsed = (meta.provider as string | undefined) ?? (meta.model as string | undefined) ?? undefined;
    const tierUsed = (meta.tier as string | undefined) ?? undefined;

    // 6. Record
    await recordFeedback({
      signal,
      prompt: prior.userPrompt,
      response: prior.assistantContent,
      correction_text: signal === "accept" ? undefined : userTurn,
      session_id: sessionId,
      model_used: modelUsed,
      tier_used: tierUsed,
      source: "dashboard",
      metadata: {
        detector: detectorTag,
        matched_phrase: matchedPhrase,
        elapsed_seconds_since_assistant: Math.round(elapsedSec),
      },
    });
  } catch {
    // Non-fatal — never block the chat path
  }
}

/** Back-compat alias — old callsite in /api/chat/route.ts uses this name. */
export const maybeRecordImplicitCorrection = maybeRecordChatSignal;
