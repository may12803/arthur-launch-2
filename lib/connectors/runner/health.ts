export type HealthStatus = 'healthy' | 'stale' | 'failing' | 'not_running';

export interface RunSummary {
  object: string;
  status: 'running' | 'succeeded' | 'failed' | 'partial';
  startedAt: string;
  finishedAt: string | null;
  rowsRead: number;
  rowsWritten: number;
}

export interface Health {
  status: HealthStatus;
  reason: string;
}

export const DEFAULT_STALE_AFTER_MS = 26 * 60 * 60 * 1000;

const rank: Record<HealthStatus, number> = { healthy: 0, stale: 1, failing: 2, not_running: 0 };

/**
 * Per object, judged on its latest finished run:
 *   failed/partial        -> failing
 *   last success too old  -> stale
 *   latest success moved 0 rows -> stale (a connector that "succeeds" with nothing is not proving data flows)
 * The connection reports its worst object. No finished runs at all -> not_running.
 */
export function computeHealth(runs: RunSummary[], now: number, staleAfterMs = DEFAULT_STALE_AFTER_MS): Health {
  const finished = runs.filter((r) => r.status !== 'running' && r.finishedAt);
  if (!finished.length) return { status: 'not_running', reason: 'no sync has finished yet' };
  const objects = [...new Set(finished.map((r) => r.object))];
  let worst: Health = { status: 'healthy', reason: 'last sync succeeded and moved rows' };
  for (const object of objects) {
    const mine = finished.filter((r) => r.object === object).sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!));
    const latest = mine[0];
    const lastSuccess = mine.find((r) => r.status === 'succeeded');
    let h: Health;
    if (latest.status === 'failed' || latest.status === 'partial') {
      h = { status: 'failing', reason: `${object}: latest run ${latest.status}` };
    } else if (!lastSuccess) {
      h = { status: 'failing', reason: `${object}: no successful run yet` };
    } else if (now - Date.parse(lastSuccess.finishedAt!) > staleAfterMs) {
      h = { status: 'stale', reason: `${object}: last success ${Math.round((now - Date.parse(lastSuccess.finishedAt!)) / 3_600_000)}h ago, allowed ${Math.round(staleAfterMs / 3_600_000)}h` };
    } else if (lastSuccess.rowsRead === 0) {
      h = { status: 'stale', reason: `${object}: latest successful run moved 0 rows` };
    } else h = { status: 'healthy', reason: `${object}: last success within window, ${lastSuccess.rowsRead} rows` };
    if (rank[h.status] > rank[worst.status] || (worst.status === 'healthy' && h.status !== 'healthy')) worst = h;
  }
  return worst;
}
