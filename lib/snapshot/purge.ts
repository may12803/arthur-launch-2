// Purge expired snapshot runs until none are left or the time budget is spent, then report what remains so a backlog
// is visible instead of silently waiting for the next schedule.
import type { SnapshotStore } from './store.ts';

export async function purgeWithinBudget(
  store: SnapshotStore,
  opts: { budgetMs?: number; batch?: number; now?: () => number } = {},
): Promise<{ purged: number; remaining: number; budgetExhausted: boolean; batches: number }> {
  const budgetMs = opts.budgetMs ?? 45_000;
  const batch = opts.batch ?? 200;
  const clock = opts.now ?? Date.now;
  const start = clock();
  let purged = 0;
  let batches = 0;
  let budgetExhausted = false;
  for (;;) {
    if (clock() - start >= budgetMs) { budgetExhausted = true; break; }
    const n = await store.purgeExpired();
    batches++;
    purged += n;
    if (n === 0 || n < batch) break;
  }
  const remaining = await store.countExpired().catch(() => -1);
  return { purged, remaining, budgetExhausted, batches };
}
