/**
 * Arthur 18-tier model router for arthur-online (cloud-runnable subset).
 *
 * Mirrors the canonical hierarchy in ~/arthur/model-router.js MODELS table
 * AND CLAUDE.md, but only includes tiers reachable from a Fly-deployed
 * Next.js process (no GLiNER/MSA/Gemma/Arthur-LoRA — those are local-only).
 *
 * Routing rules (HARD):
 *   • Tool-call paths (`requiresTools: true`)  → only `tools=true` tiers
 *   • Chat-only paths                          → all tiers in cost order
 *   • Cheapest-first ladder; first non-null response wins
 *   • Each tier function returns null on missing key OR API failure
 *
 * Why a separate file from chat/route.ts: makes the chain testable, makes
 * adding a new tier a one-place edit, and forces every caller to pick a
 * tools-required mode (no more "Anthropic always wins because hardcoded").
 */

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string;
  }>;
}

export interface TierDefinition {
  tier: number;
  id: string;
  label: string;
  cost: number;          // per-call rough estimate USD
  toolCapable: boolean;  // can this provider invoke tools in our integration?
  call: (messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[]) => Promise<LLMResponse | null>;
}

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic format conversion (Anthropic uses content blocks, OpenAI uses messages)
// ─────────────────────────────────────────────────────────────────────────────
function openAIToolsToAnthropic(toolDefs: ToolDef[]): Array<Record<string, unknown>> {
  return toolDefs.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function anthropicToOpenAIResponse(anth: { content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; stop_reason?: string }): LLMResponse {
  const content = anth.content || [];
  const textParts: string[] = [];
  const toolCalls: OpenAIToolCall[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) textParts.push(block.text);
    else if (block.type === "tool_use" && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      });
    }
  }
  return {
    choices: [{
      message: {
        role: "assistant",
        content: textParts.join("\n") || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finish_reason: anth.stop_reason === "tool_use" ? "tool_calls" : "stop",
    }],
  };
}

function messagesToAnthropicConvo(messages: OpenAIMessage[]): { system: string; convo: Array<{ role: "user" | "assistant"; content: unknown }> } {
  let systemPrompt = "";
  const convo: Array<{ role: "user" | "assistant"; content: unknown }> = [];
  for (const m of messages) {
    if (m.role === "system" && typeof m.content === "string") {
      systemPrompt = systemPrompt ? systemPrompt + "\n\n" + m.content : m.content;
    } else if (m.role === "tool") {
      convo.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id || "unknown", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
      });
    } else if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const blocks: Array<Record<string, unknown>> = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        let parsed: unknown = {};
        try { parsed = JSON.parse(tc.function.arguments); } catch {}
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: parsed });
      }
      convo.push({ role: "assistant", content: blocks });
    } else if (m.role === "user" || m.role === "assistant") {
      convo.push({ role: m.role, content: typeof m.content === "string" ? m.content : "" });
    }
  }
  return { system: systemPrompt, convo };
}

