export interface RateLimiterOptions {
  rps: number;
  burst: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** Token bucket: `burst` tokens, refilled at `rps` per second. take() resolves when a token is available. */
export function createRateLimiter(o: RateLimiterOptions) {
  if (!(o.rps > 0) || !(o.burst >= 1)) throw new Error('rps must be > 0 and burst >= 1');
  let tokens = o.burst;
  let last = o.now();
  return {
    async take(): Promise<void> {
      for (;;) {
        const t = o.now();
        tokens = Math.min(o.burst, tokens + ((t - last) / 1000) * o.rps);
        last = t;
        if (tokens >= 1) {
          tokens -= 1;
          return;
        }
        await o.sleep(Math.ceil(((1 - tokens) / o.rps) * 1000));
      }
    },
  };
}
