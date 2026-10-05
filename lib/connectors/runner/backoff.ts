import { HttpError } from '../types.ts';

export interface BackoffOptions {
  maxAttempts: number;
  baseMs: number;
  capMs: number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function isRetryable(e: unknown): boolean {
  return e instanceof HttpError && RETRYABLE_STATUS.has(e.status);
}

/** Full jitter (random in [0, min(cap, base * 2^attempt))); a server Retry-After is a floor, never undercut. */
export function backoffDelayMs(attempt: number, o: Pick<BackoffOptions, 'baseMs' | 'capMs' | 'random'>, retryAfterMs: number | null): number {
  const ceiling = Math.min(o.capMs, o.baseMs * 2 ** (attempt - 1));
  const jittered = Math.floor(o.random() * ceiling);
  return retryAfterMs === null ? jittered : Math.max(retryAfterMs, jittered);
}

export interface Attempted<T> {
  value: T;
  attempts: number;
}

export async function withBackoff<T>(fn: () => Promise<T>, o: BackoffOptions): Promise<Attempted<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { value: await fn(), attempts: attempt };
    } catch (e) {
      if (!isRetryable(e) || attempt >= o.maxAttempts) {
        if (e && typeof e === 'object') (e as { attempts?: number }).attempts = attempt;
        throw e;
      }
      const delayMs = backoffDelayMs(attempt, o, e instanceof HttpError ? e.retryAfterMs : null);
      o.onRetry?.({ attempt, delayMs, error: e });
      await o.sleep(delayMs);
    }
  }
}
