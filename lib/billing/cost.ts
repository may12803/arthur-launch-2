// Per-tenant cost tracker: records LLM token usage per tenant per day through the billing_record_llm_usage RPC
// (migration 28), which also keeps the tokens_in / tokens_out totals in tenant_cost_usage (migration 23) in step.
// Metering must never break the request that produced the usage, so recordLlmUsage reports failure and never throws.

export interface LlmUsage {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface UsageDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data?: unknown; error?: { message: string } | null }>;
}

/** USD per million tokens. A model with no entry is recorded with a zero estimate (tokens are still counted). */
export interface Rate { inPerM: number; outPerM: number }
// ASSUMPTION, not read from the provider this session: list prices as I recall them for the one model the first producer
// uses. Daniel's Cerebras key is on a free tier, so the amount actually billed is $0. Correct this table (or pass your own
// `rates`) before anyone treats est_cost_micros as a figure to report.
export const RATES: Record<string, Rate> = {
  "cerebras/gpt-oss-120b": { inPerM: 0.35, outPerM: 0.75 },
};

/** Estimated cost in millionths of a dollar (1 USD = 1,000,000), rounded to the nearest unit. */
export function estimateCostMicros(provider: string, model: string, tokensIn: number, tokensOut: number, rates: Record<string, Rate> = RATES): number {
  const r = rates[`${provider}/${model}`];
  if (!r) return 0;
  // USD per million tokens x tokens = micro-USD exactly.
  return Math.round(tokensIn * r.inPerM + tokensOut * r.outPerM);
}

/** Calendar day in America/New_York, matching how the portal shows dates. */
export function usageDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export async function recordLlmUsage(
  db: UsageDb, serverSecret: string, tenantId: string, usage: LlmUsage, opts: { now?: Date; rates?: Record<string, Rate> } = {},
): Promise<{ ok: boolean; error?: string; costMicros: number }> {
  const tokensIn = count(usage.tokensIn);
  const tokensOut = count(usage.tokensOut);
  const costMicros = estimateCostMicros(usage.provider, usage.model, tokensIn, tokensOut, opts.rates);
  if (!tenantId) return { ok: false, error: "no tenant", costMicros };
  if (tokensIn === 0 && tokensOut === 0) return { ok: true, costMicros: 0 };
  try {
    const r = await db.rpc("billing_record_llm_usage", {
      p_secret: serverSecret, p_tenant: tenantId, p_day: usageDay(opts.now), p_provider: usage.provider, p_model: usage.model,
      p_tokens_in: tokensIn, p_tokens_out: tokensOut, p_cost_micros: costMicros,
    });
    if (r.error) return { ok: false, error: r.error.message, costMicros };
    return { ok: true, costMicros };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "usage write failed", costMicros };
  }
}