// Strip tool-related fields for chat-only providers that can't process them
function stripToolFields(messages: OpenAIMessage[]): OpenAIMessage[] {
  return messages
    .filter(m => m.role !== "tool")
    .map(m => {
      const { tool_calls: _tc, tool_call_id: _tci, name: _n, ...rest } = m;
      return { ...rest, content: typeof rest.content === "string" ? rest.content : "" };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 5 — Groq Llama 3.3 70B ($0.0003) — chat-only in our integration
// ─────────────────────────────────────────────────────────────────────────────
async function callGroq(messages: OpenAIMessage[], _withTools: boolean, _toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: stripToolFields(messages),
        max_tokens: 1200,
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`groq ${r.status}`);
    return (await r.json()) as LLMResponse;
  } catch (e) { console.warn("[router/groq]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 6 — Cerebras Qwen-3-235B (Daniel sub, $0 marginal) — chat-only
// ─────────────────────────────────────────────────────────────────────────────
async function callCerebras(messages: OpenAIMessage[], _withTools: boolean, _toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen-3-235b-a22b-instruct-2507",
        messages: stripToolFields(messages),
        max_tokens: 1200,
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`cerebras ${r.status}`);
    return (await r.json()) as LLMResponse;
  } catch (e) { console.warn("[router/cerebras]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 7 — Pioneer.ai (Fastino) ($0.0005) — chat-only
// ─────────────────────────────────────────────────────────────────────────────
async function callPioneer(messages: OpenAIMessage[], _withTools: boolean, _toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.PIONEER_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.pioneer.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/Llama-3.3-70B-Instruct",
        messages: stripToolFields(messages),
        max_tokens: 1200,
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`pioneer ${r.status}`);
    return (await r.json()) as LLMResponse;
  } catch (e) { console.warn("[router/pioneer]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 8 — DeepSeek-Chat ($0.0014) — chat-only in our integration
// ─────────────────────────────────────────────────────────────────────────────
async function callDeepseekChat(messages: OpenAIMessage[], _withTools: boolean, _toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: stripToolFields(messages),
        max_tokens: 1200,
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`deepseek-chat ${r.status}`);
    return (await r.json()) as LLMResponse;
  } catch (e) { console.warn("[router/deepseek-chat]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 9 — DeepSeek-R1 (reasoner, $0.0055) — chat-only
// ─────────────────────────────────────────────────────────────────────────────
async function callDeepseekR1(messages: OpenAIMessage[], _withTools: boolean, _toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-reasoner",
        messages: stripToolFields(messages),
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) throw new Error(`deepseek-r1 ${r.status}`);
    return (await r.json()) as LLMResponse;
  } catch (e) { console.warn("[router/deepseek-r1]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 11 — Claude Haiku ($0.001) — TOOL-CAPABLE (cheapest tool-call tier)
// ─────────────────────────────────────────────────────────────────────────────
async function callHaiku(messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  return callAnthropic(messages, withTools, toolDefs, "claude-haiku-4-5");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 12 — Gemini 2.5 Pro ($0.0035) — TOOL-CAPABLE
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  try {
    // Convert OpenAI messages to Gemini format
    const systemParts: string[] = [];
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
    for (const m of messages) {
      if (m.role === "system" && typeof m.content === "string") systemParts.push(m.content);
      else if (m.role === "tool") {
        contents.push({ role: "user", parts: [{ text: `[tool_result: ${m.name}] ${typeof m.content === "string" ? m.content : ""}` }] });
      } else if (m.role === "user" || m.role === "assistant") {
        contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: typeof m.content === "string" ? m.content : "" }] });
      }
    }
    const body: Record<string, unknown> = {
      contents,
      systemInstruction: systemParts.length ? { parts: [{ text: systemParts.join("\n\n") }] } : undefined,
      generationConfig: { maxOutputTokens: 1500, temperature: 0.6 },
    };
    if (withTools && toolDefs.length) {
      body.tools = [{ functionDeclarations: toolDefs.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }];
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    const data = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> } }> };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map(p => p.text).filter(Boolean).join("\n");
    const toolCalls: OpenAIToolCall[] = parts
      .filter(p => p.functionCall)
      .map((p, i) => ({
        id: `gemini_call_${i}`,
        type: "function" as const,
        function: { name: p.functionCall!.name, arguments: JSON.stringify(p.functionCall!.args ?? {}) },
      }));
    return {
      choices: [{
        message: { role: "assistant", content: text || null, tool_calls: toolCalls.length ? toolCalls : undefined },
        finish_reason: toolCalls.length ? "tool_calls" : "stop",
      }],
    };
  } catch (e) { console.warn("[router/gemini]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 13 — Kimi K2.6 via OpenRouter ($0.0035) — TOOL-CAPABLE
// ─────────────────────────────────────────────────────────────────────────────
async function callKimi(messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const body: Record<string, unknown> = {
      model: "moonshotai/kimi-k2-0905",
      messages,
      max_tokens: 1500,
      temperature: 0.6,
    };
    if (withTools && toolDefs.length) { body.tools = toolDefs; body.tool_choice = "auto"; }
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://arthur-online.fly.dev",
        "X-Title": "arthur-online",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`kimi ${r.status}`);
    return (await r.json()) as LLMResponse;
  } catch (e) { console.warn("[router/kimi]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 14 — Claude Sonnet ($0.010) — TOOL-CAPABLE
// ─────────────────────────────────────────────────────────────────────────────
async function callSonnet(messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  return callAnthropic(messages, withTools, toolDefs, "claude-sonnet-4-6");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 15 — OpenAI o4 ($0.015) — TOOL-CAPABLE
// ─────────────────────────────────────────────────────────────────────────────
async function callO4(messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const body: Record<string, unknown> = { model: "gpt-4o", messages, max_tokens: 1500, temperature: 0.6 };
    if (withTools && toolDefs.length) { body.tools = toolDefs; body.tool_choice = "auto"; }
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`openai ${r.status}`);
    return (await r.json()) as LLMResponse;
  } catch (e) { console.warn("[router/openai]", e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 17 — Claude Opus ($0.075) — TOOL-CAPABLE — last-resort
// ─────────────────────────────────────────────────────────────────────────────
async function callOpus(messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[]): Promise<LLMResponse | null> {
  return callAnthropic(messages, withTools, toolDefs, "claude-opus-4-7");
}

// Shared Anthropic caller
async function callAnthropic(messages: OpenAIMessage[], withTools: boolean, toolDefs: ToolDef[], model: string): Promise<LLMResponse | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const { system, convo } = messagesToAnthropicConvo(messages);
    const body: Record<string, unknown> = { model, max_tokens: 1500, system, messages: convo };
    if (withTools) body.tools = openAIToolsToAnthropic(toolDefs);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`anthropic/${model} ${r.status}: ${(await r.text()).slice(0, 150)}`);
    const anth = await r.json() as { content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; stop_reason?: string };
    return anthropicToOpenAIResponse(anth);
  } catch (e) { console.warn(`[router/anthropic-${model}]`, e instanceof Error ? e.message : String(e)); return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE 18-TIER LADDER — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
export const TIERS: TierDefinition[] = [
  { tier:  5, id: "groq",          label: "Groq Llama 3.3 70B",         cost: 0.0003, toolCapable: false, call: callGroq },
  { tier:  6, id: "cerebras",      label: "Cerebras Qwen-3-235B",       cost: 0,      toolCapable: false, call: callCerebras },
  { tier:  7, id: "pioneer",       label: "Pioneer.ai",                 cost: 0.0005, toolCapable: false, call: callPioneer },
  { tier:  8, id: "deepseek-chat", label: "DeepSeek Chat",              cost: 0.0014, toolCapable: false, call: callDeepseekChat },
  { tier:  9, id: "deepseek-r1",   label: "DeepSeek R1",                cost: 0.0055, toolCapable: false, call: callDeepseekR1 },
  { tier: 11, id: "haiku",         label: "Claude Haiku",               cost: 0.001,  toolCapable: true,  call: callHaiku },
  { tier: 12, id: "gemini-2.5-pro",label: "Gemini 2.5 Pro",             cost: 0.0035, toolCapable: true,  call: callGemini },
  { tier: 13, id: "kimi-k2.6",     label: "Kimi K2.6 (OpenRouter)",     cost: 0.0035, toolCapable: true,  call: callKimi },
  { tier: 14, id: "sonnet",        label: "Claude Sonnet",              cost: 0.010,  toolCapable: true,  call: callSonnet },
  { tier: 15, id: "o4",            label: "OpenAI GPT-4o",              cost: 0.015,  toolCapable: true,  call: callO4 },
  { tier: 17, id: "opus",          label: "Claude Opus",                cost: 0.075,  toolCapable: true,  call: callOpus },
];

/**
 * Walk the 18-tier ladder. For tool-call paths, only consider tools=true tiers.
 * For chat-only paths, consider all tiers in order. First non-null wins.
 *
 * Returns the response + which tier handled it.
 */
export async function routeToLLM(
  messages: OpenAIMessage[],
  opts: { requiresTools: boolean; toolDefs?: ToolDef[] }
): Promise<{ response: LLMResponse; tier: TierDefinition } | null> {
  const toolDefs = opts.toolDefs ?? [];
  const eligible = opts.requiresTools
    ? TIERS.filter(t => t.toolCapable)
    : TIERS;
  for (const t of eligible) {
    const r = await t.call(messages, opts.requiresTools, toolDefs);
    if (r && r.choices && r.choices.length > 0) {
      return { response: r, tier: t };
    }
  }
  return null;
}

/**
 * Pretty-print which tiers will be tried, for logging/diagnostics.
 */
export function describeChain(requiresTools: boolean): string {
  const eligible = requiresTools ? TIERS.filter(t => t.toolCapable) : TIERS;
  return eligible.map(t => `T${t.tier} ${t.id}`).join(" → ");
}
