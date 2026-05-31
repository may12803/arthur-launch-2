/**
 * Unified orchestrator consult (dashboard side) — the SAME smart-gate specialist
 * consult the TUI + cloud use, but SELF-CONTAINED: it HTTP-POSTs the Modal
 * orchestrator directly instead of require()'ing ~/arthur (which does not exist
 * on the arthur-online Fly container — the old dynamicRequire silently failed in
 * prod, so the dashboard never actually consulted the 37 specialists).
 *
 * Context only: the result is injected into the system prompt; the dashboard's
 * 29-tool loop still drives all actions. Mirrors ~/arthur/lib/orchestrator-consult.js.
 */

const ORCH_ENDPOINT =
  process.env.ARTHUR_ORCHESTRATOR_URL || "https://may12803--arthur-orchestrator-serve.modal.run";

// Smart gate — identical policy to the JS canonical (skip trivial chatter).
const TRIVIAL =
  /^(hi|hey|hello|yo|sup|thanks|thank you|ty|thx|ok|okay|k|yes|no|yep|nope|sure|cool|nice|great|got it|gotcha|lol|haha|good|bye|gn|gm|morning|np)\b/i;

export function shouldConsult(prompt: string): boolean {
  const p = (prompt || "").trim();
  if (p.length < 12) return false;
  if (TRIVIAL.test(p) && p.length < 48) return false;
  return true;
}

export async function consultOrchestrator(
  prompt: string,
  opts: { tenant_id?: string; session_id?: string; force?: boolean } = {}
): Promise<string | null> {
  if (opts.force !== true && !shouldConsult(prompt)) return null;
  const apiKey = process.env.ARTHUR_OS_API_KEY;
  if (!apiKey) return null; // no key on this surface → skip, non-fatal
  try {
    const r = await fetch(`${ORCH_ENDPOINT}/orchestrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Tenant-Id": opts.tenant_id || "dabney",
      },
      body: JSON.stringify({
        prompt,
        tenant_id: opts.tenant_id || "dabney",
        max_specialists: 3,
        allow_live_apis: true,
        allow_actions: false,
        session_id: opts.session_id || null,
      }),
      signal: AbortSignal.timeout(Number(process.env.ARTHUR_ORCH_TIMEOUT_MS || 60000)),
    });
    if (!r.ok) return null;
    const result = await r.json();
    if (!result?.response || result.fallback_used) return null;
    const specs = (result.specialists_consulted || [])
      .map((s: { id?: string; name?: string }) => s.id || s.name)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
    const head = specs ? `[SPECIALIST CONTEXT — consulted: ${specs}]` : "[SPECIALIST CONTEXT]";
    return `${head}\n${String(result.response).trim().slice(0, 1200)}\n[END SPECIALIST CONTEXT]`;
  } catch {
    return null; // non-fatal — chat proceeds without specialist context
  }
}
