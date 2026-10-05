// Abuse limits for the anonymous endpoints: per-IP sliding window and a small concurrency gate for the CPU-bound
// rules run. In-process on purpose: the portal is one always-on machine (see lib/connectors/scheduler.ts).
export class SlidingWindow {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  private now: () => number;
  constructor(max: number, windowMs: number, now: () => number = Date.now) { this.max = max; this.windowMs = windowMs; this.now = now; }
  /** True when the call is allowed (and counted). */
  take(key: string): { ok: boolean; retryAfterSec: number } {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((this.windowMs - (t - list[0])) / 1000)) };
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }
}

export const uploadLimiter = new SlidingWindow(6, 60 * 60 * 1000);
export const runLimiter = new SlidingWindow(20, 60 * 60 * 1000);
export const readLimiter = new SlidingWindow(120, 60 * 1000);

let active = 0;
export async function withRunSlot<T>(fn: () => Promise<T>, max = 2): Promise<T | 'busy'> {
  if (active >= max) return 'busy';
  active++;
  try { return await fn(); } finally { active--; }
}
