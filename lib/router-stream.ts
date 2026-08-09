/**
 * STREAMING TIER LADDER
 *
 * Why this exists: /api/chat produced its whole reply, then returned one
 * NextResponse.json(). Nothing rendered until every tool round AND the full
 * generation had finished — so the dashboard felt far slower than ChatGPT even
 * when total time was comparable. ChatGPT's advantage is time-to-first-token,
 * not total time.
 *
 * This streams the user-visible text as it is generated. Tool rounds still run
 * server-side (they must complete before the final answer exists), but the route
 * emits status events during them so the UI shows motion immediately.
 *
 * Mirrors lib/router.ts's ladder ordering. Anything not streamable here simply
 * returns null and the caller falls back to the existing non-streaming path —
 * streaming is never allowed to cost a reply.
 */

import type { OpenAIMessage } from "./router";

export type DeltaSink = (text: string) => void;

type StreamTier = {
  tier: number;
  id: string;
  label: string;
  url: string;
  model: string;
  keyEnv: string;
  /** Anthropic uses its own SSE event shape + auth headers. */
  anthropic?: boolean;
};

// Chat-only ladder (cheapest first), matching lib/router.ts TIERS ordering.
// Tool-capable routing still goes through the non-streaming path.
const STREAM_TIERS: StreamTier[] = [
  { tier: 5,  id: "groq",          label: "Groq Llama 3.3 70B",   url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile",        keyEnv: "GROQ_API_KEY" },
  { tier: 6,  id: "cerebras",      label: "Cerebras Qwen-3-235B", url: "https://api.cerebras.ai/v1/chat/completions",     model: "qwen-3-235b-a22b-instruct-2507", keyEnv: "CEREBRAS_API_KEY" },
  { tier: 8,  id: "deepseek-chat", label: "DeepSeek Chat",        url: "https://api.deepseek.com/v1/chat/completions",    model: "deepseek-chat",                  keyEnv: "DEEPSEEK_API_KEY" },
  { tier: 11, id: "haiku",         label: "Claude Haiku",         url: "https://api.anthropic.com/v1/messages",           model: "claude-haiku-4-5-20251001",      keyEnv: "ANTHROPIC_API_KEY", anthropic: true },
  { tier: 14, id: "sonnet",        label: "Claude Sonnet",        url: "https://api.anthropic.com/v1/messages",           model: "claude-sonnet-4-6",              keyEnv: "ANTHROPIC_API_KEY", anthropic: true },
];

/** Split an OpenAI-shaped thread into Anthropic's (system, messages) form. */
function toAnthropic(messages: OpenAIMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n\n");
  const msgs = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }))
    .filter((m) => m.content.trim().length > 0);
  return { system, msgs };
}

/**
 * Read an SSE body line-by-line. Handles chunk boundaries splitting a line,
 * which is the classic source of dropped/duplicated tokens.
 */
async function readSSE(body: ReadableStream<Uint8Array>, onEvent: (payload: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload && payload !== "[DONE]") onEvent(payload);
    }
  }
}

async function streamOne(
  t: StreamTier,
  messages: OpenAIMessage[],
  onDelta: DeltaSink,
  signal?: AbortSignal
): Promise<string | null> {
  const key = process.env[t.keyEnv];
  if (!key) return null;

  let res: Response;
  try {
    if (t.anthropic) {
      const { system, msgs } = toAnthropic(messages);
      if (msgs.length === 0) return null;
      res = await fetch(t.url, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: t.model, max_tokens: 2000, stream: true, system: system || undefined, messages: msgs }),
      });
    } else {
      res = await fetch(t.url, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: t.model, max_tokens: 2000, stream: true, messages }),
      });
    }
  } catch {
    return null;
  }

  if (!res.ok || !res.body) return null;

  let full = "";
  try {
    await readSSE(res.body, (payload) => {
      let j: unknown;
      try { j = JSON.parse(payload); } catch { return; }
      const o = j as Record<string, never>;
      let piece = "";
      if (t.anthropic) {
        // content_block_delta -> { delta: { type:"text_delta", text } }
        const d = (o as { delta?: { text?: string } }).delta;
        if (d && typeof d.text === "string") piece = d.text;
      } else {
        const c = (o as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0];
        if (c?.delta?.content) piece = c.delta.content;
      }
      if (piece) { full += piece; onDelta(piece); }
    });
  } catch {
    // Mid-stream failure: return what we have if it's substantive, else fall through.
    return full.length > 0 ? full : null;
  }

  return full.trim().length > 0 ? full : null;
}

/**
 * Walk the streaming ladder. Returns the full text plus which tier served it,
 * or null when nothing could stream (caller must fall back).
 *
 * Important: a tier that emitted NOTHING falls through to the next tier. A tier
 * that already emitted text cannot be retried without duplicating output, so its
 * partial result is returned as-is.
 */
export async function streamChat(
  messages: OpenAIMessage[],
  onDelta: DeltaSink,
  opts: { signal?: AbortSignal; only?: string } = {}
): Promise<{ text: string; tier: StreamTier } | null> {
  const ladder = opts.only ? STREAM_TIERS.filter((t) => t.id === opts.only) : STREAM_TIERS;
  for (const t of ladder) {
    let emitted = false;
    const sink: DeltaSink = (s) => { emitted = true; onDelta(s); };
    const text = await streamOne(t, messages, sink, opts.signal);
    if (text) return { text, tier: t };
    if (emitted) return { text: "", tier: t }; // partial output already sent downstream
  }
  return null;
}

export { STREAM_TIERS };
